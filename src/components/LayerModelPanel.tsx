import { useState } from "react";
import type { ProfileData, ProfileLayer } from "../utils/profileStorage";
import {
  DEFAULT_MODEL_SETTINGS,
  resolveLayerStyle,
  type ModelSettings,
} from "../utils/model/modelSettings";

interface LayerModelPanelProps {
  profileData: ProfileData;
  settings: ModelSettings;
  onChange: (s: ModelSettings) => void;
  /** key 為 layerId;undefined/缺項 = 尚無回報。null = 該地層目前無法建模(點數不足) */
  pinchOutByLayer: Record<string, number | null>;
  /** 等高線的全域內插法——實體跟隨它,這裡只顯示不切換(切換入口在剖面線面板) */
  contourInterpolator: "tin" | "kriging";
}

// 一個地層要能建 3D 實體,頂/底界都必須已指定(null 表示尚未指定,是合法的
// 過渡狀態,不是錯誤)。
function modelableLayers(profileData: ProfileData): ProfileLayer[] {
  return profileData.layers.filter(
    (layer) => layer.topBoundaryId !== null && layer.bottomBoundaryId !== null,
  );
}

// 3D 地層建模控制面板:刻意獨立於 ProfileDrawer 之外的新面板——分層功能已公開
// 發布,其面板不再長大;建模日後的擴充(體積計算、模型匯出…)也都收在這裡。
export function LayerModelPanel({
  profileData,
  settings,
  onChange,
  pinchOutByLayer,
  contourInterpolator,
}: LayerModelPanelProps) {
  const [collapsed, setCollapsed] = useState(true);
  const layers = modelableLayers(profileData);

  const panelStyle: React.CSSProperties = {
    background: "rgba(30,30,30,0.85)",
    color: "#fff",
    padding: "10px 12px",
    borderRadius: 8,
    fontSize: 12,
    fontFamily: "sans-serif",
    width: 230,
    pointerEvents: "auto",
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        style={{ ...panelStyle, width: undefined, cursor: "pointer", border: "1px solid #666" }}
      >
        3D 地層建模 ▾
      </button>
    );
  }

  const setLayerStyle = (layerId: string, patch: Partial<{ showSolid: boolean; opacity: number }>) => {
    const current = resolveLayerStyle(settings, layerId);
    onChange({
      ...settings,
      layerStyles: { ...settings.layerStyles, [layerId]: { ...current, ...patch } },
    });
  };

  return (
    <div style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontWeight: "bold" }}>3D 地層建模</span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 12 }}
        >
          ▴ 收合
        </button>
      </div>

      <div style={{ marginBottom: 8, fontSize: 11, color: "#bbb" }}>
        內插法:{contourInterpolator === "kriging" ? "Kriging" : "TIN"}(跟隨等高線設定,可在剖面線面板切換)
      </div>

      <label style={{ display: "block", marginBottom: 10 }}>
        外插範圍 {(settings.extrapolationRatio * 100).toFixed(0)}%(鑽孔範圍對角線)
        <input
          type="range"
          min={0}
          max={30}
          step={1}
          value={settings.extrapolationRatio * 100}
          onChange={(e) => onChange({ ...settings, extrapolationRatio: Number(e.target.value) / 100 })}
          style={{ width: "100%" }}
        />
        {contourInterpolator === "tin" && (
          <span style={{ color: "#bbb" }}>TIN 外插:以鑽孔範圍邊緣的高程往外攤平延伸</span>
        )}
      </label>

      {layers.length === 0 && (
        <div style={{ color: "#bbb", lineHeight: 1.6 }}>
          尚無可建模的地層。
          <br />
          請先在「剖面線」面板建立地層群組(指定頂界與底界兩條邊界線)。
        </div>
      )}

      {layers.map((layer) => {
        const style = resolveLayerStyle(settings, layer.id);
        const pinchOut = pinchOutByLayer[layer.id];
        return (
          <div
            key={layer.id}
            style={{ borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: 8, marginBottom: 8 }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={style.showSolid}
                onChange={(e) => setLayerStyle(layer.id, { showSolid: e.target.checked })}
              />
              <span
                style={{
                  width: 12,
                  height: 12,
                  background: layer.color,
                  borderRadius: 2,
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {layer.name}
              </span>
            </label>
            {style.showSolid && (
              <>
                <label style={{ display: "block", marginTop: 4, marginLeft: 18 }}>
                  透明度 {(style.opacity * 100).toFixed(0)}%
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={style.opacity * 100}
                    onChange={(e) => setLayerStyle(layer.id, { opacity: Number(e.target.value) / 100 })}
                    style={{ width: "100%" }}
                  />
                </label>
                {pinchOut === null && (
                  <div style={{ color: "#f0a050", marginLeft: 18, marginTop: 2 }}>
                    無法建模:頂/底界面各需至少 3 個不共線的點
                  </div>
                )}
                {typeof pinchOut === "number" && pinchOut > 0 && (
                  <div style={{ color: "#f0d060", marginLeft: 18, marginTop: 2 }}>
                    {(pinchOut * 100).toFixed(0)}% 區域尖滅(頂界低於底界,厚度已歸零)
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      {settings.extrapolationRatio !== DEFAULT_MODEL_SETTINGS.extrapolationRatio && (
        <button
          type="button"
          onClick={() => onChange({ ...settings, extrapolationRatio: DEFAULT_MODEL_SETTINGS.extrapolationRatio })}
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
          外插範圍恢復預設(10%)
        </button>
      )}
    </div>
  );
}
