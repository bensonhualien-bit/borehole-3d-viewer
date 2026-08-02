// 高斯消去法(含部分主元交換)解線性方程組 Ax = b。矩陣不可解(奇異矩陣,消去過程
// 主元趨近於 0)時回傳 null,呼叫端視為「無資料」——理論上的退化情況(例如點位
// 重複導致係數矩陣線性相關),不強行算出不穩定的結果。
export function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  // 用增廣矩陣做法(每一列多存一個 b 值),複製一份避免修改呼叫端傳進來的陣列
  const augmented = matrix.map((row, i) => [...row, vector[i]]);

  for (let col = 0; col < n; col++) {
    // 部分主元交換:選這一欄絕對值最大的列換到對角線位置,避免除以過小的數字造成數值不穩定
    let pivotRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivotRow][col])) {
        pivotRow = row;
      }
    }
    if (Math.abs(augmented[pivotRow][col]) < 1e-10) return null; // 奇異矩陣
    [augmented[col], augmented[pivotRow]] = [augmented[pivotRow], augmented[col]];

    for (let row = col + 1; row < n; row++) {
      const factor = augmented[row][col] / augmented[col][col];
      for (let k = col; k <= n; k++) {
        augmented[row][k] -= factor * augmented[col][k];
      }
    }
  }

  // 回代
  const solution = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = augmented[row][n];
    for (let col = row + 1; col < n; col++) {
      sum -= augmented[row][col] * solution[col];
    }
    solution[row] = sum / augmented[row][row];
  }
  return solution;
}
