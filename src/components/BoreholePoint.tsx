import { useState } from "react";
import { Text } from "@react-three/drei";
import type { Borehole, SoilLayer } from "../types/borehole";

// 對應舊有小範圍範例資料的基準點位半徑;真實場地座標範圍動輒數百公尺時,由 Scene
// 依場地實際範圍動態放大後往下傳,避免點位在預設鏡頭距離下細到看不見。
const BASE_POINT_RADIUS = 0.8;

interface BoreholePointProps {
  borehole: Borehole;
  radius: number;
  onHover: (info: { layer: SoilLayer | null; borehole: string } | null) => void;
}

export function BoreholePoint({ borehole, radius, onHover }: BoreholePointProps) {
  const [hovered, setHovered] = useState(false);
  const { x, y, groundElevation, name } = borehole;
  const scale = radius / BASE_POINT_RADIUS;

  return (
    <group position={[x, groundElevation, y]}>
      <mesh
        frustumCulled={false}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          onHover({ layer: null, borehole: name });
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          onHover(null);
        }}
      >
        <sphereGeometry args={[radius, 16, 16]} />
        <meshStandardMaterial
          color="#4a90d9"
          emissive={hovered ? "#4a90d9" : "#000000"}
          emissiveIntensity={hovered ? 0.4 : 0}
        />
      </mesh>
      <Text
        position={[0, radius + 0.6 * scale, 0]}
        fontSize={0.9 * scale}
        color="#222222"
        anchorX="center"
        anchorY="bottom"
      >
        {name}
      </Text>
    </group>
  );
}
