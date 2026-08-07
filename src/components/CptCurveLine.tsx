import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Line, Text } from "@react-three/drei";
import type { Borehole, CptSample } from "../types/borehole";
import { buildCptPolyline, negativeQcRuns, qcLabelFontScale, qcLabelStep } from "../utils/cptCurve";

const CURVE_COLOR = "#0e7490";
const NEG_COLOR = "#cc2222";

// 穩定的空陣列參照:`?? []` 每次 render 都會生成新陣列,讓下面 useMemo 的 deps
// 永遠判定為變動(exhaustive-deps 警告);模組層級常數讓「無曲線」情況的參照穩定。
const EMPTY_CURVE: CptSample[] = [];

interface CptCurveLineProps {
  /** 已是場景局部座標的副本(Scene 轉換後傳進 BoreholeColumn 的那份) */
  borehole: Borehole;
  radius: number;
  qcMax: number;
  showValues: boolean;
  onProfilePointerMove?: (rawDepth: number, clientX: number, clientY: number) => void;
  onProfileClick?: () => void;
}

// CPT qc 常駐折線:Y 軸 billboard(繞垂直軸面向相機,深度軸永遠垂直不失真)。
// 折線/基準線不接 hover 事件;繪製剖面模式下另掛一片透明點選平面(目標比細灰柱
// 大得多),行為與灰柱一致。負值 qc 已在幾何層夾 0,這裡對每個負值深度段標紅字。
export function CptCurveLine({
  borehole,
  radius,
  qcMax,
  showValues,
  onProfilePointerMove,
  onProfileClick,
}: CptCurveLineProps) {
  const groupRef = useRef<THREE.Group>(null);
  const curve = borehole.cptCurve ?? EMPTY_CURVE;
  const maxWidth = radius * 6;
  const gap = radius * 1.2; // 折線基準線與灰柱間留一點空隙
  const g = borehole.groundElevation;
  const maxDepth = curve.length ? curve[curve.length - 1].depth : 0;

  const points = useMemo(() => buildCptPolyline(curve, qcMax, maxWidth), [curve, qcMax, maxWidth]);
  const runs = useMemo(() => negativeQcRuns(curve), [curve]);
  const linePoints = useMemo(
    () => points.map((p) => new THREE.Vector3(gap + p.offset, g - p.depth, 0)),
    [points, gap, g],
  );

  useFrame(({ camera }) => {
    const grp = groupRef.current;
    if (!grp) return;
    const wp = new THREE.Vector3();
    grp.getWorldPosition(wp);
    grp.rotation.y = Math.atan2(camera.position.x - wp.x, camera.position.z - wp.z);
  });

  if (linePoints.length < 2) return null;

  return (
    <group ref={groupRef}>
      <Line
        points={[
          [gap, g, 0],
          [gap, g - maxDepth, 0],
        ]}
        color={CURVE_COLOR}
        lineWidth={1}
        transparent
        opacity={0.5}
      />
      <Line points={linePoints} color={CURVE_COLOR} lineWidth={2} />
      {runs.map((r, i) => (
        <Text
          key={i}
          position={[gap + maxWidth * 0.15, g - (r.topDepth + r.bottomDepth) / 2, 0.01]}
          fontSize={radius}
          color={NEG_COLOR}
          anchorX="left"
          anchorY="middle"
        >
          {"0"}
        </Text>
      ))}
      {showValues && (() => {
        const spacing = curve.length >= 2 ? (curve[curve.length - 1].depth - curve[0].depth) / (curve.length - 1) : 1;
        const fontSize = radius * qcLabelFontScale(curve.length);
        const step = qcLabelStep(spacing, fontSize);
        return curve
          .filter((_, i) => i % step === 0)
          .map((s, i) => (
            <Text
              key={`qc-${i}`}
              position={[gap + maxWidth + radius * 0.4, g - s.depth, 0.01]}
              fontSize={fontSize}
              color={CURVE_COLOR}
              anchorX="left"
              anchorY="middle"
            >
              {s.qc.toFixed(1)}
            </Text>
          ));
      })()}
      {onProfilePointerMove && onProfileClick && (
        <mesh
          position={[gap + maxWidth / 2, g - maxDepth / 2, -0.01]}
          frustumCulled={false}
          onPointerMove={(e) => {
            e.stopPropagation();
            onProfilePointerMove(g - e.point.y, e.nativeEvent.clientX, e.nativeEvent.clientY);
          }}
          onClick={(e) => {
            e.stopPropagation();
            onProfileClick();
          }}
        >
          <planeGeometry args={[maxWidth + gap, maxDepth]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}
