import { useState } from "react";
import { Text } from "@react-three/drei";
import type { Borehole, SoilLayer } from "../types/borehole";
import { snapDepth } from "../utils/depthSnap";
import { effectiveLayerColor, type SoilStyles } from "../utils/soilStyles";
import { CptCurveLine } from "./CptCurveLine";

// 柱子半徑的基準值,對應舊有的小範圍範例資料;真實場地座標範圍動輒數百公尺,若柱子
// 還是固定這麼細,預設鏡頭距離下會細到幾乎看不見(反鋸齒直接抹掉),所以粗細改由
// Scene 依場地實際範圍動態計算後往下傳。
const BASE_RADIUS = 0.6;

// 每個 mesh 都關閉 frustumCulled:座標數值在真實資料下高達數十萬,three.js 預設的
// 視錐體裁剪判斷(用世界座標的包圍球去測試)在這個量級下可能有浮點精度問題,讓部分
// 鑽孔被誤判為視野外而不畫出來——現象在不同機器/CPU 上可能不一致。Grid 元件本身
// 也是同樣理由關閉這個判斷,這裡的鑽孔數量少(數十支),關閉裁剪的效能成本可忽略。

// 繪製剖面時,Scene 只在「有正在加點的線」時才傳這個 prop 進來(profileModeEnabled &&
// activeLineId 都成立),BoreholeColumn/LayerSegment 才會掛載點選事件。
export interface ProfilePicking {
  depthSnapMode: "boundary" | "free";
  activeLineColor: string;
  // 只有目前這支鑽孔正在被預覽時才是非 null 的深度(由 Scene 依 boreholeId 比對後決定)
  previewDepth: number | null;
  onPreview: (boreholeId: string, depth: number, clientX: number, clientY: number) => void;
  onPick: (boreholeId: string) => void;
}

interface LayerSegmentProps {
  layer: SoilLayer;
  groundElevation: number;
  radius: number;
  onHover: (info: { layer: SoilLayer | null; borehole: string } | null) => void;
  boreholeName: string;
  onProfilePointerMove?: (rawDepth: number, clientX: number, clientY: number) => void;
  onProfileClick?: () => void;
  soilStyles: SoilStyles;
}

function LayerSegment({
  layer,
  groundElevation,
  radius,
  onHover,
  boreholeName,
  onProfilePointerMove,
  onProfileClick,
  soilStyles,
}: LayerSegmentProps) {
  const [hovered, setHovered] = useState(false);
  const height = layer.bottomDepth - layer.topDepth;
  // 深度往下 = 高程往下,故柱體中心的高程 = 地表高程 - 平均深度
  const centerElevation = groundElevation - (layer.topDepth + layer.bottomDepth) / 2;
  const displayColor = effectiveLayerColor(layer, soilStyles);

  return (
    <mesh
      position={[0, centerElevation, 0]}
      frustumCulled={false}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        onHover({ layer, borehole: boreholeName });
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHovered(false);
        onHover(null);
      }}
      onPointerMove={
        onProfilePointerMove
          ? (e) => {
              e.stopPropagation();
              onProfilePointerMove(groundElevation - e.point.y, e.nativeEvent.clientX, e.nativeEvent.clientY);
            }
          : undefined
      }
      onClick={
        onProfileClick
          ? (e) => {
              e.stopPropagation();
              onProfileClick();
            }
          : undefined
      }
    >
      <cylinderGeometry args={[radius, radius, height, 24]} />
      <meshStandardMaterial
        color={displayColor}
        emissive={hovered ? displayColor : "#000000"}
        emissiveIntensity={hovered ? 0.4 : 0}
        transparent
        opacity={0.65}
      />
    </mesh>
  );
}

interface CptMarkerColumnProps {
  borehole: Borehole;
  radius: number;
  onHover: (info: { layer: SoilLayer | null; borehole: string } | null) => void;
  onProfilePointerMove?: (rawDepth: number, clientX: number, clientY: number) => void;
  onProfileClick?: () => void;
}

// CPT 測點沒有土層分類,用一根細的半透明灰柱標記位置與貫入深度
function CptMarkerColumn({ borehole, radius, onHover, onProfilePointerMove, onProfileClick }: CptMarkerColumnProps) {
  const [hovered, setHovered] = useState(false);
  const maxDepth = borehole.cptCurve?.length
    ? borehole.cptCurve[borehole.cptCurve.length - 1].depth
    : 1;
  const centerElevation = borehole.groundElevation - maxDepth / 2;

  return (
    <mesh
      position={[0, centerElevation, 0]}
      frustumCulled={false}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        onHover({ layer: null, borehole: borehole.name });
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHovered(false);
        onHover(null);
      }}
      onPointerMove={
        onProfilePointerMove
          ? (e) => {
              e.stopPropagation();
              onProfilePointerMove(
                borehole.groundElevation - e.point.y,
                e.nativeEvent.clientX,
                e.nativeEvent.clientY
              );
            }
          : undefined
      }
      onClick={
        onProfileClick
          ? (e) => {
              e.stopPropagation();
              onProfileClick();
            }
          : undefined
      }
    >
      <cylinderGeometry args={[radius, radius, maxDepth, 16]} />
      <meshStandardMaterial color="#999999" transparent opacity={hovered ? 0.9 : 0.5} />
    </mesh>
  );
}

