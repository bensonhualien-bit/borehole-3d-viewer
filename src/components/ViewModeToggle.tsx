interface ViewModeToggleProps {
  viewMode: "3d" | "2d";
  onChange: (mode: "3d" | "2d") => void;
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

export function ViewModeToggle({ viewMode, onChange }: ViewModeToggleProps) {
  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(30,30,30,0.85)",
        color: "#fff",
        padding: "12px 14px",
        borderRadius: 8,
        fontSize: 13,
        fontFamily: "sans-serif",
      }}
    >
      <button type="button" onClick={() => onChange(viewMode === "3d" ? "2d" : "3d")} style={buttonStyle}>
        {viewMode === "3d" ? "切換為2D剖面" : "切換為3D視圖"}
      </button>
    </div>
  );
}
