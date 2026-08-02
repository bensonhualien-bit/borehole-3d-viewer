import { useEffect, useRef, useState } from "react";
import type { Borehole } from "../types/borehole";
import { loadChecklistCollapsed, saveChecklistCollapsed } from "../utils/checklistCollapseStorage";

interface BoreholeChecklistProps {
  boreholes: Borehole[];
  selectedIds: Set<string>;
  onToggle: (boreholeId: string, selected: boolean) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  title: string;
  extraControls?: React.ReactNode;
  // 選填:提供時,展開/收合狀態存進 localStorage(用這個字串當 key,不同呼叫端各自
  // 獨立),重新整理/切換畫面都會記住;不提供時維持原本「只看目前選取數量」的行為,
  // 不做持久化(3D 場景那邊目前刻意不傳,保留原本每次重新掛載都重新判斷的樣子)。
  storageKey?: string;
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

export function BoreholeChecklist({
  boreholes,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
  title,
  extraControls,
  storageKey,
}: BoreholeChecklistProps) {
  // 有 storageKey 時,優先用使用者上次手動存下來的選擇;沒存過(null)或沒提供
  // storageKey 時,才退回原本「一開始放在正中央——這個位置只有在還沒湊到 2 支鑽孔
  // 時會擋到畫面,但那個當下 2D 視圖本來就只顯示『請選擇至少 2 支鑽孔』的空白提示,
  // 沒有柱狀圖/連線可以被擋住。湊到 2 支之後自動收合成一個小標籤」這個既有邏輯。
  const persisted = storageKey ? loadChecklistCollapsed(storageKey) : null;
  const [collapsed, setCollapsedState] = useState(() => persisted ?? selectedIds.size >= 2);
  // 這個 mount 期間有沒有「自動」收合過一次(或者已經有 localStorage 存過的明確
  // 選擇,等同於已經處理過,不需要再讓自動收合計時器蓋過去)——只要還沒有,選取數
  // >= 2 時就持續(重新)排程收合計時器。手動收合/展開後不會再被這個機制影響。
  const hasAutoCollapsedRef = useRef(persisted !== null || selectedIds.size >= 2);

  function setCollapsed(next: boolean) {
    setCollapsedState(next);
    if (storageKey) saveChecklistCollapsed(storageKey, next);
  }

  useEffect(() => {
    if (selectedIds.size >= 2 && !hasAutoCollapsedRef.current) {
      const timer = setTimeout(() => {
        hasAutoCollapsedRef.current = true;
        setCollapsed(true);
      }, 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds.size]);

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    top: 66,
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(30,30,30,0.85)",
    color: "#fff",
    padding: "12px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontFamily: "sans-serif",
  };

  if (collapsed) {
    return (
      <div style={containerStyle}>
        <button type="button" onClick={() => setCollapsed(false)} style={buttonStyle}>
          已選 {selectedIds.size} 支鑽孔 ▾
        </button>
      </div>
    );
  }

  return (
    <div style={{ ...containerStyle, maxWidth: 200, maxHeight: "40vh", overflowY: "auto" }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          background: "rgba(30,30,30,0.95)",
          marginBottom: 8,
          paddingBottom: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontWeight: "bold" }}>{title}</span>
          {selectedIds.size >= 2 && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              style={{ ...buttonStyle, padding: "2px 6px" }}
              title="收合"
            >
              ▴
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button type="button" onClick={onSelectAll} style={buttonStyle}>
            全選
          </button>
          <button type="button" onClick={onClearAll} style={buttonStyle}>
            清除
          </button>
        </div>
        {extraControls}
      </div>
      {boreholes.map((b) => (
        <label key={b.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={selectedIds.has(b.id)}
            onChange={(e) => onToggle(b.id, e.target.checked)}
          />
          {b.name}
        </label>
      ))}
    </div>
  );
}
