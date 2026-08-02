import { useState } from "react";
import type { Borehole } from "../types/borehole";
import type { ProfileLayer, ProfileLine } from "../utils/profileStorage";
import type { ContourSettings } from "../utils/contour/contourSettings";
import { lineHasEnoughPointsForContour, resolveVariogramPreview } from "../utils/contour/resolveContourPoints";

const buttonStyle: React.CSSProperties = {
  fontSize: 12,
  padding: "4px 8px",
  cursor: "pointer",
  borderRadius: 4,
  border: "1px solid #666",
  background: "#222",
  color: "#fff",
};

interface ProfileDrawerProps {
  profileModeEnabled: boolean;
  onToggleProfileMode: (enabled: boolean) => void;
  depthSnapMode: "boundary" | "free";
  onChangeDepthSnapMode: (mode: "boundary" | "free") => void;
  lines: ProfileLine[];
  boreholes: Borehole[];
  activeLineId: string | null;
  onStartNewLine: (name: string, color: string) => void;
  onResumeLine: (lineId: string) => void;
  onUndoLastPoint: (lineId: string) => void;
  onFinishLine: () => void;
  onDeleteLine: (lineId: string) => void;
  onDeletePoint: (lineId: string, pointIndex: number) => void;
  onEditPointDepth: (lineId: string, pointIndex: number, depth: number) => void;
  onRenameLine: (lineId: string, name: string) => void;
  onRecolorLine: (lineId: string, color: string) => void;
  onToggleLineVisibility: (lineId: string, visible: boolean) => void;
  onToggleLineContour: (lineId: string, showContour: boolean) => void;
  contourSettings: ContourSettings;
  onChangeContourSettings: (next: ContourSettings) => void;
  layers: ProfileLayer[];
  onCreateLayer: (name: string, color: string) => void;
  onDeleteLayer: (layerId: string) => void;
  onRenameLayer: (layerId: string, name: string) => void;
  onRecolorLayer: (layerId: string, color: string) => void;
  onSetLayerBoundary: (layerId: string, side: "top" | "bottom", boundaryId: string | null) => void;
  onStartNewLineForLayer: (name: string, color: string, layerId: string, side: "top" | "bottom") => void;
  error?: string | null;
}

const NEW_BOUNDARY_OPTION = "__new__";

