import type { BoreholeGroup } from "./boreholeGroupStorage";
import type { VerticalViewBox } from "../components/ProfileSection2D";

// 每個群組各自獨立一份垂直(高程)view state,取代「所有面板共用一份」的舊行為
// (那個行為的問題:改任一群組的鑽孔成員,會悄悄重置所有面板的縮放/平移)。
// 用「這個群組自己上一次的鑽孔成員簽章」分辨「這個群組自己變了」跟「別的群組變了」
// ——只有前者需要重算這個群組的初始範圍,後者完全不動(不管是初始範圍還是使用者
// 手動調過的)。簽章用排序後的 join,鑽孔勾選順序不同但成員相同不算「變了」。
export function resolveNextVerticalViewBoxes(
  groups: BoreholeGroup[],
  prevBoxes: Record<string, VerticalViewBox>,
  prevMembershipKeys: Record<string, string>,
  initialBox: VerticalViewBox,
): { boxes: Record<string, VerticalViewBox>; membershipKeys: Record<string, string>; changed: boolean } {
  const boxes = { ...prevBoxes };
  const membershipKeys = { ...prevMembershipKeys };
  let changed = false;

  for (const group of groups) {
    const key = [...group.boreholeIds].sort().join(",");
    const isNewGroup = !(group.id in prevBoxes);
    const membershipChanged = prevMembershipKeys[group.id] !== key;
    if (isNewGroup || membershipChanged) {
      boxes[group.id] = initialBox;
      changed = true;
    }
    membershipKeys[group.id] = key;
  }

  for (const groupId of Object.keys(boxes)) {
    if (!groups.some((g) => g.id === groupId)) {
      delete boxes[groupId];
      delete membershipKeys[groupId];
      changed = true;
    }
  }

  return { boxes, membershipKeys, changed };
}
