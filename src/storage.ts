// 对戒配石台 —— 浏览器存档 + 预置数据
//
// 数据只存 localStorage，刷新保留；清空站点数据或点“恢复出厂预置”可回到初始状态。

import {
  COLOR_GRADES,
  SHAPES,
  type BenchState,
  type ColorGrade,
  type Order,
  type Shape,
  type Stone,
} from "./matching";

const STORAGE_KEY = "ring-pair-bench:v1";

// 预置十四颗裸石。刻意安排的局面：
//   圆形 6 颗 —— 最优 S02+S03 合格，ORD-01 先配；ORD-02 再来时最优候选被占用，拒绝。
//   椭圆 4 颗 —— 最优 S07+S08 色级差两级，拒绝；合格的 S09+S10 不做“退而求其次”。
//   梨形 2 颗 —— 暂无订单，留作干扰候选。
//   祖母绿切 2 颗 —— 唯一一对合格，ORD-04 配对。
export const SEED_STONES: Stone[] = [
  { id: "S01", shape: "圆形", carat: 0.302, color: "D" },
  { id: "S02", shape: "圆形", carat: 0.308, color: "F" },
  { id: "S03", shape: "圆形", carat: 0.310, color: "E" },
  { id: "S04", shape: "圆形", carat: 0.312, color: "G" },
  { id: "S05", shape: "圆形", carat: 0.318, color: "H" },
  { id: "S06", shape: "圆形", carat: 0.322, color: "H" },
  { id: "S07", shape: "椭圆", carat: 0.501, color: "F" },
  { id: "S08", shape: "椭圆", carat: 0.504, color: "D" },
  { id: "S09", shape: "椭圆", carat: 0.512, color: "J" },
  { id: "S10", shape: "椭圆", carat: 0.515, color: "I" },
  { id: "S11", shape: "梨形", carat: 0.405, color: "G" },
  { id: "S12", shape: "梨形", carat: 0.41, color: "F" },
  { id: "S13", shape: "祖母绿切", carat: 0.601, color: "F" },
  { id: "S14", shape: "祖母绿切", carat: 0.611, color: "F" },
];

export const SEED_ORDERS: Order[] = [
  { id: "ORD-01", customer: "林家对戒", shape: "圆形" },
  { id: "ORD-02", customer: "周家对戒", shape: "圆形" },
  { id: "ORD-03", customer: "陈家对戒", shape: "椭圆" },
  { id: "ORD-04", customer: "赵家对戒", shape: "祖母绿切" },
];

export function seedState(): BenchState {
  return {
    stones: SEED_STONES.map((s) => ({ ...s })),
    orders: SEED_ORDERS.map((o) => ({ ...o })),
    pairs: [],
  };
}

const isShape = (v: unknown): v is Shape =>
  typeof v === "string" && (SHAPES as readonly string[]).includes(v);

const isColor = (v: unknown): v is ColorGrade =>
  typeof v === "string" && (COLOR_GRADES as readonly string[]).includes(v);

function validStone(s: unknown): s is Stone {
  if (typeof s !== "object" || s === null) return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    isShape(o.shape) &&
    typeof o.carat === "number" &&
    Number.isFinite(o.carat) &&
    isColor(o.color)
  );
}

function validOrder(o: unknown): o is Order {
  if (typeof o !== "object" || o === null) return false;
  const v = o as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.customer === "string" &&
    isShape(v.shape)
  );
}

/** 读档；结构坏掉或缺关键字段时直接回到预置，单条坏配对则修剪掉。 */
export function loadState(): BenchState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return seedState();
    const data = parsed as Record<string, unknown>;
    if (!Array.isArray(data.stones) || !Array.isArray(data.orders)) {
      return seedState();
    }

    const stones = data.stones.filter(validStone);
    const orders = data.orders.filter(validOrder);
    if (stones.length === 0 || orders.length === 0) return seedState();

    const stoneIds = new Set(stones.map((s) => s.id));
    const orderIds = new Set(orders.map((o) => o.id));
    const usedStoneIds = new Set<string>();
    const pairs: BenchState["pairs"] = [];

    const list = Array.isArray(data.pairs) ? data.pairs : [];
    for (const item of list) {
      if (typeof item !== "object" || item === null) continue;
      const p = item as Record<string, unknown>;
      if (
        typeof p.orderId !== "string" ||
        !Array.isArray(p.stoneIds) ||
        p.stoneIds.length !== 2 ||
        typeof p.stoneIds[0] !== "string" ||
        typeof p.stoneIds[1] !== "string"
      ) {
        continue;
      }
      const [a, b] = p.stoneIds as [string, string];
      if (
        !orderIds.has(p.orderId) ||
        a === b ||
        !stoneIds.has(a) ||
        !stoneIds.has(b) ||
        usedStoneIds.has(a) ||
        usedStoneIds.has(b)
      ) {
        continue;
      }
      usedStoneIds.add(a);
      usedStoneIds.add(b);
      pairs.push({
        orderId: p.orderId,
        stoneIds: [a, b],
        pairedAt: typeof p.pairedAt === "number" ? p.pairedAt : Date.now(),
      });
    }

    return { stones, orders, pairs };
  } catch {
    return seedState();
  }
}

export function saveState(state: BenchState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式 / 配额满时静默失败，当前会话仍可操作。
  }
}

export function resetState(): BenchState {
  const fresh = seedState();
  saveState(fresh);
  return fresh;
}
