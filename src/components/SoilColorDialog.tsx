import { useEffect, useRef, useState } from "react";
import { STANDARD_SOIL_COLORS } from "../utils/standardColors";

interface SoilColorDialogProps {
  code: string;
  label: string;
  currentColor: string;
  onConfirm: (color: string) => void;
  onClose: () => void;
}

// 「確認才套用」的色彩選擇對話框。選擇只暫存在 selected,按「確認」
// 才回報一次;「關閉」與 Esc 完全不回報。呼叫端用 key={code} 掛載,
// 換代碼時整個重掛,selected 自然重新初始化,不需要同步 effect。
export function SoilColorDialog({ code, label, currentColor, onConfirm, onClose }: SoilColorDialogProps) {
  const [selected, setSelected] = useState(currentColor);
  const customInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const smallBtn: React.CSSProperties = {
    padding: "5px 14px",
    fontSize: 13,
    background: "rgba(255,255,255,0.15)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.35)",
    borderRadius: 4,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 60,
        left: 270,
        width: 330,
        background: "rgba(30,30,30,0.96)",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.25)",
        borderRadius: 10,
        padding: "14px 16px",
        fontSize: 13,
        fontFamily: "sans-serif",
        boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
        pointerEvents: "auto",
        zIndex: 20,
      }}
    >
      <div
        style={{
          fontWeight: "bold",
          fontSize: 14,
          marginBottom: 10,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>色彩選擇</span>
        <span style={{ fontSize: 12, fontWeight: "normal", opacity: 0.85 }}>
          {code} {label}
        </span>
      </div>

      <div style={{ fontSize: 12, opacity: 0.8, margin: "8px 0 6px" }}>標準顏色(點選後按「確認」套用)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 4 }}>
        {STANDARD_SOIL_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`標準色 ${color}`}
            onClick={() => setSelected(color)}
            style={{
              aspectRatio: "1",
              borderRadius: 3,
              cursor: "pointer",
              background: color,
              padding: 0,
              border: selected === color ? "2px solid #fff" : "1px solid rgba(255,255,255,0.25)",
              boxShadow: selected === color ? "0 0 5px rgba(255,255,255,0.9)" : undefined,
            }}
          />
        ))}
      </div>

      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" style={smallBtn} onClick={() => customInputRef.current?.click()}>
          自訂…
        </button>
        <span style={{ fontSize: 11, opacity: 0.6 }}>開啟系統選色器,選完一樣要按「確認」</span>
        <input
          ref={customInputRef}
          type="color"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          aria-label={`自訂 ${code} 顏色數值`}
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            border: "none",
            margin: -1,
            clip: "rect(0 0 0 0)",
            overflow: "hidden",
          }}
        />
      </div>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          alignItems: "center",
          gap: 14,
          paddingTop: 10,
          borderTop: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        <div style={{ textAlign: "center", fontSize: 11, opacity: 0.9 }}>
          <div
            style={{
              width: 44,
              height: 26,
              borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.4)",
              marginBottom: 3,
              background: currentColor,
            }}
          />
          目前
        </div>
        <div style={{ textAlign: "center", fontSize: 11, opacity: 0.9 }}>
          <div
            data-testid="color-dialog-preview-new"
            style={{
              width: 44,
              height: 26,
              borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.4)",
              marginBottom: 3,
              background: selected,
            }}
          />
          新增
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => onConfirm(selected)}
            style={{
              padding: "6px 18px",
              fontSize: 13,
              fontWeight: "bold",
              background: "#3b82c4",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            確認
          </button>
          <button type="button" onClick={onClose} style={smallBtn}>
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
