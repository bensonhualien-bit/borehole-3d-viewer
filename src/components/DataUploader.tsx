import { useRef, useState } from "react";
import type { Borehole } from "../types/borehole";
import { CSV_TEMPLATE, parseBoreholeCsv } from "../utils/csvImport";
import { parseBoreholeXlsx } from "../utils/xlsxImport";

interface DataUploaderProps {
  onImport: (boreholes: Borehole[]) => void;
}

export function DataUploader({ onImport }: DataUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const isXlsx = file.name.toLowerCase().endsWith(".xlsx");
    const { boreholes, errors } = isXlsx
      ? await parseBoreholeXlsx(file)
      : await parseBoreholeCsv(file);
    setErrors(errors);
    setImportedCount(boreholes.length);

    if (boreholes.length > 0) {
      onImport(boreholes);
    }

    // 允許重複選同一個檔案也能觸發 onChange
    e.target.value = "";
  }

  function downloadTemplate() {
    const blob = new Blob(["﻿" + CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "鑽孔資料範本.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        background: "rgba(30,30,30,0.85)",
        color: "#fff",
        padding: "12px 14px",
        borderRadius: 8,
        fontSize: 13,
        fontFamily: "sans-serif",
        maxWidth: 300,
      }}
    >
      <div style={{ marginBottom: 8, fontWeight: "bold" }}>匯入鑽孔資料</div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={handleFileChange}
        style={{ fontSize: 12, marginBottom: 8, width: "100%" }}
      />

      <div>
        <button
          type="button"
          onClick={downloadTemplate}
          style={{
            fontSize: 12,
            padding: "4px 8px",
            cursor: "pointer",
            borderRadius: 4,
            border: "1px solid #666",
            background: "#222",
            color: "#fff",
          }}
        >
          下載範本 CSV
        </button>
      </div>

      {fileName && (
        <div style={{ marginTop: 8, color: importedCount ? "#8fd18f" : "#ff9d9d" }}>
          {fileName}:
          {importedCount ? ` 成功匯入 ${importedCount} 支鑽孔` : " 匯入失敗"}
        </div>
      )}

      {errors.length > 0 && (
        <ul style={{ marginTop: 6, paddingLeft: 18, color: "#ffb3b3", maxHeight: 150, overflowY: "auto" }}>
          {errors.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
