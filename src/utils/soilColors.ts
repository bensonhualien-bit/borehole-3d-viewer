// USCS 土層代碼對照表(依實際鑽探資料的分層代碼)
export const USCS_COLORS: Record<string, { color: string; label: string }> = {
  non: { color: "#b0aca3", label: "未分類/表土" },
  SF: { color: "#c9b380", label: "填土(砂質填土)" },
  con: { color: "#9a9a9a", label: "混凝土" },
  CL: { color: "#8a9a5b", label: "低塑性黏土" },
  ML: { color: "#a89984", label: "低塑性粉土" },
  SM: { color: "#e0c068", label: "粉土質砂" },
};
