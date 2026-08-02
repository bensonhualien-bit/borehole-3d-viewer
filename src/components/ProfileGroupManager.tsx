import { useState } from "react";
import type { Borehole } from "../types/borehole";
import type { BoreholeGroup } from "../utils/boreholeGroupStorage";

interface ProfileGroupManagerProps {
  boreholes: Borehole[];
  groups: BoreholeGroup[];
  onCreateGroup: (name: string, boreholeIds: string[]) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onUpdateGroupBoreholeIds: (groupId: string, boreholeIds: string[]) => void;
  onDeleteGroup: (groupId: string) => void;
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

// 這裡不重用 BoreholeChecklist——那個元件是為了浮在 3D/2D 場景上方設計的獨立浮動
// 面板(絕對定位在畫面正中央、選滿 2 支後自動收合),嵌進這個群組編輯面板時,這兩個
// 行為都不合適(這裡不需要自動收合,使用者可能一次要勾選很多支鑽孔;也不需要浮動
// 定位,面板本身就在 ProfileComparisonView 的版面裡)。改成一份沒有收合/浮動定位的
// 簡化勾選清單,視覺上維持同樣的核取方塊 + 全選/清除按鈕呈現。
function BoreholeCheckboxList({
  boreholes,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
}: {
  boreholes: Borehole[];
  selectedIds: Set<string>;
  onToggle: (boreholeId: string, selected: boolean) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  return (
    <div style={{ maxHeight: 160, overflowY: "auto", border: "1px solid #555", borderRadius: 4, padding: 8 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <button type="button" onClick={onSelectAll} style={buttonStyle}>
          全選
        </button>
        <button type="button" onClick={onClearAll} style={buttonStyle}>
          清除
        </button>
      </div>
      {boreholes.map((b) => (
        <label key={b.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <input type="checkbox" checked={selectedIds.has(b.id)} onChange={(e) => onToggle(b.id, e.target.checked)} />
          {b.name}
        </label>
      ))}
    </div>
  );
}

interface NewGroupFormState {
  name: string;
  boreholeIds: Set<string>;
}

export function ProfileGroupManager({
  boreholes,
  groups,
  onCreateGroup,
  onRenameGroup,
  onUpdateGroupBoreholeIds,
  onDeleteGroup,
}: ProfileGroupManagerProps) {
  const [newGroupForm, setNewGroupForm] = useState<NewGroupFormState | null>(null);
  const [editingBoreholesGroupId, setEditingBoreholesGroupId] = useState<string | null>(null);
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  function startNewGroup() {
    setNewGroupForm({ name: `剖面 ${groups.length + 1}`, boreholeIds: new Set() });
  }

  function confirmNewGroup() {
    if (!newGroupForm || newGroupForm.boreholeIds.size === 0) return;
    onCreateGroup(newGroupForm.name, [...newGroupForm.boreholeIds]);
    setNewGroupForm(null);
  }

  return (
    <div
      style={{
        background: "rgba(30,30,30,0.9)",
        color: "#fff",
        padding: "12px 14px",
        borderRadius: 8,
        fontSize: 13,
        fontFamily: "sans-serif",
        maxWidth: 280,
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: 8 }}>鑽孔群組</div>
      {groups.map((group) => (
        <div key={group.id} style={{ marginBottom: 10, borderBottom: "1px solid #444", paddingBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
            {renamingGroupId === group.id ? (
              <input
                type="text"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={() => {
                  onRenameGroup(group.id, renameDraft.trim() || group.name);
                  setRenamingGroupId(null);
                }}
                autoFocus
                style={{ flex: 1, fontSize: 13 }}
              />
            ) : (
              <span
                onClick={() => {
                  setRenamingGroupId(group.id);
                  setRenameDraft(group.name);
                }}
                style={{ cursor: "text", flex: 1 }}
                title="點擊改名"
              >
                {group.name}
              </span>
            )}
            <button type="button" onClick={() => onDeleteGroup(group.id)} style={{ ...buttonStyle, padding: "2px 6px" }}>
              刪除
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#aaa", margin: "4px 0" }}>{group.boreholeIds.length} 支鑽孔</div>
          {editingBoreholesGroupId === group.id ? (
            <>
              <BoreholeCheckboxList
                boreholes={boreholes}
                selectedIds={new Set(group.boreholeIds)}
                onToggle={(boreholeId, selected) => {
                  const next = new Set(group.boreholeIds);
                  if (selected) next.add(boreholeId);
                  else next.delete(boreholeId);
                  onUpdateGroupBoreholeIds(group.id, [...next]);
                }}
                onSelectAll={() => onUpdateGroupBoreholeIds(group.id, boreholes.map((b) => b.id))}
                onClearAll={() => onUpdateGroupBoreholeIds(group.id, [])}
              />
              <button
                type="button"
                onClick={() => setEditingBoreholesGroupId(null)}
                style={{ ...buttonStyle, marginTop: 6 }}
              >
                完成
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setEditingBoreholesGroupId(group.id)} style={buttonStyle}>
              編輯鑽孔
            </button>
          )}
        </div>
      ))}
      {newGroupForm ? (
        <div style={{ marginTop: 8 }}>
          <input
            type="text"
            value={newGroupForm.name}
            onChange={(e) => setNewGroupForm({ ...newGroupForm, name: e.target.value })}
            style={{ width: "100%", marginBottom: 6, fontSize: 13 }}
            placeholder="群組名稱"
          />
          <BoreholeCheckboxList
            boreholes={boreholes}
            selectedIds={newGroupForm.boreholeIds}
            onToggle={(boreholeId, selected) => {
              const next = new Set(newGroupForm.boreholeIds);
              if (selected) next.add(boreholeId);
              else next.delete(boreholeId);
              setNewGroupForm({ ...newGroupForm, boreholeIds: next });
            }}
            onSelectAll={() => setNewGroupForm({ ...newGroupForm, boreholeIds: new Set(boreholes.map((b) => b.id)) })}
            onClearAll={() => setNewGroupForm({ ...newGroupForm, boreholeIds: new Set() })}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <button
              type="button"
              onClick={confirmNewGroup}
              style={buttonStyle}
              disabled={newGroupForm.boreholeIds.size === 0}
            >
              建立
            </button>
            <button type="button" onClick={() => setNewGroupForm(null)} style={buttonStyle}>
              取消
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={startNewGroup} style={buttonStyle}>
          + 新增群組
        </button>
      )}
    </div>
  );
}
