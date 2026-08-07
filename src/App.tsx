import { useEffect, useMemo, useState } from "react";
import { Scene } from "./components/Scene";
import { DataUploader } from "./components/DataUploader";
import { SoilLegend } from "./components/SoilLegend";
import { ContourLegend, type ContourLegendExtent } from "./components/ContourLegend";
import { SitePlanUploader } from "./components/SitePlanUploader";
import { DisplayModeToggle } from "./components/DisplayModeToggle";
import { GridToggle } from "./components/GridToggle";
import { ProfileDrawer } from "./components/ProfileDrawer";
import { ProjectManager } from "./components/ProjectManager";
import { ViewModeToggle } from "./components/ViewModeToggle";
import { BoreholeChecklist } from "./components/BoreholeChecklist";
import { ProfileSection2D } from "./components/ProfileSection2D";
import { BarWidthSettingsPanel } from "./components/BarWidthSettingsPanel";
import { ProfileComparisonView } from "./components/ProfileComparisonView";
import { ProfileComparisonToggle } from "./components/ProfileComparisonToggle";
import { ExportPdfButton } from "./components/ExportPdfButton";
import { exportProfilesToPdf } from "./utils/exportPdf";
import { mockBoreholes } from "./data/mockBoreholes";
import type { Borehole } from "./types/borehole";
import type { SitePlanCalibration } from "./utils/sitePlanStorage";
import { clearSitePlan, loadSitePlan, saveSitePlan } from "./utils/sitePlanStorage";
import { placementToCalibration, type QuickInsertPlacement } from "./utils/sitePlanQuickInsert";
import type { ProfileData, ProfileLayer, ProfileLine } from "./utils/profileStorage";
import { loadProfileData, saveProfileData } from "./utils/profileStorage";
import type { BoreholeGroup } from "./utils/boreholeGroupStorage";
import { loadBoreholeGroups, saveBoreholeGroups } from "./utils/boreholeGroupStorage";
import { parseProjectFile, serializeProject } from "./utils/projectFile";
import {
  loadContourSettings,
  saveContourSettings,
  type ContourSettings,
} from "./utils/contour/contourSettings";
import { loadSoilStyles, saveSoilStyles } from "./utils/soilStylesStorage";
import type { SoilStyles } from "./utils/soilStyles";
import type { BarWidthSettings } from "./utils/barWidth";
import { loadBarWidthSettings, saveBarWidthSettings } from "./utils/barWidthSettingsStorage";
import { loadBoreholes, saveBoreholes } from "./utils/boreholesStorage";
import { LayerModelPanel } from "./components/LayerModelPanel";
import {
  loadModelSettings,
  saveModelSettings,
  type ModelSettings,
} from "./utils/model/modelSettings";
import { globalQcMax } from "./utils/cptCurve";

