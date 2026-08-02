// 單一地層區間
export interface SoilLayer {
  /** 從地表起算的頂深度 (m) */
  topDepth: number;
  /** 從地表起算的底深度 (m) */
  bottomDepth: number;
  /** 岩性/土層名稱,例如 "回填土"、"黏土"、"砂質土"、"風化岩" */
  soilType: string;
  /** 圖層顏色 (CSS 色碼) */
  color: string;
  /** 選填備註,例如 SPT-N 值、含水量等 */
  note?: string;
}

// 單一 SPT 打擊測試量測值
export interface SptMeasurement {
  topDepth: number;
  bottomDepth: number;
  nValue: number;
}

// 單一 RQD(岩心品質指標)量測區段
export interface RqdSegment {
  topDepth: number;
  bottomDepth: number;
  /** 百分比,0~100 */
  rqd: number;
}

// 單一 CPT 貫入測試樣本
export interface CptSample {
  depth: number;
  /** 錐尖阻抗,kg/cm² */
  qc: number;
}

// 單一鑽孔
export interface Borehole {
  id: string;
  /** 鑽孔名稱,例如 "BH-1" */
  name: string;
  /** 平面座標 X (m) */
  x: number;
  /** 平面座標 Y (m) */
  y: number;
  /** 地表高程 (m),做為柱狀圖頂部基準 */
  groundElevation: number;
  /** 依深度排序的地層清單;CPT 測點(無土層分類)此欄位為空陣列 */
  layers: SoilLayer[];
  /** SPT-N 量測值,選填(CSV 匯入或 CPT 測點不會有此欄位) */
  sptn?: SptMeasurement[];
  /** RQD 量測值,選填 */
  rqd?: RqdSegment[];
  /** CPT 貫入曲線樣本,選填(只有 CPT 測點會有) */
  cptCurve?: CptSample[];
}
