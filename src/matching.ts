// ============================================================
// 配对判定（业务文件一）
// 对戒配石规则：
//   · 外形必须相同
//   · 克拉差 ≤ 0.02（含）
//   · 色级差 ≤ 1 级（D–J 共 7 级）
// 挑石按克拉差最小优先；最优候选超出色级差、或被其他订单占用，
// 整次拒绝，已配对记录不动。
// ============================================================

export const CARAT_TOLERANCE = 0.02;
export const COLOR_TOLERANCE = 1;

export const SHAPES = ["圆形", "椭圆", "梨形", "祖母绿切"] as const;
export type Shape = (typeof SHAPES)[number];

/** 色级表，索引即级数，差值取索引差的绝对值 */
export const COLOR_GRADES = ["D", "E", "F", "G", "H", "I", "J"] as const;
export type ColorGrade = (typeof COLOR_GRADES)[number];

export interface Stone {
  id: string;
  shape: Shape;
  carat: number;
  color: ColorGrade;
  clarity: string;
}

export interface Pair {
  a: string;
  b: string;
}

export interface Order {
  id: string;
  title: string;
  shape: Shape;
  pair: Pair | null;
}

export interface BenchState {
  stones: Stone[];
  orders: Order[];
}

// ------------------------------------------------------------
// 预置数据：14 颗裸石 + 4 张订单（每单两颗）
// ------------------------------------------------------------

export const SEED_STONES: Stone[] = [
  // 圆形 5 颗：全局最优对为 ST-01 + ST-02
  { id: "ST-01", shape: "圆形", carat: 0.5, color: "F", clarity: "VS1" },
  { id: "ST-02", shape: "圆形", carat: 0.51, color: "G", clarity: "VS2" },
  { id: "ST-03", shape: "圆形", carat: 0.53, color: "E", clarity: "VVS2" },
  { id: "ST-04", shape: "圆形", carat: 0.48, color: "H", clarity: "SI1" },
  { id: "ST-05", shape: "圆形", carat: 0.7, color: "F", clarity: "VS1" },
  // 椭圆 4 颗：最优对 ST-06 + ST-07 色级差 2 级，用于演示整次拒绝
  { id: "ST-06", shape: "椭圆", carat: 0.4, color: "D", clarity: "VVS1" },
  { id: "ST-07", shape: "椭圆", carat: 0.41, color: "F", clarity: "VS1" },
  { id: "ST-08", shape: "椭圆", carat: 0.45, color: "E", clarity: "VS2" },
  { id: "ST-09", shape: "椭圆", carat: 0.44, color: "F", clarity: "SI1" },
  // 祖母绿切 5 颗：全局最优对为 ST-10 + ST-11
  { id: "ST-10", shape: "祖母绿切", carat: 0.6, color: "G", clarity: "VS1" },
  { id: "ST-11", shape: "祖母绿切", carat: 0.61, color: "G", clarity: "VS2" },
  { id: "ST-12", shape: "祖母绿切", carat: 0.64, color: "H", clarity: "SI1" },
  { id: "ST-13", shape: "祖母绿切", carat: 0.58, color: "F", clarity: "VVS2" },
  { id: "ST-14", shape: "祖母绿切", carat: 0.8, color: "G", clarity: "VS1" },
];

export const SEED_ORDERS: Order[] = [
  { id: "OD-01", title: "周先生 & 林女士 · 结婚对戒", shape: "圆形", pair: null },
  { id: "OD-02", title: "吴先生 & 郑女士 · 周年纪念对戒", shape: "圆形", pair: null },
  { id: "OD-03", title: "陈先生 & 王女士 · 求婚对戒", shape: "椭圆", pair: null },
  { id: "OD-04", title: "黄先生 & 徐女士 · 订婚对戒", shape: "祖母绿切", pair: null },
];

export function seedState(): BenchState {
  return {
    stones: SEED_STONES.map((s) => ({ ...s })),
    orders: SEED_ORDERS.map((o) => ({ ...o, pair: o.pair ? { ...o.pair } : null })),
  };
}

// ------------------------------------------------------------
// 基础工具
// ------------------------------------------------------------

/** 克拉差按 0.001 精度取值，避免浮点误差影响阈值判定 */
export function caratDiff(a: Stone, b: Stone): number {
  return Math.round(Math.abs(a.carat - b.carat) * 1000) / 1000;
}

export function colorDiff(a: Stone, b: Stone): number {
  return Math.abs(COLOR_GRADES.indexOf(a.color) - COLOR_GRADES.indexOf(b.color));
}