function App() {
  const [boreholes, setBoreholes] = useState<Borehole[]>(() => loadBoreholes() ?? mockBoreholes);
  const [sitePlan, setSitePlan] = useState<SitePlanCalibration | null>(() => loadSitePlan());
  const [dragError, setDragError] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<"full" | "points">("full");
  const [showGrid, setShowGrid] = useState(true);
  const [profileData, setProfileData] = useState<ProfileData>(() => loadProfileData());
  const [profileModeEnabled, setProfileModeEnabled] = useState(false);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [depthSnapMode, setDepthSnapMode] = useState<"boundary" | "free">("boundary");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [pendingBoundaryAssignment, setPendingBoundaryAssignment] = useState<{
    layerId: string;
    side: "top" | "bottom";
  } | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");
  const [selectedBoreholeIds, setSelectedBoreholeIds] = useState<Set<string>>(new Set());
  const [axisMode, setAxisMode] = useState<"projected" | "sequential">("projected");
  const [selectedBoreholeIds3D, setSelectedBoreholeIds3D] = useState<Set<string>>(
    () => new Set(mockBoreholes.map((b) => b.id))
  );
  const [contourSettings, setContourSettings] = useState<ContourSettings>(() => loadContourSettings());
  const [boreholeGroups, setBoreholeGroups] = useState<BoreholeGroup[]>(() => loadBoreholeGroups());
  const [comparisonModeEnabled, setComparisonModeEnabled] = useState(false);
  const [contourExtent, setContourExtent] = useState<ContourLegendExtent | null>(null);
  const [soilStyles, setSoilStyles] = useState<SoilStyles>(() => loadSoilStyles());
  const [soilColorError, setSoilColorError] = useState<string | null>(null);
  const [barWidthSettings, setBarWidthSettings] = useState<BarWidthSettings>(() => loadBarWidthSettings());
  const [modelSettings, setModelSettings] = useState<ModelSettings>(() => loadModelSettings());
  // 各地層實體的尖滅比例回報(key=layerId;null=該層目前無法建模)。畫面顯示用的
  // 暫時性狀態,不持久化——每次重新渲染實體時 LayerSolid 都會重新回報。
  const [pinchOutByLayer, setPinchOutByLayer] = useState<Record<string, number | null>>({});
  // 快速插入放置模式:非 null 表示圖片正跟著滑鼠等待點擊放置。
  // 暫時性 UI 狀態,不持久化;Esc 或放置完成即清空。
  const [quickInsert, setQuickInsert] = useState<{
    imageDataUrl: string;
    imageWidth: number;
    imageHeight: number;
    elevation: number;
  } | null>(null);

  function handleQuickInsertStart(payload: {
    imageDataUrl: string;
    imageWidth: number;
    imageHeight: number;
    elevation: number;
  }) {
    setQuickInsert(payload);
    setViewMode("3d"); // 放置只在 3D 場景進行
  }

  function handleQuickInsertPlace(p: QuickInsertPlacement) {
    if (!quickInsert) return;
    const calibration = placementToCalibration(
      p,
      { dataUrl: quickInsert.imageDataUrl, width: quickInsert.imageWidth, height: quickInsert.imageHeight },
      quickInsert.elevation,
    );
    try {
      saveSitePlan(calibration);
      setSitePlan(calibration);
      setDragError(null);
    } catch {
      setDragError("圖片太大,請換小一點的圖片再試一次");
    }
    setQuickInsert(null);
  }

  // Esc 取消放置模式
  useEffect(() => {
    if (!quickInsert) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setQuickInsert(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quickInsert]);

  function todayStamp(): { file: string; text: string } {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return {
      file: `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`,
      text: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    };
  }

  async function handleExportSingle2D() {
    const stamp = todayStamp();
    await exportProfilesToPdf(
      [
        {
          boreholes,
          selectedBoreholeIds,
          profileLines: profileData.lines,
          axisMode,
          soilStyles,
          barWidthSettings,
          title: "地質剖面圖",
        },
      ],
      `剖面圖_${stamp.file}.pdf`,
      stamp.text
    );
  }

  async function handleExportComparison() {
    const stamp = todayStamp();
    await exportProfilesToPdf(
      boreholeGroups.map((g) => ({
        boreholes,
        selectedBoreholeIds: new Set(g.boreholeIds),
        profileLines: profileData.lines,
        axisMode,
        soilStyles,
        barWidthSettings,
        title: `地質剖面圖 — ${g.name}`,
      })),
      `剖面比對_${stamp.file}.pdf`,
      stamp.text
    );
  }

  // boreholes 只有在匯入新檔案或開啟專案時才會換成新的陣列參照,所以這個 effect
  // 只在「換了一整批新資料」時觸發、重設回全選——同一批資料內的手動勾選調整
  // 不會被這個 effect 打斷。
  useEffect(() => {
    setSelectedBoreholeIds3D(new Set(boreholes.map((b) => b.id)));
  }, [boreholes]);

  // 切離 3D 視圖時圖例要跟著消失,避免殘留舊的數值範圍(Scene 卸載後不會再回報)。
  useEffect(() => {
    if (viewMode !== "3d") setContourExtent(null);
  }, [viewMode]);

  const avgGroundElevation =
    boreholes.reduce((sum, b) => sum + b.groundElevation, 0) / boreholes.length;

  // 匯入(CSV/xlsx)成功換一整批新鑽孔資料時的入口:先寫 localStorage 再 setState
  // (persist-then-setState),跟 handleOpenProject 同一套規則——不能反過來包在
  // setState updater 裡面,updater 丟例外會讓 React 整棵樹白屏。
  function handleImportBoreholes(list: Borehole[]) {
    saveBoreholes(list);
    setBoreholes(list);
  }

  function handleSaveSitePlan(data: SitePlanCalibration) {
    saveSitePlan(data);
    setSitePlan(data);
  }

  function handleClearSitePlan() {
    clearSitePlan();
    setSitePlan(null);
  }

  function handleSitePlanMove(x: number, z: number) {
    if (!sitePlan) return;
    const updated: SitePlanCalibration = { ...sitePlan, manualPosition: { x, z } };
    try {
      saveSitePlan(updated);
      setSitePlan(updated);
      setDragError(null);
    } catch {
      setDragError("圖片太大,請換小一點的圖片再試一次");
    }
  }

  function handleSitePlanCalibrationChange(updated: SitePlanCalibration) {
    try {
      saveSitePlan(updated);
      setSitePlan(updated);
      setDragError(null);
    } catch {
      setDragError("圖片太大,請換小一點的圖片再試一次");
    }
  }

  function handleToggleLock(locked: boolean) {
    if (!sitePlan) return;
    const updated: SitePlanCalibration = { ...sitePlan, locked };
    try {
      saveSitePlan(updated);
      setSitePlan(updated);
      setDragError(null);
    } catch {
      setDragError("圖片太大,請換小一點的圖片再試一次");
    }
  }

  function persistProfileData(next: ProfileData): boolean {
    try {
      saveProfileData(next);
      setProfileData(next);
      setProfileError(null);
      return true;
    } catch {
      setProfileError("資料量過大,請刪減一些剖面線或地層後再試一次");
      return false;
    }
  }

  function handleToggleProfileMode(enabled: boolean) {
    setProfileModeEnabled(enabled);
    if (!enabled) setActiveLineId(null);
  }

  function handleStartNewLine(name: string, color: string) {
    const newLine: ProfileLine = { id: crypto.randomUUID(), name, color, points: [], visible: true };
    const saved = persistProfileData({ ...profileData, lines: [...profileData.lines, newLine] });
    if (saved) setActiveLineId(newLine.id);
  }

  function handleAppendPoint(lineId: string, boreholeId: string, depth: number) {
    const nextLines = profileData.lines.map((line) => {
      if (line.id !== lineId) return line;
      // 同一支鑽孔在同一條線上再點一次,是要更新這個點的深度,不是新增第二個點
      const existingIndex = line.points.findIndex((p) => p.boreholeId === boreholeId);
      if (existingIndex !== -1) {
        const nextPoints = line.points.map((p, i) => (i === existingIndex ? { ...p, depth } : p));
        return { ...line, points: nextPoints };
      }
      return { ...line, points: [...line.points, { boreholeId, depth }] };
    });
    persistProfileData({ ...profileData, lines: nextLines });
  }

  function handleUndoLastPoint(lineId: string) {
    const nextLines = profileData.lines.map((line) =>
      line.id === lineId ? { ...line, points: line.points.slice(0, -1) } : line
    );
    persistProfileData({ ...profileData, lines: nextLines });
  }

  // 讓使用者回頭繼續在一條「已經按過完成」的線上加點——重新把它設成 activeLineId,
  // 之後在鑽孔上點擊就跟建立新線時一樣,會 append 到這條線尾端
  function handleResumeLine(lineId: string) {
    setActiveLineId(lineId);
  }

  function handleDeletePoint(lineId: string, pointIndex: number) {
    const nextLines = profileData.lines.map((line) => {
      if (line.id !== lineId) return line;
      return { ...line, points: line.points.filter((_, i) => i !== pointIndex) };
    });
    persistProfileData({ ...profileData, lines: nextLines });
  }

  function handleFinishLine() {
    if (pendingBoundaryAssignment && activeLineId) {
      handleSetLayerBoundary(pendingBoundaryAssignment.layerId, pendingBoundaryAssignment.side, activeLineId);
      setPendingBoundaryAssignment(null);
    }
    setActiveLineId(null);
  }

  function handleDeleteLine(lineId: string) {
    const saved = persistProfileData({ ...profileData, lines: profileData.lines.filter((line) => line.id !== lineId) });
    if (saved && activeLineId === lineId) setActiveLineId(null);
  }

  function handleRenameLine(lineId: string, name: string) {
    const nextLines = profileData.lines.map((line) => (line.id === lineId ? { ...line, name } : line));
    persistProfileData({ ...profileData, lines: nextLines });
  }

  function handleRecolorLine(lineId: string, color: string) {
    const nextLines = profileData.lines.map((line) => (line.id === lineId ? { ...line, color } : line));
    persistProfileData({ ...profileData, lines: nextLines });
  }

  function handleToggleLineVisibility(lineId: string, visible: boolean) {
    const nextLines = profileData.lines.map((line) => (line.id === lineId ? { ...line, visible } : line));
    persistProfileData({ ...profileData, lines: nextLines });
  }

  function handleToggleLineContour(lineId: string, showContour: boolean) {
    const nextLines = profileData.lines.map((line) => (line.id === lineId ? { ...line, showContour } : line));
    persistProfileData({ ...profileData, lines: nextLines });
  }

  function handleChangeContourSettings(next: ContourSettings) {
    saveContourSettings(next);
    setContourSettings(next);
  }

  function handleSoilColorChange(code: string, color: string) {
    // saveSoilStyles 可能丟 QuotaExceededError;setState updater 是在 render 期間執行,
    // 若在裡面呼叫會讓例外變成 render 錯誤,專案目前沒有 ErrorBoundary,會整頁白屏。
    // 所以把可能丟例外的寫入動作挪到 updater 外面,確定成功才 setState(比照
    // persistProfileData / handleSitePlanMove 的處理方式)。
    const next: SoilStyles = { ...soilStyles, [code]: { ...soilStyles[code], color } };
    try {
      saveSoilStyles(next);
      setSoilColorError(null);
    } catch {
      setSoilColorError("儲存空間不足,顏色設定無法保存");
      return;
    }
    setSoilStyles(next);
  }

  // 目前清掉整張表(含未來的 patternId);花紋功能實作時要重新決定「恢復預設顏色」
  // 是否應保留 patternId。
  function handleResetSoilColors() {
    try {
      saveSoilStyles({});
      setSoilColorError(null);
    } catch {
      setSoilColorError("儲存空間不足,顏色設定無法保存");
      return;
    }
    setSoilStyles({});
  }

  function handleChangeModelSettings(next: ModelSettings) {
    try {
      saveModelSettings(next);
    } catch {
      return; // 比照 handleBarWidthSettingsChange:寫入失敗就不套用,避免畫面與儲存不一致
    }
    setModelSettings(next);
  }

  function handleLayerPinchOutChange(layerId: string, ratio: number | null) {
    setPinchOutByLayer((prev) => (prev[layerId] === ratio ? prev : { ...prev, [layerId]: ratio }));
  }

  function handleBarWidthSettingsChange(next: BarWidthSettings) {
    try {
      saveBarWidthSettings(next);
    } catch {
      return;
    }
    setBarWidthSettings(next);
  }

  function persistBoreholeGroups(next: BoreholeGroup[]) {
    saveBoreholeGroups(next);
    setBoreholeGroups(next);
  }

  function handleCreateGroup(name: string, boreholeIds: string[]) {
    const newGroup: BoreholeGroup = { id: crypto.randomUUID(), name, boreholeIds };
    persistBoreholeGroups([...boreholeGroups, newGroup]);
  }

  function handleRenameGroup(groupId: string, name: string) {
    persistBoreholeGroups(boreholeGroups.map((g) => (g.id === groupId ? { ...g, name } : g)));
  }

  function handleUpdateGroupBoreholeIds(groupId: string, boreholeIds: string[]) {
    persistBoreholeGroups(boreholeGroups.map((g) => (g.id === groupId ? { ...g, boreholeIds } : g)));
  }

  function handleDeleteGroup(groupId: string) {
    persistBoreholeGroups(boreholeGroups.filter((g) => g.id !== groupId));
  }

  function handleDragPointDepth(lineId: string, pointIndex: number, depth: number) {
    const nextLines = profileData.lines.map((line) => {
      if (line.id !== lineId) return line;
      const nextPoints = line.points.map((pt, i) => (i === pointIndex ? { ...pt, depth } : pt));
      return { ...line, points: nextPoints };
    });
    persistProfileData({ ...profileData, lines: nextLines });
  }

  function handleCreateLayer(name: string, color: string) {
    const newLayer: ProfileLayer = { id: crypto.randomUUID(), name, color, topBoundaryId: null, bottomBoundaryId: null };
    persistProfileData({ ...profileData, layers: [...profileData.layers, newLayer] });
  }

  function handleDeleteLayer(layerId: string) {
    persistProfileData({ ...profileData, layers: profileData.layers.filter((l) => l.id !== layerId) });
  }

  function handleRenameLayer(layerId: string, name: string) {
    const nextLayers = profileData.layers.map((l) => (l.id === layerId ? { ...l, name } : l));
    persistProfileData({ ...profileData, layers: nextLayers });
  }

  function handleRecolorLayer(layerId: string, color: string) {
    const nextLayers = profileData.layers.map((l) => (l.id === layerId ? { ...l, color } : l));
    persistProfileData({ ...profileData, layers: nextLayers });
  }

  function handleSetLayerBoundary(layerId: string, side: "top" | "bottom", boundaryId: string | null) {
    const nextLayers = profileData.layers.map((l) =>
      l.id === layerId ? { ...l, [side === "top" ? "topBoundaryId" : "bottomBoundaryId"]: boundaryId } : l
    );
    persistProfileData({ ...profileData, layers: nextLayers });
  }

  function handleStartNewLineForLayer(name: string, color: string, layerId: string, side: "top" | "bottom") {
    const newLine: ProfileLine = { id: crypto.randomUUID(), name, color, points: [], visible: true };
    const saved = persistProfileData({ ...profileData, lines: [...profileData.lines, newLine] });
    if (saved) {
      setActiveLineId(newLine.id);
      setPendingBoundaryAssignment({ layerId, side });
    }
  }

  function handleSaveProject() {
    const json = serializeProject(boreholes, sitePlan, profileData, contourSettings, boreholeGroups, soilStyles, barWidthSettings, modelSettings);
    const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "鑽孔專案.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleOpenProject(file: File) {
    try {
      const text = await file.text();
      const project = parseProjectFile(text);
      // 所有「可能丟例外」的動作(寫 localStorage)都先做完,確定都成功之後才開始
      // setState——避免半套用:如果 saveProfileData 丟例外時 setBoreholes/setSitePlan
      // 已經呼叫過,畫面就會停在「鑽孔資料/配置圖換新了,但剖面資料還是舊的」這種
      // 不一致狀態。先把會丟例外的動作全部做完,才能保證失敗時完全不動到既有 state。
      if (project.sitePlan) saveSitePlan(project.sitePlan);
      else clearSitePlan();
      saveProfileData(project.profileData);
      saveContourSettings(project.contourSettings);
      saveBoreholeGroups(project.boreholeGroups);
      saveSoilStyles(project.soilStyles);
      saveBarWidthSettings(project.barWidthSettings);
      saveModelSettings(project.modelSettings);
      saveBoreholes(project.boreholes);
      setBoreholes(project.boreholes);
      setSitePlan(project.sitePlan);
      setProfileData(project.profileData);
      setContourSettings(project.contourSettings);
      setBoreholeGroups(project.boreholeGroups);
      setSoilStyles(project.soilStyles);
      setBarWidthSettings(project.barWidthSettings);
      setModelSettings(project.modelSettings);
      setPinchOutByLayer({});
      // 換了一整包新資料,任何殘留的「正在畫」狀態都可能參照到舊資料,重置回乾淨狀態
      setProfileModeEnabled(false);
      setActiveLineId(null);
      setPendingBoundaryAssignment(null);
      setProjectError(null);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "專案檔案讀取失敗");
    }
  }

  function handleToggleBoreholeSelection(boreholeId: string, selected: boolean) {
    setSelectedBoreholeIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(boreholeId);
      else next.delete(boreholeId);
      return next;
    });
  }

  function handleSelectAllBoreholes2D() {
    setSelectedBoreholeIds(new Set(boreholes.map((b) => b.id)));
  }

  function handleClearAllBoreholes2D() {
    setSelectedBoreholeIds(new Set());
  }

  function handleToggleBoreholeSelection3D(boreholeId: string, selected: boolean) {
    setSelectedBoreholeIds3D((prev) => {
      const next = new Set(prev);
      if (selected) next.add(boreholeId);
      else next.delete(boreholeId);
      return next;
    });
  }

  function handleSelectAllBoreholes3D() {
    setSelectedBoreholeIds3D(new Set(boreholes.map((b) => b.id)));
  }

  function handleClearAllBoreholes3D() {
    setSelectedBoreholeIds3D(new Set());
  }

  // useMemo 保持陣列參照穩定:少了它,每次 App render(例如色票拖曳中連續觸發的
  // handleSoilColorChange)都會產生新陣列,讓 ContourSurface 的 memo 鏈整條失效,
  // 變成每個 tick 都重算整張等值面。
  const visibleBoreholes3D = useMemo(
    () => boreholes.filter((b) => selectedBoreholeIds3D.has(b.id)),
    [boreholes, selectedBoreholeIds3D]
  );

  // 全域 qc 比例尺:看「全部」鑽孔而非目前勾選的子集——隱藏某支孔不應改變其他孔
  // 曲線的比例,否則孔間比較的意義就沒了。
  const qcMax = useMemo(() => globalQcMax(boreholes), [boreholes]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      {viewMode === "3d" ? (
        visibleBoreholes3D.length > 0 ? (
          <Scene
            boreholes={visibleBoreholes3D}
            sitePlan={sitePlan}
            onSitePlanMove={handleSitePlanMove}
            onSitePlanCalibrationChange={handleSitePlanCalibrationChange}
            displayMode={displayMode}
            showGrid={showGrid}
            profileLines={profileData.lines}
            profileModeEnabled={profileModeEnabled}
            activeLineId={activeLineId}
            depthSnapMode={depthSnapMode}
            onAppendPoint={handleAppendPoint}
            onDragPointDepth={handleDragPointDepth}
            contourSettings={contourSettings}
            onContourExtentChange={setContourExtent}
            soilStyles={soilStyles}
            profileLayers={profileData.layers}
            modelSettings={modelSettings}
            onLayerPinchOutChange={handleLayerPinchOutChange}
            qcMax={qcMax}
            quickInsert={quickInsert}
            onQuickInsertPlace={handleQuickInsertPlace}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#666",
              fontSize: 16,
              fontFamily: "sans-serif",
              background: "#e9eff5",
            }}
          >
            請至少勾選一支鑽孔
          </div>
        )
      ) : comparisonModeEnabled ? (
        <ProfileComparisonView
          boreholes={boreholes}
          groups={boreholeGroups}
          profileLines={profileData.lines}
          profileModeEnabled={profileModeEnabled}
          activeLineId={activeLineId}
          depthSnapMode={depthSnapMode}
          axisMode={axisMode}
          onChangeAxisMode={setAxisMode}
          showGrid={showGrid}
          onAppendPoint={handleAppendPoint}
          onDragPointDepth={handleDragPointDepth}
          onCreateGroup={handleCreateGroup}
          onRenameGroup={handleRenameGroup}
          onUpdateGroupBoreholeIds={handleUpdateGroupBoreholeIds}
          onDeleteGroup={handleDeleteGroup}
          soilStyles={soilStyles}
          barWidthSettings={barWidthSettings}
          onExportPdf={handleExportComparison}
        />
      ) : (
        <ProfileSection2D
          boreholes={boreholes}
          selectedBoreholeIds={selectedBoreholeIds}
          profileLines={profileData.lines}
          profileModeEnabled={profileModeEnabled}
          activeLineId={activeLineId}
          depthSnapMode={depthSnapMode}
          axisMode={axisMode}
          showGrid={showGrid}
          onAppendPoint={handleAppendPoint}
          onDragPointDepth={handleDragPointDepth}
          soilStyles={soilStyles}
          barWidthSettings={barWidthSettings}
        />
      )}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          alignItems: "flex-start",
          pointerEvents: "none",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <SoilLegend
            soilStyles={soilStyles}
            onColorChange={handleSoilColorChange}
            onResetColors={handleResetSoilColors}
            error={soilColorError}
          />
          {viewMode === "3d" && contourExtent && <ContourLegend extent={contourExtent} />}
        </div>
        <ProjectManager onSaveProject={handleSaveProject} onOpenProject={handleOpenProject} error={projectError} />
      </div>
      <DataUploader onImport={handleImportBoreholes} />
      <DisplayModeToggle displayMode={displayMode} onChange={setDisplayMode} />
      <GridToggle showGrid={showGrid} onChange={setShowGrid} />
      <ViewModeToggle viewMode={viewMode} onChange={setViewMode} />
      {viewMode === "2d" && (
        <ProfileComparisonToggle enabled={comparisonModeEnabled} onChange={setComparisonModeEnabled} />
      )}
      {viewMode === "2d" && !comparisonModeEnabled && (
        <BoreholeChecklist
          boreholes={boreholes}
          selectedIds={selectedBoreholeIds}
          onToggle={handleToggleBoreholeSelection}
          onSelectAll={handleSelectAllBoreholes2D}
          onClearAll={handleClearAllBoreholes2D}
          title="選擇鑽孔(2D 剖面)"
          storageKey="profile2d"
          extraControls={
            <div style={{ fontSize: 11 }}>
              <label style={{ display: "block", marginBottom: 2 }}>
                <input
                  type="radio"
                  name="axisMode"
                  checked={axisMode === "projected"}
                  onChange={() => setAxisMode("projected")}
                />{" "}
                投影剖面距離
              </label>
              <label style={{ display: "block" }}>
                <input
                  type="radio"
                  name="axisMode"
                  checked={axisMode === "sequential"}
                  onChange={() => setAxisMode("sequential")}
                />{" "}
                鑽孔間直線距離
              </label>
              <ExportPdfButton
                label="匯出 PDF"
                disabled={boreholes.filter((b) => selectedBoreholeIds.has(b.id)).length < 2}
                onExport={handleExportSingle2D}
                style={{ marginTop: 6, width: "100%" }}
              />
            </div>
          }
        />
      )}
      {viewMode === "3d" && (
        <BoreholeChecklist
          boreholes={boreholes}
          selectedIds={selectedBoreholeIds3D}
          onToggle={handleToggleBoreholeSelection3D}
          onSelectAll={handleSelectAllBoreholes3D}
          onClearAll={handleClearAllBoreholes3D}
          title="選擇鑽孔(3D 場景)"
        />
      )}
      <SitePlanUploader
        sitePlan={sitePlan}
        defaultGroundElevation={avgGroundElevation}
        onSave={handleSaveSitePlan}
        onClear={handleClearSitePlan}
        dragError={dragError}
        onToggleLock={handleToggleLock}
        onQuickInsert={handleQuickInsertStart}
        quickInsertActive={quickInsert !== null}
        onQuickInsertCancel={() => setQuickInsert(null)}
      />
      <ProfileDrawer
        profileModeEnabled={profileModeEnabled}
        onToggleProfileMode={handleToggleProfileMode}
        depthSnapMode={depthSnapMode}
        onChangeDepthSnapMode={setDepthSnapMode}
        lines={profileData.lines}
        boreholes={boreholes}
        activeLineId={activeLineId}
        onStartNewLine={handleStartNewLine}
        onResumeLine={handleResumeLine}
        onUndoLastPoint={handleUndoLastPoint}
        onFinishLine={handleFinishLine}
        onDeleteLine={handleDeleteLine}
        onDeletePoint={handleDeletePoint}
        onEditPointDepth={handleDragPointDepth}
        onRenameLine={handleRenameLine}
        onRecolorLine={handleRecolorLine}
        onToggleLineVisibility={handleToggleLineVisibility}
        onToggleLineContour={handleToggleLineContour}
        contourSettings={contourSettings}
        onChangeContourSettings={handleChangeContourSettings}
        layers={profileData.layers}
        onCreateLayer={handleCreateLayer}
        onDeleteLayer={handleDeleteLayer}
        onRenameLayer={handleRenameLayer}
        onRecolorLayer={handleRecolorLayer}
        onSetLayerBoundary={handleSetLayerBoundary}
        onStartNewLineForLayer={handleStartNewLineForLayer}
        error={profileError}
      />
      {viewMode === "2d" && (
        <div style={{ position: "absolute", bottom: 116, right: 16, pointerEvents: "none" }}>
          <BarWidthSettingsPanel settings={barWidthSettings} onChange={handleBarWidthSettingsChange} />
        </div>
      )}
      {viewMode === "3d" && (
        // 跟 2D 的柱寬面板共用同一個右下插槽(bottom:116):兩者分屬不同 viewMode
        // 不會同時出現,ProfileDrawer 的 maxHeight 計算也已經把這個位置讓出來了。
        <div style={{ position: "absolute", bottom: 116, right: 16, pointerEvents: "none" }}>
          <LayerModelPanel
            profileData={profileData}
            settings={modelSettings}
            onChange={handleChangeModelSettings}
            pinchOutByLayer={pinchOutByLayer}
            contourInterpolator={contourSettings.interpolator}
          />
        </div>
      )}
    </div>
  );
}

export default App;
