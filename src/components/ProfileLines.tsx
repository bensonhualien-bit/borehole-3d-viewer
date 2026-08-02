import { useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { Line, Text } from "@react-three/drei";
import * as THREE from "three";
import type { Borehole } from "../types/borehole";
import type { ProfileLine, ProfilePoint } from "../utils/profileStorage";

interface ResolvedPoint {
  originalIndex: number;
  x: number;
  y: number;
  z: number;
}

// 找不到對應鑽孔的點直接跳過,不中斷整條線的渲染;保留 originalIndex 是因為拖動點時
// 需要對回 line.points 原本的索引,略過幾個點後陣列會變短,不能再假設「濾掉後的
// 第 i 個」等於「原始第 i 個」。
function resolveCenterPoints(
  points: ProfilePoint[],
  boreholes: Borehole[],
  centerX: number,
  centerZ: number
): ResolvedPoint[] {
  const resolved: ResolvedPoint[] = [];
  points.forEach((p, originalIndex) => {
    const borehole = boreholes.find((b) => b.id === p.boreholeId);
    if (!borehole) return;
    resolved.push({
      originalIndex,
      x: borehole.x - centerX,
      y: borehole.groundElevation - p.depth,
      // Three.js 是右手座標系(X×Y=Z);這裡 X=東、Y=上,所以 Z 在幾何上代表南,不是北。
      // 直接塞真實北座標(borehole.y)會讓「北」被畫在「南」的方向,整個南北顛倒——
      // 取負號(centerZ - borehole.y)才是跟東西向一致、真正對應真實世界方位的畫法。
      z: centerZ - borehole.y,
    });
  });
  return resolved;
}

interface OffsetPoint {
  originalIndex: number;
  position: [number, number, number];
}

// 每個新點會跟這條線上「所有已存在的點」兩兩連線(不只是點選順序上的前後一個),
// 例如依序點 A、B、C,系統自動連好 A-B、B-C、A-C 三段——不需要使用者自己想連線
// 順序,點選順序只影響「悔恨上一點」要刪哪一個,不影響連線關係。
//
// 每一段連線都各自沿著「這兩個端點之間」的方向偏移 radius 距離,貼齊柱體外緣、
// 不穿過柱體中心軸——同一個點如果連到好幾個其他點,每一段自己算自己的偏移方向,
// 不會互相影響。回傳扁平陣列給 drei 的 <Line segments> 用,每兩個相鄰元素是
// 獨立的一段(不會連成一條整體折線)。
function buildEdgeSegments(points: ResolvedPoint[], radius: number): [number, number, number][] {
  const flat: [number, number, number][] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i];
      const b = points[j];
      const dirX = b.x - a.x;
      const dirZ = b.z - a.z;
      const len = Math.hypot(dirX, dirZ);
      const aPos: [number, number, number] =
        len < 1e-6 ? [a.x, a.y, a.z] : [a.x + (dirX / len) * radius, a.y, a.z + (dirZ / len) * radius];
      const bPos: [number, number, number] =
        len < 1e-6 ? [b.x, b.y, b.z] : [b.x - (dirX / len) * radius, b.y, b.z - (dirZ / len) * radius];
      flat.push(aPos, bPos);
    }
  }
  return flat;
}

