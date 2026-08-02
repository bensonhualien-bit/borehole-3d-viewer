import { useState } from "react";

interface ExportPdfButtonProps {
  label: string;
  disabled?: boolean;
  onExport: () => Promise<void>;
  style?: React.CSSProperties;
}

export function ExportPdfButton({ label, disabled, onExport, style }: ExportPdfButtonProps) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onExport();
        } catch (err) {
          alert(err instanceof Error ? err.message : "匯出 PDF 失敗");
        } finally {
          setBusy(false);
        }
      }}
      style={{
        fontSize: 12,
        padding: "6px 10px",
        cursor: disabled || busy ? "default" : "pointer",
        borderRadius: 4,
        border: "1px solid #666",
        background: "#222",
        color: "#fff",
        opacity: disabled || busy ? 0.6 : 1,
        pointerEvents: "auto",
        ...style,
      }}
    >
      {busy ? "匯出中…" : label}
    </button>
  );
}
