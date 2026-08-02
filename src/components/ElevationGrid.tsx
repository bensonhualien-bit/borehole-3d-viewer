import { useEffect, useMemo } from "react";
import { Text } from "@react-three/drei";
import * as THREE from "three";

interface ElevationGridProps {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minElevation: number;
  maxElevation: number;
}

// 場地四周立 4 面垂直網格牆(東西南北)。顏色沿用既有地面網格(Scene.tsx 的
// GroundGrid)的 cellColor/sectionColor 色碼,維持視覺上「同一套網格系統」的一致感。
const MINOR_COLOR = "#cccccc";
const MAJOR_COLOR = "#999999";

function buildElevationLevels(minElevation: number, maxElevation: number): number[] {
  const start = Math.ceil(minElevation);
  const end = Math.floor(maxElevation);
  const levels: number[] = [];
  for (let e = start; e <= end; e++) levels.push(e);
  return levels;
}

// 每一層樓面 4 面牆各自的一段水平線,攤平成一份共用的頂點陣列——原本每一層、每一面牆
// 各自是一個獨立的 drei <Line>(內部用 Line2 這種「粗線」技術,每個都是自己的 draw
// call)。真實案場的高程範圍動輒六七十公尺,等於六七十層 x 4 面牆 = 兩三百個獨立物件,
// 拖曳旋轉視角時每一幀都要重新走訪、送出這麼多 draw call,實測會把幀率砍半(140fps
// 降到 74fps)。這裡改成同一組線寬(主線/次線各一批)合併成一個 BufferGeometry、一次
// draw call 畫完,視覺結果不變(線寬本來就只有 1~1.5px,一般瀏覽器/顯卡對原生線段的
// 寬度上限本來就接近 1px,粗線技術在這裡本來就沒有額外視覺效果),但物件數從兩三百
// 降到 2 個。
function buildWallPositions(levels: number[], minX: number, maxX: number, minZ: number, maxZ: number): Float32Array {
  const positions = new Float32Array(levels.length * 4 * 2 * 3);
  let offset = 0;
  function push(x: number, y: number, z: number) {
    positions[offset++] = x;
    positions[offset++] = y;
    positions[offset++] = z;
  }
  for (const elevation of levels) {
    push(minX, elevation, minZ);
    push(maxX, elevation, minZ); // 南牆
    push(minX, elevation, maxZ);
    push(maxX, elevation, maxZ); // 北牆
    push(minX, elevation, minZ);
    push(minX, elevation, maxZ); // 西牆
    push(maxX, elevation, minZ);
    push(maxX, elevation, maxZ); // 東牆
  }
  return positions;
}

// LineDashedMaterial 需要每個頂點的累積線段距離(lineDistance attribute)才能算虛線的
// 實/虛間隔。THREE.BufferGeometry 本身沒有 computeLineDistances 方法——那是
// THREE.Line 實例的方法,以「整條連續折線」為單位累加距離,不適用於我們這種每兩點
// 一段、彼此不相連的 LineSegments(用在整條折線上的方法會讓距離跨段累加,虛線相位
// 逐段跑掉)。這裡改成逐段自算:每一段各自從 0 開始到自身長度,讓每一段的虛線
// 起點都一致。
function buildLineDistances(positions: Float32Array): Float32Array {
  const distances = new Float32Array(positions.length / 3);
  for (let seg = 0; seg < distances.length; seg += 2) {
    const ax = positions[seg * 3], ay = positions[seg * 3 + 1], az = positions[seg * 3 + 2];
    const bx = positions[(seg + 1) * 3], by = positions[(seg + 1) * 3 + 1], bz = positions[(seg + 1) * 3 + 2];
    distances[seg] = 0;
    distances[seg + 1] = Math.hypot(bx - ax, by - ay, bz - az);
  }
  return distances;
}

function useWallGeometry(levels: number[], minX: number, maxX: number, minZ: number, maxZ: number, dashed: boolean) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions = buildWallPositions(levels, minX, maxX, minZ, maxZ);
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    if (dashed) g.setAttribute("lineDistance", new THREE.BufferAttribute(buildLineDistances(positions), 1));
    return g;
  }, [levels, minX, maxX, minZ, maxZ, dashed]);

  // BufferGeometry 配置的 GPU 緩衝不會隨 React 元件卸載自動釋放,props 變動(例如切換
  // 鑽孔選取範圍改變高程範圍)會讓 useMemo 建立新的 geometry——上一份沒人再參照,
  // 手動 dispose 避免每次都留下不會被回收的 GPU 緩衝。
  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  return geometry;
}

export function ElevationGrid({ minX, maxX, minZ, maxZ, minElevation, maxElevation }: ElevationGridProps) {
  const levels = useMemo(() => buildElevationLevels(minElevation, maxElevation), [minElevation, maxElevation]);
  const majorLevels = useMemo(() => levels.filter((e) => e % 5 === 0), [levels]);
  const minorLevels = useMemo(() => levels.filter((e) => e % 5 !== 0), [levels]);
  const labelFontSize = Math.max((maxX - minX) * 0.015, 0.5);

  const majorGeometry = useWallGeometry(majorLevels, minX, maxX, minZ, maxZ, false);
  const minorGeometry = useWallGeometry(minorLevels, minX, maxX, minZ, maxZ, true);

  return (
    <group>
      {majorLevels.length > 0 && (
        <lineSegments geometry={majorGeometry}>
          <lineBasicMaterial color={MAJOR_COLOR} transparent opacity={0.6} />
        </lineSegments>
      )}
      {minorLevels.length > 0 && (
        <lineSegments geometry={minorGeometry}>
          <lineDashedMaterial color={MINOR_COLOR} transparent opacity={0.35} dashSize={1} gapSize={0.5} />
        </lineSegments>
      )}
      {majorLevels.map((elevation) => (
        <Text
          key={elevation}
          position={[minX, elevation, minZ]}
          fontSize={labelFontSize}
          color={MAJOR_COLOR}
          anchorX="right"
          anchorY="bottom"
        >
          {`${elevation}m`}
        </Text>
      ))}
    </group>
  );
}