interface BoreholeColumnProps {
  borehole: Borehole;
  radius: number;
  onHover: (info: { layer: SoilLayer | null; borehole: string } | null) => void;
  profilePicking?: ProfilePicking;
  soilStyles: SoilStyles;
  /** 全場 CPT qc 最大值;null=場上沒有任何 CPT 曲線,不畫折線 */
  qcMax: number | null;
}

export function BoreholeColumn({ borehole, radius, onHover, profilePicking, soilStyles, qcMax }: BoreholeColumnProps) {
  const { x, y, groundElevation, layers, name, sptn, rqd } = borehole;
  const [isHovered, setIsHovered] = useState(false);
  const scale = radius / BASE_RADIUS;
  const labelOffset = radius * 2;
  const nameFontSize = 0.9 * scale;
  const measureFontSize = 0.6 * scale;
  const nameHeight = groundElevation + 1.2 * scale;

  // SPT-N/RQD 常駐標籤只在滑鼠正在 hover 這根鑽孔時才渲染——真實資料一支鑽孔可能有
  // 二三十筆量測值,48 孔同時全部渲染會建立數百個獨立的 3D 文字物件,拖慢匯入後的
  // 首次渲染;改成只在 hover 時渲染可以把同時存在的文字物件數量壓到最多一孔份。
  function handleHover(info: { layer: SoilLayer | null; borehole: string } | null) {
    setIsHovered(info !== null);
    onHover(info);
  }

  function computeSnappedDepth(rawDepth: number): number {
    if (!profilePicking) return rawDepth;
    return snapDepth(
      rawDepth,
      layers,
      profilePicking.depthSnapMode,
      borehole.cptCurve?.map((s) => s.depth),
    );
  }

  function handleProfilePointerMove(rawDepth: number, clientX: number, clientY: number) {
    if (!profilePicking) return;
    profilePicking.onPreview(borehole.id, computeSnappedDepth(rawDepth), clientX, clientY);
  }

  function handleProfileClick() {
    if (!profilePicking) return;
    profilePicking.onPick(borehole.id);
  }

  const previewElevation =
    profilePicking?.previewDepth != null ? groundElevation - profilePicking.previewDepth : null;

  return (
    <group position={[x, 0, y]}>
      {layers.length > 0 ? (
        layers.map((layer, i) => (
          <LayerSegment
            key={i}
            layer={layer}
            groundElevation={groundElevation}
            radius={radius}
            onHover={handleHover}
            boreholeName={name}
            onProfilePointerMove={profilePicking ? handleProfilePointerMove : undefined}
            onProfileClick={profilePicking ? handleProfileClick : undefined}
            soilStyles={soilStyles}
          />
        ))
      ) : (
        <>
          <CptMarkerColumn
            borehole={borehole}
            radius={radius / 2}
            onHover={handleHover}
            onProfilePointerMove={profilePicking ? handleProfilePointerMove : undefined}
            onProfileClick={profilePicking ? handleProfileClick : undefined}
          />
          {qcMax !== null && borehole.cptCurve && borehole.cptCurve.length >= 2 && (
            <CptCurveLine
              borehole={borehole}
              radius={radius}
              qcMax={qcMax}
              showValues={isHovered}
              onProfilePointerMove={profilePicking ? handleProfilePointerMove : undefined}
              onProfileClick={profilePicking ? handleProfileClick : undefined}
            />
          )}
        </>
      )}

      {previewElevation != null && profilePicking && (
        <mesh position={[0, previewElevation, 0]} frustumCulled={false}>
          <sphereGeometry args={[radius * 0.5, 12, 12]} />
          <meshBasicMaterial color={profilePicking.activeLineColor} />
        </mesh>
      )}

      {isHovered && sptn?.map((m, i) => (
        <Text
          key={`spt-${i}`}
          position={[labelOffset, groundElevation - (m.topDepth + m.bottomDepth) / 2, 0]}
          fontSize={measureFontSize}
          color="#1a5fb4"
          anchorX="left"
          anchorY="middle"
        >
          {`N=${m.nValue}`}
        </Text>
      ))}

      {isHovered && rqd?.map((seg, i) => (
        <Text
          key={`rqd-${i}`}
          position={[-labelOffset, groundElevation - (seg.topDepth + seg.bottomDepth) / 2, 0]}
          fontSize={measureFontSize}
          color="#9a3324"
          anchorX="right"
          anchorY="middle"
        >
          {`RQD ${seg.rqd}%`}
        </Text>
      ))}

      <Text
        position={[0, nameHeight, 0]}
        fontSize={nameFontSize}
        color="#222222"
        anchorX="center"
        anchorY="bottom"
      >
        {name}
      </Text>
    </group>
  );
}

interface HoverTooltipProps {
  info: { layer: SoilLayer | null; borehole: string } | null;
}

// 純 HTML overlay,渲染在 Canvas 外層,避免受 3D 相機投影影響
export function HoverTooltip({ info }: HoverTooltipProps) {
  if (!info) return null;
  const { layer, borehole } = info;
  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: 16,
        background: "rgba(30,30,30,0.9)",
        color: "#fff",
        padding: "8px 12px",
        borderRadius: 6,
        fontSize: 13,
        lineHeight: 1.5,
        fontFamily: "sans-serif",
        pointerEvents: "none",
      }}
    >
      <div><strong>{borehole}</strong></div>
      {layer && (
        <>
          <div>{layer.soilType}</div>
          <div>深度 {layer.topDepth} ~ {layer.bottomDepth} m</div>
          {layer.note && <div>{layer.note}</div>}
        </>
      )}
    </div>
  );
}