export function ProfileDrawer({
  profileModeEnabled,
  onToggleProfileMode,
  depthSnapMode,
  onChangeDepthSnapMode,
  lines,
  boreholes,
  activeLineId,
  onStartNewLine,
  onResumeLine,
  onUndoLastPoint,
  onFinishLine,
  onDeleteLine,
  onDeletePoint,
  onEditPointDepth,
  onRenameLine,
  onRecolorLine,
  onToggleLineVisibility,
  onToggleLineContour,
  contourSettings,
  onChangeContourSettings,
  layers,
  onCreateLayer,
  onDeleteLayer,
  onRenameLayer,
  onRecolorLayer,
  onSetLayerBoundary,
  onStartNewLineForLayer,
  error,
}: ProfileDrawerProps) {
  const [newLineName, setNewLineName] = useState("");
  const [newLineColor, setNewLineColor] = useState("#ff6b6b");
  const [newLayerName, setNewLayerName] = useState("");
  const [newLayerColor, setNewLayerColor] = useState("#4a90d9");
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const [showKrigingParams, setShowKrigingParams] = useState(false);
  // range/sill 要求 > 0,清空輸入框那一瞬間 Number("") 會算成 0,若直接受控於
  // contourSettings 會被 onChange 的合法性檢查擋下、畫面立刻彈回舊數字,使用者
  // 沒辦法全選清空重打——這兩個本地草稿 state 讓輸入框先如實顯示使用者正在打的
  // 字串,只有在能解析成合法數字時才真的送出去更新 contourSettings。nugget 允許
  // 0,Number("")===0 剛好合法,不需要草稿。
  const [rangeDraft, setRangeDraft] = useState<string | null>(null);
  const [sillDraft, setSillDraft] = useState<string | null>(null);

  function boreholeName(boreholeId: string): string {
    return boreholes.find((b) => b.id === boreholeId)?.name ?? boreholeId;
  }

  function handleCreateLine() {
    onStartNewLine(newLineName.trim() || `邊界線 ${lines.length + 1}`, newLineColor);
    setNewLineName("");
  }

  function handleCreateLayer() {
    onCreateLayer(newLayerName.trim() || `地層 ${layers.length + 1}`, newLayerColor);
    setNewLayerName("");
  }

  function handleBoundaryChange(layerId: string, side: "top" | "bottom", value: string, layerName: string, layerColor: string) {
    if (value === NEW_BOUNDARY_OPTION) {
      onStartNewLineForLayer(`${layerName}${side === "top" ? "上界" : "下界"}`, layerColor, layerId, side);
    } else {
      onSetLayerBoundary(layerId, side, value || null);
    }
  }

  // 等高線設定是全域的,但每條線的點位不同、各自會自動擬合出不同的 range/sill——
  // 沒有唯一「正確」的代表值。取目前有開啟等高線的第一條線當代表,使用者第一次
  // 自訂任一參數時用它的真實擬合值當另外兩個欄位的基準,總比寫死的 1/1/0 更接近
  // 實際情況;多條線同時開等高線、且擬合結果差很多時,這個代表值仍然只是近似。
  const lineForVariogramPreview = lines.find((l) => l.showContour) ?? null;
  const variogramPreview = lineForVariogramPreview
    ? resolveVariogramPreview(lineForVariogramPreview, boreholes)
    : null;

  return (
    <div
      style={{
        position: "absolute",
        top: 180,
        right: 16,
        background: "rgba(30,30,30,0.85)",
        color: "#fff",
        padding: "12px 14px",
        borderRadius: 8,
        fontSize: 13,
        fontFamily: "sans-serif",
        maxWidth: 280,
        // drawer 本身 top:180,所以 drawer 底部 = 180 + maxHeight,不能只扣一個
        // 「留給底部面板的高度」就了事,還要把 drawer 自己的 top 偏移算進去。
        // 460 = drawer top 180 + BarWidthSettingsPanel 容器 bottom:116(它離視窗
        // 底部的距離)+ 展開時面板本身高度約 150 + 一點緩衝margin,確保 drawer
        // 底部永遠不會延伸到 116~266px(面板佔用的區間)這段、蓋住它吞掉點擊。
        // max(200px, ...) 是下限:小視窗(100vh - 460 會逼近 0 甚至負值)時仍保留
        // 200px 可用高度,不讓 drawer 直接消失、內容捲不動。
        maxHeight: "max(200px, calc(100vh - 460px))",
        overflowY: "auto",
      }}
    >
      <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontWeight: "bold" }}>
        <input
          type="checkbox"
          checked={profileModeEnabled}
          onChange={(e) => onToggleProfileMode(e.target.checked)}
        />
        繪製地層
      </label>

      {profileModeEnabled && (
        <>
          <div style={{ marginBottom: 8 }}>
            <label style={{ marginRight: 12 }}>
              <input
                type="radio"
                name="depthSnapMode"
                checked={depthSnapMode === "boundary"}
                onChange={() => onChangeDepthSnapMode("boundary")}
              />{" "}
              吸附地層界面
            </label>
            <label>
              <input
                type="radio"
                name="depthSnapMode"
                checked={depthSnapMode === "free"}
                onChange={() => onChangeDepthSnapMode("free")}
              />{" "}
              自由深度
            </label>
          </div>

          <div style={{ marginBottom: 8, fontWeight: "bold" }}>邊界線</div>

          {activeLineId ? (
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button type="button" onClick={() => onUndoLastPoint(activeLineId)} style={buttonStyle}>
                悔恨上一點
              </button>
              <button type="button" onClick={onFinishLine} style={buttonStyle}>
                完成此線
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 4, marginBottom: 8, alignItems: "center" }}>
              <input
                type="text"
                placeholder="邊界線名稱"
                value={newLineName}
                onChange={(e) => setNewLineName(e.target.value)}
                style={{ width: 100, fontSize: 12 }}
              />
              <input
                type="color"
                value={newLineColor}
                onChange={(e) => setNewLineColor(e.target.value)}
                style={{ width: 28, height: 24, padding: 0, border: "none", background: "none" }}
              />
              <button type="button" onClick={handleCreateLine} style={buttonStyle}>
                新增邊界線
              </button>
            </div>
          )}

          {lines.map((line) => (
            <div key={line.id} style={{ marginBottom: 4, opacity: line.id === activeLineId ? 1 : 0.85 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setExpandedLineId(expandedLineId === line.id ? null : line.id)}
                  style={{ ...buttonStyle, padding: "2px 6px" }}
                  title={expandedLineId === line.id ? "收合" : "展開"}
                >
                  {expandedLineId === line.id ? "▾" : "▸"}
                </button>
                <input
                  type="color"
                  value={line.color}
                  onChange={(e) => onRecolorLine(line.id, e.target.value)}
                  style={{ width: 20, height: 20, padding: 0, border: "none", background: "none" }}
                />
                <input
                  type="text"
                  value={line.name}
                  onChange={(e) => onRenameLine(line.id, e.target.value)}
                  style={{ flex: 1, fontSize: 12, minWidth: 0 }}
                />
                <span style={{ fontSize: 11, color: "#aaa" }}>{line.points.length}點</span>
                <button
                  type="button"
                  onClick={() => onToggleLineVisibility(line.id, !line.visible)}
                  style={buttonStyle}
                  title={line.visible ? "隱藏" : "顯示"}
                >
                  {line.visible ? "顯示中" : "已隱藏"}
                </button>
                {lineHasEnoughPointsForContour(line, boreholes) ? (
                  <button
                    type="button"
                    onClick={() => onToggleLineContour(line.id, !line.showContour)}
                    style={buttonStyle}
                    title={line.showContour ? "隱藏等高線" : "顯示等高線"}
                  >
                    {line.showContour ? "等高線開" : "等高線關"}
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: "#e6a23c" }} title="至少需要 3 個不共線的點才能產生等高線">
                    點數不足
                  </span>
                )}
                {line.id !== activeLineId && (
                  <button type="button" onClick={() => onResumeLine(line.id)} style={buttonStyle}>
                    繼續編輯
                  </button>
                )}
                <button type="button" onClick={() => onDeleteLine(line.id)} style={buttonStyle} title="刪除">
                  刪除
                </button>
              </div>

              {expandedLineId === line.id && (
                <div style={{ marginLeft: 28, marginTop: 4 }}>
                  {line.points.length === 0 && (
                    <div style={{ fontSize: 11, color: "#aaa" }}>還沒有任何點</div>
                  )}
                  {line.points.map((p, i) => (
                    <div
                      key={i}
                      style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 2 }}
                    >
                      <span style={{ flex: 1 }}>{boreholeName(p.boreholeId)}</span>
                      <input
                        type="number"
                        step={0.01}
                        value={p.depth}
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          if (!Number.isNaN(value)) onEditPointDepth(line.id, i, value);
                        }}
                        style={{ width: 55, fontSize: 12 }}
                      />
                      <span style={{ color: "#aaa" }}>m</span>
                      <button
                        type="button"
                        onClick={() => onDeletePoint(line.id, i)}
                        style={{ ...buttonStyle, padding: "0px 5px" }}
                        title="移除這個點"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div style={{ marginTop: 12, marginBottom: 8, fontWeight: "bold" }}>等高線設定</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 12 }}>
            <span>間距</span>
            <input
              type="number"
              step={0.1}
              min={0.1}
              value={contourSettings.minorInterval}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isNaN(value) || value <= 0) return;
                if (value > contourSettings.majorInterval) return;
                onChangeContourSettings({ ...contourSettings, minorInterval: value });
              }}
              style={{ width: 50, fontSize: 12 }}
            />
            <span>次線 /</span>
            <input
              type="number"
              step={0.5}
              min={0.01}
              value={contourSettings.majorInterval}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isNaN(value) || value <= 0) return;
                if (value < contourSettings.minorInterval) return;
                onChangeContourSettings({ ...contourSettings, majorInterval: value });
              }}
              style={{ width: 50, fontSize: 12 }}
            />
            <span>主線 (m)</span>
          </div>
          <div style={{ marginBottom: 8, fontSize: 12 }}>
            <label style={{ marginRight: 12 }}>
              <input
                type="radio"
                name="contourColorMode"
                checked={contourSettings.colorMode === "lines"}
                onChange={() => onChangeContourSettings({ ...contourSettings, colorMode: "lines" })}
              />{" "}
              純線段
            </label>
            <label>
              <input
                type="radio"
                name="contourColorMode"
                checked={contourSettings.colorMode === "colored"}
                onChange={() => onChangeContourSettings({ ...contourSettings, colorMode: "colored" })}
              />{" "}
              有上色
            </label>
          </div>
          <div style={{ marginBottom: 8, fontSize: 12 }}>
            <label style={{ marginRight: 12 }}>
              <input
                type="radio"
                name="contourInterpolator"
                checked={contourSettings.interpolator === "tin"}
                onChange={() => onChangeContourSettings({ ...contourSettings, interpolator: "tin" })}
              />{" "}
              TIN
            </label>
            <label>
              <input
                type="radio"
                name="contourInterpolator"
                checked={contourSettings.interpolator === "kriging"}
                onChange={() => onChangeContourSettings({ ...contourSettings, interpolator: "kriging" })}
              />{" "}
              Kriging
            </label>
          </div>
          {contourSettings.interpolator === "kriging" && (
            <div style={{ marginBottom: 8, fontSize: 12 }}>
              <button
                type="button"
                onClick={() => setShowKrigingParams(!showKrigingParams)}
                style={{ fontSize: 12 }}
              >
                {showKrigingParams ? "▾" : "▸"} 自訂變異函數參數
              </button>
              {showKrigingParams && (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 50 }}>range</span>
                    <input
                      type="number"
                      step={0.1}
                      value={rangeDraft ?? (contourSettings.krigingParams?.range ?? "")}
                      placeholder="自動"
                      onChange={(e) => {
                        const raw = e.target.value;
                        setRangeDraft(raw);
                        const value = Number(raw);
                        if (raw === "" || Number.isNaN(value) || value <= 0) return;
                        setRangeDraft(null);
                        const sill = contourSettings.krigingParams?.sill ?? variogramPreview?.sill ?? 1;
                        const nugget = contourSettings.krigingParams?.nugget ?? variogramPreview?.nugget ?? 0;
                        onChangeContourSettings({
                          ...contourSettings,
                          krigingParams: { range: value, sill, nugget },
                        });
                      }}
                      style={{ width: 60, fontSize: 12 }}
                    />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 50 }}>sill</span>
                    <input
                      type="number"
                      step={0.1}
                      value={sillDraft ?? (contourSettings.krigingParams?.sill ?? "")}
                      placeholder="自動"
                      onChange={(e) => {
                        const raw = e.target.value;
                        setSillDraft(raw);
                        const value = Number(raw);
                        if (raw === "" || Number.isNaN(value) || value <= 0) return;
                        setSillDraft(null);
                        const range = contourSettings.krigingParams?.range ?? variogramPreview?.range ?? 1;
                        const nugget = contourSettings.krigingParams?.nugget ?? variogramPreview?.nugget ?? 0;
                        onChangeContourSettings({
                          ...contourSettings,
                          krigingParams: { range, sill: value, nugget },
                        });
                      }}
                      style={{ width: 60, fontSize: 12 }}
                    />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 50 }}>nugget</span>
                    <input
                      type="number"
                      step={0.1}
                      value={contourSettings.krigingParams?.nugget ?? ""}
                      placeholder="自動"
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (Number.isNaN(value) || value < 0) return;
                        const range = contourSettings.krigingParams?.range ?? variogramPreview?.range ?? 1;
                        const sill = contourSettings.krigingParams?.sill ?? variogramPreview?.sill ?? 1;
                        onChangeContourSettings({
                          ...contourSettings,
                          krigingParams: { range, sill, nugget: value },
                        });
                      }}
                      style={{ width: 60, fontSize: 12 }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const next: ContourSettings = { ...contourSettings };
                      delete next.krigingParams;
                      setRangeDraft(null);
                      setSillDraft(null);
                      onChangeContourSettings(next);
                    }}
                    style={{ fontSize: 11, alignSelf: "flex-start" }}
                  >
                    清除自訂(恢復自動擬合)
                  </button>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 12, marginBottom: 8, fontWeight: "bold" }}>地層</div>
          <div style={{ display: "flex", gap: 4, marginBottom: 8, alignItems: "center" }}>
            <input
              type="text"
              placeholder="地層名稱"
              value={newLayerName}
              onChange={(e) => setNewLayerName(e.target.value)}
              style={{ width: 100, fontSize: 12 }}
            />
            <input
              type="color"
              value={newLayerColor}
              onChange={(e) => setNewLayerColor(e.target.value)}
              style={{ width: 28, height: 24, padding: 0, border: "none", background: "none" }}
            />
            <button type="button" onClick={handleCreateLayer} style={buttonStyle}>
              新增地層
            </button>
          </div>

          {layers.map((layerItem) => (
            <div key={layerItem.id} style={{ marginBottom: 10, borderTop: "1px solid #444", paddingTop: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <input
                  type="color"
                  value={layerItem.color}
                  onChange={(e) => onRecolorLayer(layerItem.id, e.target.value)}
                  style={{ width: 20, height: 20, padding: 0, border: "none", background: "none" }}
                />
                <input
                  type="text"
                  value={layerItem.name}
                  onChange={(e) => onRenameLayer(layerItem.id, e.target.value)}
                  style={{ flex: 1, fontSize: 12, minWidth: 0 }}
                />
                <button type="button" onClick={() => onDeleteLayer(layerItem.id)} style={buttonStyle} title="刪除">
                  刪除
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4, fontSize: 12 }}>
                <span style={{ width: 32 }}>上界</span>
                <select
                  value={layerItem.topBoundaryId ?? ""}
                  onChange={(e) =>
                    handleBoundaryChange(layerItem.id, "top", e.target.value, layerItem.name, layerItem.color)
                  }
                  style={{ flex: 1, fontSize: 12 }}
                >
                  <option value="">(未設定)</option>
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                  <option value={NEW_BOUNDARY_OPTION}>+ 繪製新邊界線</option>
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                <span style={{ width: 32 }}>下界</span>
                <select
                  value={layerItem.bottomBoundaryId ?? ""}
                  onChange={(e) =>
                    handleBoundaryChange(layerItem.id, "bottom", e.target.value, layerItem.name, layerItem.color)
                  }
                  style={{ flex: 1, fontSize: 12 }}
                >
                  <option value="">(未設定)</option>
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                  <option value={NEW_BOUNDARY_OPTION}>+ 繪製新邊界線</option>
                </select>
              </div>
            </div>
          ))}
        </>
      )}

      {error && <div style={{ color: "#ff9d9d", marginTop: 8 }}>{error}</div>}
    </div>
  );
}
