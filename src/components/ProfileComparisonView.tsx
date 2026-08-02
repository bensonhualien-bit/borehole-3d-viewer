import { useEffect, useRef, useState } from "react";
import type { Borehole } from "../types/borehole";
import type { ProfileLine } from "../utils/profileStorage";
import type { BoreholeGroup } from "../utils/boreholeGroupStorage";
import { computeElevationRange } from "../utils/boreholeElevation";
import { ProfileSection2D, type VerticalViewBox } from "./ProfileSection2D";
import { ProfileGroupManager } from "./ProfileGroupManager";
import { ExportPdfButton } from "./ExportPdfButton";
import { loadComparisonMenuCollapsed, saveComparisonMenuCollapsed } from "../utils/comparisonMenuStorage";
import { resolveNextVerticalViewBoxes } from "../utils/comparisonViewBoxes";
import type { SoilStyles } from "../utils/soilStyles";
import type { BarWidthSettings } from "../utils/barWidth";

interface ProfileComparisonViewProps {
  boreholes: Borehole[];
  groups: BoreholeGroup[];
  profileLines: ProfileLine[];
  profileModeEnabled: boolean;
  activeLineId: string | null;
  depthSnapMode: "boundary" | "free";
  axisMode: "projected" | "sequential";
  onChangeAxisMode: (mode: "projected" | "sequential") => void;
  showGrid: boolean;
  onAppendPoint: (lineId: string, boreholeId: string, depth: number) => void;
  onDragPointDepth: (lineId: string, pointIndex: number, depth: number) => void;
  onCreateGroup: (name: string, boreholeIds: string[]) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onUpdateGroupBoreholeIds: (groupId: string, boreholeIds: string[]) => void;
  onDeleteGroup: (groupId: string) => void;
  onExportPdf: () => Promise<void>;
  soilStyles: SoilStyles;
  barWidthSettings: BarWidthSettings;
}

export function ProfileComparisonView({
  boreholes,
  groups,
  profileLines,
  profileModeEnabled,
  activeLineId,
  depthSnapMode,
  axisMode,
  onChangeAxisMode,
  showGrid,
  onAppendPoint,
  onDragPointDepth,
  onCreateGroup,
  onRenameGroup,
  onUpdateGroupBoreholeIds,
  onDeleteGroup,
  onExportPdf,
  soilStyles,
  barWidthSettings,
}: ProfileComparisonViewProps) {
  const [verticalViewBoxes, setVerticalViewBoxes] = useState<Record<string, VerticalViewBox>>({});
  const membershipKeysRef = useRef<Record<string, string>>({});
  const [menuCollapsed, setMenuCollapsed] = useState(() => loadComparisonMenuCollapsed());

  useEffect(() => {
    const unionIds = new Set(groups.flatMap((g) => g.boreholeIds));
    const unionBoreholes = boreholes.filter((b) => unionIds.has(b.id));
    if (unionBoreholes.length === 0) return;
    const range = computeElevationRange(unionBoreholes);
    const initialBox: VerticalViewBox = { minY: -range.max, height: range.max - range.min };

    const result = resolveNextVerticalViewBoxes(groups, verticalViewBoxes, membershipKeysRef.current, initialBox);
    membershipKeysRef.current = result.membershipKeys;
    if (result.changed) setVerticalViewBoxes(result.boxes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, boreholes]);

  return (
    <div style={{ position: "absolute", top: 70, right: 0, bottom: 0, left: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {groups.length === 0 && (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#666",
              fontSize: 16,
              fontFamily: "sans-serif",
              background: "#e9eff5",
            }}
          >
            尚未建立任何鑽孔群組
          </div>
        )}
        {groups.map((group) => (
          <div
            key={group.id}
            style={{ height: 320, flexShrink: 0, position: "relative", borderBottom: "2px solid #333" }}
          >
            <div
              style={{
                position: "absolute",
                top: 4,
                left: 4,
                zIndex: 1,
                background: "rgba(255,255,255,0.85)",
                padding: "2px 8px",
                borderRadius: 4,
                fontSize: 12,
                fontFamily: "sans-serif",
              }}
            >
              {group.name}
            </div>
            <ProfileSection2D
              boreholes={boreholes}
              selectedBoreholeIds={new Set(group.boreholeIds)}
              profileLines={profileLines}
              profileModeEnabled={profileModeEnabled}
              activeLineId={activeLineId}
              depthSnapMode={depthSnapMode}
              axisMode={axisMode}
              showGrid={showGrid}
              onAppendPoint={onAppendPoint}
              onDragPointDepth={onDragPointDepth}
              verticalViewBox={verticalViewBoxes[group.id]}
              onVerticalViewBoxChange={(next) =>
                setVerticalViewBoxes((prev) => ({ ...prev, [group.id]: next }))
              }
              soilStyles={soilStyles}
              barWidthSettings={barWidthSettings}
            />
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          top: 66,
          left: "50%",
          transform: "translateX(-50%)",
          maxHeight: "calc(100vh - 90px)",
          overflowY: "auto",
        }}
      >
        {menuCollapsed ? (
          <button
            type="button"
            onClick={() => {
              setMenuCollapsed(false);
              saveComparisonMenuCollapsed(false);
            }}
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
            選單 ▾
          </button>
        ) : (
          <>
            <div
              style={{
                background: "rgba(30,30,30,0.9)",
                color: "#fff",
                padding: "8px 10px",
                borderRadius: 8,
                fontSize: 11,
                fontFamily: "sans-serif",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <span style={{ fontWeight: "bold" }}>選單</span>
                <button
                  type="button"
                  onClick={() => {
                    setMenuCollapsed(true);
                    saveComparisonMenuCollapsed(true);
                  }}
                  style={{
                    fontSize: 12,
                    padding: "2px 6px",
                    cursor: "pointer",
                    borderRadius: 4,
                    border: "1px solid #666",
                    background: "#222",
                    color: "#fff",
                  }}
                  title="收合"
                >
                  ▴
                </button>
              </div>
              <label style={{ display: "block", marginBottom: 2 }}>
                <input
                  type="radio"
                  name="comparisonAxisMode"
                  checked={axisMode === "projected"}
                  onChange={() => onChangeAxisMode("projected")}
                />{" "}
                投影剖面距離
              </label>
              <label style={{ display: "block" }}>
                <input
                  type="radio"
                  name="comparisonAxisMode"
                  checked={axisMode === "sequential"}
                  onChange={() => onChangeAxisMode("sequential")}
                />{" "}
                鑽孔間直線距離
              </label>
            </div>
            <ProfileGroupManager
              boreholes={boreholes}
              groups={groups}
              onCreateGroup={onCreateGroup}
              onRenameGroup={onRenameGroup}
              onUpdateGroupBoreholeIds={onUpdateGroupBoreholeIds}
              onDeleteGroup={onDeleteGroup}
            />
            <ExportPdfButton
              label="匯出 PDF(一群一頁)"
              disabled={groups.length === 0}
              onExport={onExportPdf}
              style={{ marginTop: 8, width: "100%" }}
            />
          </>
        )}
      </div>
    </div>
  );
}
