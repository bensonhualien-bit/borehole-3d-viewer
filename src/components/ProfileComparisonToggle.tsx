interface ProfileComparisonToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
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

export function ProfileComparisonToggle({ enabled, onChange }: ProfileComparisonToggleProps) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
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
      <button type="button" onClick={() => onChange(!enabled)} style={buttonStyle}>
        {enabled ? "返回單一剖面" : "多剖面比對"}
      </button>
    </div>
  );
}
