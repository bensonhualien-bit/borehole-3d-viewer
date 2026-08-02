import { colorStopsAsCss, computeLegendTicks } from "../utils/contour/colorScale";

export interface ContourLegendExtent {
  min: number;
  max: number;
  lineName: string;
}

interface ContourLegendProps {
  extent: ContourLegendExtent | null;
}

// 跟 SoilLegend 同樣的深色浮動面板風格,兩者在 App.tsx 用同一個 flex 容器並排,
// 不需要各自寫死 position/top/left 去猜對方的寬度。
export function ContourLegend({ extent }: ContourLegendProps) {
  if (!extent) return null;

  // 由上而下:高值在上、低值在下,所以刻度文字要反過來排(漸層條本身用
  // CSS "to top" 已經是低值在下、高值在上,刻度文字要對齊同一個視覺方向)。
  const ticks = [...computeLegendTicks(extent.min, extent.max)].reverse();
  const gradient = `linear-gradient(to top, ${colorStopsAsCss().join(", ")})`;

  return (
    <div
      style={{
        background: "rgba(30,30,30,0.85)",
        color: "#fff",
        padding: "12px 14px",
        borderRadius: 8,
        fontSize: 13,
        fontFamily: "sans-serif",
        pointerEvents: "none",
      }}
    >
      <div style={{ fontWeight: "bold" }}>
        等高線圖例{" "}
        <span style={{ fontWeight: "normal", fontSize: 11, opacity: 0.7 }}>EL (m)</span>
      </div>
      <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 8 }}>{extent.lineName}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ width: 16, height: 140, borderRadius: 3, background: gradient }} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            height: 140,
            fontSize: 11,
          }}
        >
          {ticks.map((v, i) => (
            <span key={i}>{v.toFixed(1)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