// 可拖動的標記球(每個點一顆,不是每段連線一顆):方向改成「這個點連到的所有其他點」
// 的平均方向,一律朝著鄰居的方向偏移——3 個點以上則是好幾個方向的合力。這跟舊版
// 路徑寫法不完全一樣:舊版只有終點(沒有 next 的那個點)是往「遠離上一個點」的方向
// 偏移,新版一律朝鄰居偏移,兩個點時第二個點的偏移方向會左右相反(但都貼在柱體
// 邊緣,純粹是標記球的視覺位置,不影響任何邏輯)。方向抵消為零(例如鄰居剛好對稱
// 分佈)或完全沒有其他點時,退回中心軸位置不偏移,和邊線偏移函式失敗時的退回邏輯一致。
function offsetMarkerPositions(points: ResolvedPoint[], radius: number): OffsetPoint[] {
  return points.map((point) => {
    let sumX = 0;
    let sumZ = 0;
    for (const other of points) {
      if (other === point) continue;
      const dx = other.x - point.x;
      const dz = other.z - point.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      sumX += dx / len;
      sumZ += dz / len;
    }
    const len = Math.hypot(sumX, sumZ);
    const position: [number, number, number] =
      len < 1e-6
        ? [point.x, point.y, point.z]
        : [point.x + (sumX / len) * radius, point.y, point.z + (sumZ / len) * radius];
    return { originalIndex: point.originalIndex, position };
  });
}

interface DragInfo {
  lineId: string;
  pointIndex: number;
  boreholeId: string;
  anchorX: number;
  anchorZ: number;
}

interface ProfileLinesProps {
  lines: ProfileLine[];
  boreholes: Borehole[];
  columnRadius: number;
  centerX: number;
  centerZ: number;
  profileModeEnabled: boolean;
  onDragPointDepth: (lineId: string, pointIndex: number, depth: number) => void;
}

