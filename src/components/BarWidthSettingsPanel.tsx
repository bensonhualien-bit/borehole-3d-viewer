import { useState } from "react";
import { DEFAULT_BAR_WIDTH_SETTINGS, type BarWidthSettings } from "../utils/barWidth";
import { loadBarWidthPanelCollapsed, saveBarWidthPanelCollapsed } from "../utils/barWidthPanelStorage";

interface BarWidthSettingsPanelProps {
  settings: BarWidthSettings;
  onChange: (s: BarWidthSettings) => void;
}

const isDefault = (s: BarWidthSettings) =>
  s.maxFraction === DEFAULT_BAR_WIDTH_SETTINGS.maxFraction &&
  s.spacingFactor === DEFAULT_BAR_WIDTH_SETTINGS.spacingFactor;

export function BarWidthSettingsPanel({ settings, onChange }: BarWidthSettingsPanelProps) {
  const [collapsed, setCollapsed] = useState(() => loadBarWidthPanelCollapsed());
  const toggle = (next: boolean) => {
    setCollapsed(next);
    saveBarWidthPanelCollapsed(next);
  };
  const panelStyle: React.CSSProperties = {
    background: "rgba(30,30,30,0.85)",
    color: "#fff",
    padding: "10px 12px",
    borderRadius: 8,
    fontSize: 12,
    fontFamily: "sans-serif",
    width: 210,
    pointerEvents: "auto",
  };
  if (collapsed) {
    return (
      <button type="button" onClick={() => toggle(false)} style={{ ...panelStyle, width: undefined, cursor: "pointer", border: "1px solid #666" }}>
        柱寬設定 ▾
      </button>
    );
  }
  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontWeight: "bold" }}>柱寬設定</span>
        <button
          type="button"
          onClick={() => toggle(true)}
          style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 12 }}
        >
          ▴ 收合
        </button>
      </div>
      <label style={{ display: "block", marginBottom: 8 }}>
        柱寬上限 {(settings.maxFraction * 100).toFixed(1)}%(跨距)
        <input
          type="range"
          min={0.5}
          max={5}
          step={0.1}
          value={settings.maxFraction * 100}
          onChange={(e) => onChange({ ...settings, maxFraction: Number(e.target.value) / 100 })}
          style={{ width: "100%" }}
        />
      </label>
      <label style={{ display: "block", marginBottom: 8 }}>
        密度係數 {settings.spacingFactor.toFixed(2)}(平均間距×)
        <input
          type="range"
          min={0.1}
          max={0.8}
          step={0.05}
          value={settings.spacingFactor}
          onChange={(e) => onChange({ ...settings, spacingFactor: Number(e.target.value) })}
          style={{ width: "100%" }}
        />
      </label>
      {!isDefault(settings) && (
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_BAR_WIDTH_SETTINGS })}
          style={{
            width: "100%",
            padding: "4px 0",
            fontSize: 12,
            background: "rgba(255,255,255,0.15)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.35)",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          恢復預設(2% / 0.35)
        </button>
      )}
    </div>
  );
}
