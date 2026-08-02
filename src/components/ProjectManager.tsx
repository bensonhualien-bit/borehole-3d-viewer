import { useRef } from "react";
import { clearBoreholes } from "../utils/boreholesStorage";
import { clearProfileData } from "../utils/profileStorage";
import { clearBoreholeGroups } from "../utils/boreholeGroupStorage";
import { clearSoilStyles } from "../utils/soilStylesStorage";
import { clearContourSettings } from "../utils/contour/contourSettings";
import { clearBarWidthSettings } from "../utils/barWidthSettingsStorage";
import { clearSitePlan } from "../utils/sitePlanStorage";

const buttonStyle: React.CSSProperties = {
  fontSize: 12,
  padding: "4px 8px",
  cursor: "pointer",
  borderRadius: 4,
  border: "1px solid #666",
  background: "#222",
  color: "#fff",
  pointerEvents: "auto",
};

const resetButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  marginTop: 8,
  width: "100%",
};

// 使用者在瀏覽器裡匯入自己的資料、畫了剖面線之後,如果想清掉一切回到內建範例場景
// 自救——不必手動去開發者工具清 localStorage。清單刻意列出「每個 storage 模組自己的
// clear 函式」而不是在這裡硬寫 key 字串,單一事實來源在各模組,新增/改名 key 時
// 只要模組自己改、這裡不用跟著動。UI 收合狀態(barWidthPanelCollapsed 等)故意不清,
// 那些是畫面偏好、不是「資料」,清了對使用者沒有幫助反而要重新展開面板。
function resetToExampleData(): void {
  clearBoreholes();
  clearProfileData();
  clearBoreholeGroups();
  clearSoilStyles();
  clearContourSettings();
  clearBarWidthSettings();
  clearSitePlan();
  window.location.reload();
}

interface ProjectManagerProps {
  onSaveProject: () => void;
  onOpenProject: (file: File) => void;
  error?: string | null;
}

export function ProjectManager({ onSaveProject, onOpenProject, error }: ProjectManagerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    onOpenProject(file);
    // 允許重複選同一個檔案也能觸發 onChange,比照 DataUploader.tsx 的手法
    e.target.value = "";
  }

  function handleResetClick() {
    const confirmed = window.confirm(
      "將清除本機儲存的鑽孔、剖面線、地層群組與顏色設定,回到內建範例場景。確定?"
    );
    if (!confirmed) return;
    resetToExampleData();
  }

  return (
    <div
      style={{
        background: "rgba(30,30,30,0.85)",
        color: "#fff",
        padding: "12px 14px",
        borderRadius: 8,
        fontSize: 13,
        fontFamily: "sans-serif",
        maxWidth: 220,
        // 定位交給 App.tsx 的左欄直向 flex(圖例變高時自動被往下推,不再與
        // 圖例重疊);面板空白處讓 3D 鏡頭拖曳穿透,只有按鈕攔事件。
      }}
    >
      <div style={{ marginBottom: 8, fontWeight: "bold" }}>專案</div>

      <div style={{ display: "flex", gap: 8, marginBottom: error ? 8 : 0 }}>
        <button type="button" onClick={onSaveProject} style={buttonStyle}>
          儲存專案
        </button>
        <button type="button" onClick={() => inputRef.current?.click()} style={buttonStyle}>
          開啟專案
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      <button type="button" onClick={handleResetClick} style={resetButtonStyle}>
        重設為範例資料
      </button>

      {error && <div style={{ color: "#ff9d9d", marginTop: 8 }}>{error}</div>}
    </div>
  );
}
