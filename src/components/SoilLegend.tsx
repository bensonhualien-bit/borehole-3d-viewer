import { useState } from "react";
import { USCS_COLORS } from "../utils/soilColors";
import { effectiveCodeColor, type SoilStyles } from "../utils/soilStyles";
import { SoilColorDialog } from "./SoilColorDialog";

interface SoilLegendProps {
  soilStyles: SoilStyles;
  onColorChange: (code: string, color: string) => void;
  onResetColors: () => void;
  error?: string | null;
}

export function SoilLegend({ soilStyles, onColorChange, onResetColors, error }: SoilLegendProps) {
  const hasOverrides = Object.keys(soilStyles).length > 0;
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [focusedCode, setFocusedCode] = useState<string | null>(null);
  // 正在挑色的代碼;點另一個色塊時直接切換(未確認的選擇隨 key 重掛而丟棄)
  const [dialogCode, setDialogCode] = useState<string | null>(null);
  return (
    <div
      style={{
        background: "rgba(30,30,30,0.85)",
        color: "#fff",
        padding: "12px 14px",
        borderRadius: 8,
        fontSize: 13,
        fontFamily: "sans-serif",
        maxWidth: 220,
        // 外層容器(App.tsx 的圖例 wrapper)是 pointerEvents:"none" 讓點擊穿透到
        // 3D 場景。根節點不再整塊蓋成 auto(那樣會擋住整個 ~220px 面板範圍內的
        // OrbitControls 拖曳),改成讓根節點繼承 wrapper 的 none,只在真正需要互動
        // 的 button(色票、恢復預設)上各自設回 auto。
      }}
    >
      <div style={{ marginBottom: 8, fontWeight: "bold" }}>地層圖例</div>
      {Object.entries(USCS_COLORS).map(([code, { label }]) => {
        const isActive = hoveredCode === code || focusedCode === code || dialogCode === code;
        return (
          <div key={code} style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
            <button
              type="button"
              aria-label={`自訂 ${code} 顏色`}
              title="點擊自訂顏色"
              onClick={() => setDialogCode(code)}
              onMouseEnter={() => setHoveredCode(code)}
              onMouseLeave={() => setHoveredCode((c) => (c === code ? null : c))}
              onFocus={() => setFocusedCode(code)}
              onBlur={() => setFocusedCode((c) => (c === code ? null : c))}
              style={{
                cursor: "pointer",
                flexShrink: 0,
                marginRight: 8,
                display: "inline-flex",
                padding: 0,
                border: "none",
                background: "transparent",
                pointerEvents: "auto",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 16,
                  height: 16,
                  background: effectiveCodeColor(code, soilStyles),
                  borderRadius: 3,
                  border: isActive ? "1px solid #fff" : "1px solid rgba(255,255,255,0.5)",
                  boxShadow: isActive ? "0 0 4px rgba(255,255,255,0.9)" : undefined,
                }}
              />
            </button>
            <span style={{ fontWeight: "bold", marginRight: 6 }}>{code}</span>
            <span style={{ opacity: 0.85 }}>{label}</span>
          </div>
        );
      })}
      {hasOverrides && (
        <button
          onClick={onResetColors}
          style={{
            marginTop: 8,
            width: "100%",
            padding: "4px 0",
            fontSize: 12,
            background: "rgba(255,255,255,0.15)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.35)",
            borderRadius: 4,
            cursor: "pointer",
            pointerEvents: "auto",
          }}
        >
          恢復預設顏色
        </button>
      )}
      {error && <div style={{ color: "#ff9d9d", marginTop: 8 }}>{error}</div>}
      {dialogCode && (
        <SoilColorDialog
          key={dialogCode}
          code={dialogCode}
          label={USCS_COLORS[dialogCode]?.label ?? dialogCode}
          currentColor={effectiveCodeColor(dialogCode, soilStyles)}
          onConfirm={(color) => {
            onColorChange(dialogCode, color);
            setDialogCode(null);
          }}
          onClose={() => setDialogCode(null)}
        />
      )}
    </div>
  );
}