export function ProfileLines({
  lines,
  boreholes,
  columnRadius,
  centerX,
  centerZ,
  profileModeEnabled,
  onDragPointDepth,
}: ProfileLinesProps) {
  const { camera, gl, controls } = useThree();
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);
  const [liveDepth, setLiveDepth] = useState<number | null>(null);
  // handlePointerUp 需要讀「拖曳過程中最新的深度」,但它是在 dragInfo 剛變成
  // non-null 那一刻註冊的事件監聽器,閉包裡的 liveDepth state 永遠是註冊當下的
  // 舊值(標準的 React 事件監聽器閉包過期問題)。用 ref 額外存一份最新值,
  // handlePointerMove 每次都更新它,handlePointerUp 就能讀到最新的,不是過期的。
  const liveDepthRef = useRef<number | null>(null);
  const raycaster = useRef(new THREE.Raycaster());
  const dragPlane = useRef(new THREE.Plane());

  useEffect(() => {
    if (!dragInfo) return;
    // dragInfo 被下面幾個 function 宣告(會 hoist)捕捉時,TypeScript 的流程分析不會
    // 保留上面這行 null 檢查narrowing 的結果(hoisted function 從語法上可能在檢查之前
    // 被呼叫,編譯器保守地認為 dragInfo 仍可能是 null)。額外存一份已確定非 null 的
    // 區域變數,單純是為了讓型別檢查通過,語意上跟直接用 dragInfo 完全一樣。
    const info = dragInfo;

    // 用一個「通過這支鑽孔的鉛直軸、朝向相機」的數學平面求交點,只取交點的 y 當新深度,
    // x/z 忽略不用(渲染時本來就固定用 anchorX/anchorZ,不會因為滑鼠不在正上方而偏移)。
    // 跟 SitePlanPlane.tsx 拖曳配置圖用的 raycaster.ray.intersectPlane 手法一致,
    // 只是那裡的平面是水平的(限制 x/z、y 固定),這裡反過來是垂直的(限制 y、x/z 固定)。
    function pointerToDepth(clientX: number, clientY: number): number | null {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.current.setFromCamera(ndc, camera);
      const toCamera = new THREE.Vector3(
        camera.position.x - info.anchorX,
        0,
        camera.position.z - info.anchorZ
      );
      if (toCamera.lengthSq() < 1e-6) toCamera.set(1, 0, 0);
      toCamera.normalize();
      dragPlane.current.setFromNormalAndCoplanarPoint(
        toCamera,
        new THREE.Vector3(info.anchorX, 0, info.anchorZ)
      );
      const target = new THREE.Vector3();
      if (!raycaster.current.ray.intersectPlane(dragPlane.current, target)) return null;
      const borehole = boreholes.find((b) => b.id === info.boreholeId);
      if (!borehole) return null;
      return borehole.groundElevation - target.y;
    }

    function handlePointerMove(e: PointerEvent) {
      const depth = pointerToDepth(e.clientX, e.clientY);
      if (depth !== null) {
        liveDepthRef.current = depth;
        setLiveDepth(depth);
      }
    }

    function handlePointerUp() {
      if (liveDepthRef.current !== null) {
        onDragPointDepth(info.lineId, info.pointIndex, liveDepthRef.current);
      }
      setDragInfo(null);
      setLiveDepth(null);
      liveDepthRef.current = null;
      if (controls) (controls as unknown as { enabled: boolean }).enabled = true;
      gl.domElement.style.cursor = "auto";
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      // 確保就算元件在拖曳中被卸載,鏡頭控制與游標樣式仍會被還原,不會卡在停用狀態
      if (controls) (controls as unknown as { enabled: boolean }).enabled = true;
      gl.domElement.style.cursor = "auto";
    };
  }, [dragInfo, camera, gl, controls, boreholes, onDragPointDepth]);

  return (
    <>
      {lines
        .filter((line) => line.visible)
        .map((line) => {
          // 拖曳中的那個點,渲染時暫時套用即時深度(liveDepth),還沒放開滑鼠不會
          // 寫回 profileData,只有畫面上跟著滑鼠移動的視覺回饋
          const effectivePoints =
            dragInfo?.lineId === line.id && liveDepth !== null
              ? line.points.map((p, i) => (i === dragInfo.pointIndex ? { ...p, depth: liveDepth } : p))
              : line.points;
          const resolved = resolveCenterPoints(effectivePoints, boreholes, centerX, centerZ);
          if (resolved.length === 0) return null;
          const edgeSegments = buildEdgeSegments(resolved, columnRadius);
          const markerEntries = offsetMarkerPositions(resolved, columnRadius);
          return (
            <group key={line.id}>
              {edgeSegments.length > 0 && (
                <Line points={edgeSegments} segments color={line.color} lineWidth={2} />
              )}
              {profileModeEnabled &&
                markerEntries.map((entry) => {
                  const isBeingDragged =
                    dragInfo?.lineId === line.id && dragInfo.pointIndex === entry.originalIndex;
                  return (
                    <group key={entry.originalIndex}>
                      <mesh
                        position={entry.position}
                        frustumCulled={false}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          if (!controls) return;
                          (controls as unknown as { enabled: boolean }).enabled = false;
                          gl.domElement.style.cursor = "grabbing";
                          setDragInfo({
                            lineId: line.id,
                            pointIndex: entry.originalIndex,
                            boreholeId: line.points[entry.originalIndex].boreholeId,
                            anchorX: entry.position[0],
                            anchorZ: entry.position[2],
                          });
                        }}
                        onPointerOver={() => {
                          if (!dragInfo) gl.domElement.style.cursor = "grab";
                        }}
                        onPointerOut={() => {
                          if (!dragInfo) gl.domElement.style.cursor = "auto";
                        }}
                      >
                        <sphereGeometry args={[columnRadius * 0.4, 12, 12]} />
                        <meshStandardMaterial color={line.color} />
                      </mesh>
                      {/* 拖動中即時顯示這個點目前調整到的深度,讓使用者確定拉到哪裡去了,
                          放開滑鼠前只是視覺預覽,還沒寫回 profileData */}
                      {isBeingDragged && liveDepth !== null && (
                        <Text
                          position={[
                            entry.position[0] + columnRadius * 1.5,
                            entry.position[1],
                            entry.position[2],
                          ]}
                          fontSize={columnRadius * 0.7}
                          color="#ffffff"
                          anchorX="left"
                          anchorY="middle"
                          outlineWidth={columnRadius * 0.05}
                          outlineColor="#000000"
                        >
                          {`${liveDepth.toFixed(2)}m`}
                        </Text>
                      )}
                    </group>
                  );
                })}
            </group>
          );
        })}
    </>
  );
}
