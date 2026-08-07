import { useEffect, useRef, useState } from "react";
import type { SitePlanCalibration } from "../utils/sitePlanStorage";
import { calibrationToPlacement, placementToCalibration } from "../utils/sitePlanQuickInsert";
import { nextZoom } from "../utils/zoom";

interface SitePlanUploaderProps {
  sitePlan: SitePlanCalibration | null;
  defaultGroundElevation: number;
  onSave: (data: SitePlanCalibration) => void;
  onClear: () => void;
  dragError?: string | null;
  onToggleLock: (locked: boolean) => void;
  /** 進入快速插入放置模式;payload 為圖片與高程(此時可能還沒有 sitePlan) */
  onQuickInsert: (payload: { imageDataUrl: string; imageWidth: number; imageHeight: number; elevation: number }) => void;
  /** 放置模式進行中(按鈕變「取消放置」) */
  quickInsertActive: boolean;
  onQuickInsertCancel: () => void;
}

interface PendingPoint {
  px: number;
  py: number;
  x: string;
  y: string;
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

export function SitePlanUploader({
  sitePlan,
  defaultGroundElevation,
  onSave,
  onClear,
  dragError,
  onToggleLock,
  onQuickInsert,
  quickInsertActive,
  onQuickInsertCancel,
}: SitePlanUploaderProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(sitePlan?.imageDataUrl ?? null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(
    sitePlan ? { width: sitePlan.imageWidth, height: sitePlan.imageHeight } : null
  );
  const [points, setPoints] = useState<PendingPoint[]>([]);
  const [groundElevation, setGroundElevation] = useState(
    String(sitePlan?.groundElevation ?? defaultGroundElevation)
  );
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  // 寬度/角度欄:顯示 calibrationToPlacement 反算值,可打字後 Enter/失焦套用。
  // 用文字 state 而不是直接綁數值:打到一半(例如「12.」)不能立刻套用/覆寫。
  const [widthText, setWidthText] = useState("");
  const [angleText, setAngleText] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  useEffect(() => {
    if (!sitePlan) return;
    const p = calibrationToPlacement(sitePlan);
    setWidthText(p.widthMeters.toFixed(1));
    setAngleText(p.rotationDeg.toFixed(1));
    setFieldError(null);
  }, [sitePlan]);

  function commitPlacementFields() {
    if (!sitePlan || sitePlan.locked) return;
    const w = Number(widthText);
    const a = Number(angleText);
    if (!Number.isFinite(w) || w <= 0) {
      setFieldError("寬度必須是大於 0 的數字");
      return;
    }
    if (!Number.isFinite(a)) {
      setFieldError("角度必須是數字");
      return;
    }
    const current = calibrationToPlacement(sitePlan);
    const next = placementToCalibration(
      { ...current, widthMeters: w, rotationDeg: a },
      { dataUrl: sitePlan.imageDataUrl, width: sitePlan.imageWidth, height: sitePlan.imageHeight },
      sitePlan.groundElevation,
      sitePlan.locked,
    );
    try {
      onSave(next);
      setFieldError(null);
    } catch {
      setFieldError("圖片太大,請換小一點的圖片再試一次");
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(reader.result as string);
      setImageSize(null);
      setPoints([]);
      setError(null);
    };
    reader.readAsDataURL(file);
  }

  function handleImageLoad() {
    if (imgRef.current) {
      setImageSize({ width: imgRef.current.naturalWidth, height: imgRef.current.naturalHeight });
    }
  }

  // React registers JSX onWheel handlers as passive, so e.preventDefault() inside
  // them cannot stop native scroll. Attach the listener natively as non-passive
  // so zooming doesn't also scroll the page/container.
  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => nextZoom(z, e.deltaY));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [imageDataUrl]);

  function handleImageClick(e: React.MouseEvent<HTMLImageElement>) {
    if (points.length >= 2 || !imgRef.current || !imageSize) return;
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = imageSize.width / rect.width;
    const scaleY = imageSize.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    setPoints((prev) => [...prev, { px, py, x: "", y: "" }]);
  }

