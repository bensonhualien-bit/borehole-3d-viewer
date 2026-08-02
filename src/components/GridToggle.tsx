interface GridToggleProps {
  showGrid: boolean;
  onChange: (showGrid: boolean) => void;
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

export function GridToggle({ showGrid, onChange }: GridToggleProps) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 66,
        right: 16,
        background: "rgba(30,30,30,0.85)",
        color: "#fff",
        padding: "12px 14px",
        borderRadius: 8,
        fontSize: 13,
        fontFamily: "sans-serif",
      }}
    >
      <button type="button" onClick={() => onChange(!showGrid)} style={buttonStyle}>
        {showGrid ? "隱藏網格" : "顯示網格"}
      </button>
    </div>
  );
}
