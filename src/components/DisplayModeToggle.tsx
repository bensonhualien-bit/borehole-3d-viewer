interface DisplayModeToggleProps {
  displayMode: "full" | "points";
  onChange: (mode: "full" | "points") => void;
}

const buttonStyle: React.CSSProperties = {
  fontSize: 12,
  padding: "4px 8px",
  cursor: "pointer",
  borderRadius: 4,
  border: "1px solid #666",
  background: "#222",
  color: "#fff",
};

export function DisplayModeToggle({ displayMode, onChange }: DisplayModeToggleProps) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        right: 16,
        background: "rgba(30,30,30,0.85)",
        color: "#fff",
        padding: "12px 14px",
        borderRadius: 8,
        fontSize: 13,
        fontFamily: "sans-serif",
      }}
    >
      <button
        type="button"
        onClick={() => onChange(displayMode === "full" ? "points" : "full")}
        style={buttonStyle}
      >
        {displayMode === "full" ? "切換為簡化點位" : "切換為完整柱狀圖"}
      </button>
    </div>
  );
}