export function formatCarat(carat: number): string {
  return `${carat.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}ct`;
}

export function findStone(stones: Stone[], id: string): Stone | undefined {
  return stones.find((s) => s.id === id);
}

/** 占用某颗裸石的订单（不含 exemptOrderId），未占用返回 null */
export function holderOf(orders: Order[], stoneId: string, exemptOrderId?: string): Order | null {
  for (const order of orders) {
    if (order.id === exemptOrderId || !order.pair) continue;
    if (order.pair.a === stoneId || order.pair.b === stoneId) return order;
  }
  return null;
}

export interface PairVerdict {
  ok: boolean;
  caratDiff: number;
  colorDiff: number;
}

/** 两颗裸石是否满足配对三要素：外形相同、克拉差 ≤0.02、色级差 ≤1 */
export function evaluatePair(a: Stone, b: Stone): PairVerdict {
  const cd = caratDiff(a, b);
  const gd = colorDiff(a, b);
  return {
    ok: a.shape === b.shape && cd <= CARAT_TOLERANCE && gd <= COLOR_TOLERANCE,
    caratDiff: cd,
    colorDiff: gd,
  };
}

// ------------------------------------------------------------
// 自动配对
// ------------------------------------------------------------

export type AutoMatchResult =
  | { code: "paired"; stoneA: Stone; stoneB: Stone; caratDiff: number; colorDiff: number; message: string }
  | { code: "already"; message: string }
  | { code: "no-candidate"; message: string }
  | { code: "reject-carat"; best: Pair; caratDiff: number; message: string }
  | { code: "reject-color"; best: Pair; colorDiff: number; message: string }
  | { code: "reject-occupied"; best: Pair; holder: Order; message: string };

/**
 * 自动配对：
 * 1. 已配对的订单不动；
 * 2. 同外形裸石两两组合，按克拉差最小优先（并列按编号）取最优候选；
 * 3. 最优候选克拉差超 0.02 → 整次拒绝；
 * 4. 最优候选色级差超 1 级 → 整次拒绝；
 * 5. 最优候选已被其他订单占用 → 整次拒绝；
 * 6. 全部通过才写入配对，此前任何已配对记录都不动。
 */
export function autoMatch(state: BenchState, orderId: string): AutoMatchResult {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return { code: "no-candidate", message: `订单 ${orderId} 不存在` };
  if (order.pair) {
    return { code: "already", message: `${order.id} 已配对 ${order.pair.a} + ${order.pair.b}，已配对记录不动` };
  }

  const pool = state.stones.filter((s) => s.shape === order.shape);
  if (pool.length < 2) {
    return { code: "no-candidate", message: `${order.shape}裸石不足两颗，无法配对` };
  }

  let best: { a: Stone; b: Stone; diff: number } | null = null;
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const diff = caratDiff(pool[i], pool[j]);
      if (
        !best ||
        diff < best.diff ||
        (diff === best.diff && `${pool[i].id}+${pool[j].id}` < `${best.a.id}+${best.b.id}`)
      ) {
        best = { a: pool[i], b: pool[j], diff };
      }
    }
  }
  const top = best!;

  if (top.diff > CARAT_TOLERANCE) {
    return {
      code: "reject-carat",
      best: { a: top.a.id, b: top.b.id },
      caratDiff: top.diff,
      message: `整次拒绝：最优候选 ${top.a.id} + ${top.b.id} 克拉差 ${top.diff.toFixed(3)}ct，超过 0.02ct 上限`,
    };
  }

  const gd = colorDiff(top.a, top.b);
  if (gd > COLOR_TOLERANCE) {
    return {
      code: "reject-color",
      best: { a: top.a.id, b: top.b.id },
      colorDiff: gd,
      message: `整次拒绝：最优候选 ${top.a.id} + ${top.b.id} 色级差 ${gd} 级（${top.a.color} vs ${top.b.color}），超过 1 级上限`,
    };
  }

  const holderA = holderOf(state.orders, top.a.id);
  const holderB = holderOf(state.orders, top.b.id);
  if (holderA || holderB) {
    const occupied = holderA ? top.a.id : top.b.id;
    const holder = (holderA ?? holderB)!;
    return {
      code: "reject-occupied",
      best: { a: top.a.id, b: top.b.id },
      holder,
      message: `整次拒绝：最优候选 ${top.a.id} + ${top.b.id} 中的 ${occupied} 已被 ${holder.id} 占用`,
    };
  }

  return {
    code: "paired",
    stoneA: top.a,
    stoneB: top.b,
    caratDiff: top.diff,
    colorDiff: gd,
    message: `配对成功：${top.a.id} + ${top.b.id}（克拉差 ${top.diff.toFixed(3)}ct，色级差 ${gd} 级）`,
  };
}