  function updatePoint(index: number, field: "x" | "y", value: string) {
    setPoints((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }

  function handleApply() {
    if (points.length < 2 || !imageDataUrl || !imageSize) {
      setError("請先點選 2 個參考點並輸入座標");
      return;
    }
    const [p1, p2] = points;
    if ([p1.x, p1.y, p2.x, p2.y, groundElevation].some((s) => s.trim() === "")) {
      setError("座標與高程不可留空");
      return;
    }
    const xA = Number(p1.x);
    const yA = Number(p1.y);
    const xB = Number(p2.x);
    const yB = Number(p2.y);
    const elevation = Number(groundElevation);
    if ([xA, yA, xB, yB, elevation].some((n) => Number.isNaN(n))) {
      setError("座標與高程必須是數字");
      return;
    }
    if (Math.hypot(p2.px - p1.px, p2.py - p1.py) < 1 || Math.hypot(xB - xA, yB - yA) < 1) {
      setError("兩個參考點距離太近,請重新點選");
      return;
    }
    try {
      onSave({
        imageDataUrl,
        imageWidth: imageSize.width,
        imageHeight: imageSize.height,
        pointA: { px: p1.px, py: p1.py, x: xA, y: yA },
        pointB: { px: p2.px, py: p2.py, x: xB, y: yB },
        groundElevation: elevation,
      });
      setError(null);
    } catch {
      setError("圖片太大,請換小一點的圖片再試一次");
    }
  }

  const quickInsertReady =
    imageDataUrl !== null && imageSize !== null && !Number.isNaN(Number(groundElevation)) && groundElevation.trim() !== "";

  function handleQuickInsert() {
    if (!imageDataUrl || !imageSize) return;
    onQuickInsert({
      imageDataUrl,
      imageWidth: imageSize.width,
      imageHeight: imageSize.height,
      elevation: Number(groundElevation),
    });
  }

  function handleClear() {
    setImageDataUrl(null);
    setImageSize(null);
    setPoints([]);
    setError(null);
    onClear();
  }

  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: 16,
        background: "rgba(30,30,30,0.85)",
        color: "#fff",
        padding: "12px 14px",
        borderRadius: 8,
        fontSize: 13,
        fontFamily: "sans-serif",
        maxWidth: 320,
        maxHeight: "70vh",
        overflowY: "auto",
      }}
    >
      <div style={{ marginBottom: 8, fontWeight: "bold" }}>廠區配置圖</div>

      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ fontSize: 12, marginBottom: 8, width: "100%" }}
      />

      {imageDataUrl && (
        <div
          ref={previewContainerRef}
          style={{ width: "100%", height: 200, overflow: "auto", marginBottom: 8 }}
        >
          <img
            ref={imgRef}
            src={imageDataUrl}
            onLoad={handleImageLoad}
            onClick={handleImageClick}
            alt="廠區配置圖預覽"
            style={{ width: `${288 * zoom}px`, cursor: points.length < 2 ? "crosshair" : "default" }}
          />
        </div>
      )}

      {points.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: 4, marginBottom: 4, alignItems: "center" }}>
          <span>點{i + 1}</span>
          <input
            type="text"
            placeholder="真實 X"
            value={p.x}
            onChange={(e) => updatePoint(i, "x", e.target.value)}
            style={{ width: 70, fontSize: 12 }}
          />
          <input
            type="text"
            placeholder="真實 Y"
            value={p.y}
            onChange={(e) => updatePoint(i, "y", e.target.value)}
            style={{ width: 70, fontSize: 12 }}
          />
        </div>
      ))}

      <div style={{ marginBottom: 8 }}>
        <label style={{ display: "block", marginBottom: 4 }}>地面高程 (EL, m)</label>
        <input
          type="text"
          value={groundElevation}
          onChange={(e) => setGroundElevation(e.target.value)}
          style={{ width: "100%", fontSize: 12 }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {quickInsertActive ? (
          <button type="button" onClick={onQuickInsertCancel} style={buttonStyle}>
            取消放置(Esc)
          </button>
        ) : (
          <button
            type="button"
            onClick={handleQuickInsert}
            disabled={!quickInsertReady}
            style={{ ...buttonStyle, opacity: quickInsertReady ? 1 : 0.45, cursor: quickInsertReady ? "pointer" : "default" }}
          >
            快速插入
          </button>
        )}
      </div>

      {sitePlan && (
        <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-end" }}>
          <label style={{ fontSize: 12 }}>
            圖片寬度(m)
            <input
              type="text"
              value={widthText}
              disabled={sitePlan.locked ?? false}
              onChange={(e) => setWidthText(e.target.value)}
              onBlur={commitPlacementFields}
              onKeyDown={(e) => e.key === "Enter" && commitPlacementFields()}
              style={{ width: 70, fontSize: 12, display: "block", borderColor: fieldError ? "#ff9d9d" : undefined }}
            />
          </label>
          <label style={{ fontSize: 12 }}>
            角度(°)
            <input
              type="text"
              value={angleText}
              disabled={sitePlan.locked ?? false}
              onChange={(e) => setAngleText(e.target.value)}
              onBlur={commitPlacementFields}
              onKeyDown={(e) => e.key === "Enter" && commitPlacementFields()}
              style={{ width: 60, fontSize: 12, display: "block", borderColor: fieldError ? "#ff9d9d" : undefined }}
            />
          </label>
        </div>
      )}
      {fieldError && <div style={{ color: "#ff9d9d", marginBottom: 8 }}>{fieldError}</div>}

      {error && <div style={{ color: "#ff9d9d", marginBottom: 8 }}>{error}</div>}
      {dragError && <div style={{ color: "#ff9d9d", marginBottom: 8 }}>{dragError}</div>}

      {sitePlan && (
        <label style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={sitePlan.locked ?? false}
            onChange={(e) => onToggleLock(e.target.checked)}
          />
          鎖定位置
        </label>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={handleApply} style={buttonStyle}>
          套用
        </button>
        <button type="button" onClick={handleClear} style={buttonStyle}>
          清除
        </button>
      </div>
    </div>
  );
}