// ------------------------------------------------------------
// 拆对：只释放本对两颗，其他订单不动
// ------------------------------------------------------------

export function unpair(state: BenchState, orderId: string): { state: BenchState; message: string } {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order || !order.pair) {
    return { state, message: `${orderId} 当前没有配对，无需拆对` };
  }
  const released = `${order.pair.a} + ${order.pair.b}`;
  const orders = state.orders.map((o) => (o.id === orderId ? { ...o, pair: null } : o));
  return { state: { ...state, orders }, message: `已拆对：${released} 已释放回裸石池，其他订单不动` };
}

// ------------------------------------------------------------
// 换石：先还原旧颗，再对整对重验；不过就保留原对
// ------------------------------------------------------------

export type ReplaceResult =
  | { code: "swapped"; pair: Pair; caratDiff: number; colorDiff: number; message: string }
  | { code: "same-stone"; message: string }
  | { code: "reject-shape"; kept: Pair; message: string }
  | { code: "reject-carat"; kept: Pair; caratDiff: number; message: string }
  | { code: "reject-color"; kept: Pair; colorDiff: number; message: string }
  | { code: "reject-occupied"; kept: Pair; holder: Order; message: string };

export interface ReplaceOutcome {
  state: BenchState;
  result: ReplaceResult;
}

/**
 * 换石流程：
 * 1. 先把被换下的旧颗还原回裸石池（旧颗本身也允许被换回）；
 * 2. 新颗必须与订单要求外形相同、未被其他订单占用；
 * 3. 对「保留颗 + 新颗」整对重验克拉差、色级差；
 * 4. 任一项不过 → 保留原对，状态不变。
 */
export function replaceStone(state: BenchState, orderId: string, slot: "a" | "b", newStoneId: string): ReplaceOutcome {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order || !order.pair) {
    return { state, result: { code: "reject-shape", kept: { a: "", b: "" }, message: `${orderId} 尚未配对，不能换石` } };
  }
  const kept: Pair = { ...order.pair };
  const oldId = slot === "a" ? kept.a : kept.b;
  const keepId = slot === "a" ? kept.b : kept.a;

  if (newStoneId === oldId) {
    return { state, result: { code: "same-stone", message: `${newStoneId} 就是原位旧颗，无需更换` } };
  }

  const keepStone = findStone(state.stones, keepId)!;
  const candidate = findStone(state.stones, newStoneId);
  if (!candidate || candidate.shape !== order.shape) {
    return {
      state,
      result: { code: "reject-shape", kept, message: `整次拒绝：${newStoneId} 外形不符（要求${order.shape}），保留原对 ${kept.a} + ${kept.b}` },
    };
  }

  const holder = holderOf(state.orders, newStoneId, orderId);
  if (holder) {
    return {
      state,
      result: { code: "reject-occupied", kept, holder, message: `整次拒绝：${newStoneId} 已被 ${holder.id} 占用，保留原对 ${kept.a} + ${kept.b}` },
    };
  }

  const cd = caratDiff(keepStone, candidate);
  if (cd > CARAT_TOLERANCE) {
    return {
      state,
      result: { code: "reject-carat", kept, caratDiff: cd, message: `整次拒绝：${keepId} + ${newStoneId} 克拉差 ${cd.toFixed(3)}ct 超限，保留原对 ${kept.a} + ${kept.b}` },
    };
  }

  const gd = colorDiff(keepStone, candidate);
  if (gd > COLOR_TOLERANCE) {
    return {
      state,
      result: { code: "reject-color", kept, colorDiff: gd, message: `整次拒绝：${keepId} + ${newStoneId} 色级差 ${gd} 级超限，保留原对 ${kept.a} + ${kept.b}` },
    };
  }

  const pair: Pair = slot === "a" ? { a: newStoneId, b: keepId } : { a: keepId, b: newStoneId };
  const orders = state.orders.map((o) => (o.id === orderId ? { ...o, pair } : o));
  return {
    state: { ...state, orders },
    result: {
      code: "swapped",
      pair,
      caratDiff: cd,
      colorDiff: gd,
      message: `换石成功：${oldId} 已还原回池，${newStoneId} 入对（克拉差 ${cd.toFixed(3)}ct，色级差 ${gd} 级）`,
    },
  };
}
