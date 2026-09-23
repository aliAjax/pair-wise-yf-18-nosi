// 对戒配石台 —— 配对判定（纯业务规则，无副作用）
//
// 一张订单两颗裸石，必须同时满足：
//   1. 外形相同；
//   2. 克拉差不超过 0.02；
//   3. 色级差不超过一级（D 最好，J 最差）。
// 挑石按克拉差最小优先：候选排序只看克拉差，不看占用与否。
// 最优候选一旦被别的订单占用、或超克拉 / 色级差，整次拒绝，
// 不会退而求其次，也不动任何已配对记录。

export const COLOR_GRADES = ["D", "E", "F", "G", "H", "I", "J"] as const;
export type ColorGrade = (typeof COLOR_GRADES)[number];

export const SHAPES = ["圆形", "椭圆", "梨形", "祖母绿切"] as const;
export type Shape = (typeof SHAPES)[number];

export const MAX_CARAT_DIFF = 0.02;
export const MAX_COLOR_DIFF = 1;

export interface Stone {
  id: string;
  shape: Shape;
  /** 克拉重量，保留三位小数 */
  carat: number;
  color: ColorGrade;
}

export interface Order {
  id: string;
  /** 客户，对戒一般是两个人 */
  customer: string;
  /** 订单要求的外形，两颗裸石都必须是此外形 */
  shape: Shape;
}

export interface PairRecord {
  orderId: string;
  stoneIds: [string, string];
  pairedAt: number;
}

export interface BenchState {
  stones: Stone[];
  orders: Order[];
  pairs: PairRecord[];
}

export type FailReason =
  | "none" // 凑不齐两颗同外形裸石
  | "paired" // 订单已有配对
  | "occupied" // 最优候选被别的订单占用
  | "shape" // 外形不同（换石重验）
  | "carat" // 克拉差超过 0.02
  | "color" // 色级差超过一级
  | "invalid"; // 换石参数非法

export interface MatchSuccess {
  ok: true;
  orderId: string;
  state: BenchState;
  stoneIds: [string, string];
  caratDiff: number;
  colorDiff: number;
  message: string;
}

export interface MatchFailure {
  ok: false;
  orderId: string;
  candidate: [string, string] | null;
  reason: FailReason;
  message: string;
}

export type MatchOutcome = MatchSuccess | MatchFailure;

export interface ReplaceSuccess {
  ok: true;
  orderId: string;
  state: BenchState;
  /** 换石后被还原回裸石池的旧颗 */
  releasedId: string;
  stoneIds: [string, string];
  caratDiff: number;
  colorDiff: number;
  message: string;
}

export interface ReplaceFailure {
  ok: false;
  orderId: string;
  reason: FailReason;
  message: string;
}

export type ReplaceOutcome = ReplaceSuccess | ReplaceFailure;

const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export function formatCarat(n: number): string {
  return n.toFixed(3);
}

export function caratDiff(a: Stone, b: Stone): number {
  return round3(Math.abs(a.carat - b.carat));
}

export function colorDiffOf(a: ColorGrade, b: ColorGrade): number {
  return Math.abs(COLOR_GRADES.indexOf(a) - COLOR_GRADES.indexOf(b));
}

/** 占用某颗裸石的订单；excludeOrderId 用于换石时忽略本对自身。 */
export function stoneHolder(
  state: BenchState,
  stoneId: string,
  excludeOrderId?: string,
): string | null {
  const hit = state.pairs.find(
    (p) => p.orderId !== excludeOrderId && p.stoneIds.includes(stoneId),
  );
  return hit ? hit.orderId : null;
}

export function pairForOrder(
  state: BenchState,
  orderId: string,
): PairRecord | null {
  return state.pairs.find((p) => p.orderId === orderId) ?? null;
}

interface BestPair {
  a: Stone;
  b: Stone;
  caratDiff: number;
}

/**
 * 最优候选：同外形裸石中克拉差最小的两颗（并列时按编号定序，保证结果稳定）。
 * 占用状态不参与排序 —— 被占用照样当选，随后由判定环节整次拒绝。
 */
export function bestPairFor(stones: Stone[], shape: Shape): BestPair | null {
  const pool = stones
    .filter((s) => s.shape === shape)
    .slice()
    .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  if (pool.length < 2) return null;

  let best: BestPair | null = null;
  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i + 1; j < pool.length; j += 1) {
      const a = pool[i];
      const b = pool[j];
      const d = caratDiff(a, b);
      if (
        best === null ||
        d < best.caratDiff ||
        (d === best.caratDiff &&
          (a.id < best.a.id || (a.id === best.a.id && b.id < best.b.id)))
      ) {
        best = { a, b, caratDiff: d };
      }
    }
  }
  return best;
}

/** 自动配石：整单判定，要么落一条配对记录，要么原样不动。 */
export function matchOrder(state: BenchState, orderId: string): MatchOutcome {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) {
    return { ok: false, orderId, candidate: null, reason: "invalid", message: "订单不存在。" };
  }
  if (pairForOrder(state, orderId)) {
    return {
      ok: false,
      orderId,
      candidate: null,
      reason: "paired",
      message: `${orderId} 已有配对，如需重配请先拆对。`,
    };
  }

  const best = bestPairFor(state.stones, order.shape);
  if (!best) {
    return {
      ok: false,
      orderId,
      candidate: null,
      reason: "none",
      message: `${orderId} 要求${order.shape}，池子里凑不齐两颗，无法配对。`,
    };
  }

  const candidate: [string, string] = [best.a.id, best.b.id];
  const candidateText = `最优候选 ${best.a.id} + ${best.b.id}（克拉差 ${formatCarat(best.caratDiff)}）`;

  // 被别的订单占用：与超差同样处理，整次拒绝。
  const holderA = stoneHolder(state, best.a.id);
  const holderB = stoneHolder(state, best.b.id);
  const holder = holderA ?? holderB;
  if (holder) {
    return {
      ok: false,
      orderId,
      candidate,
      reason: "occupied",
      message: `${candidateText}已被 ${holder} 占用，整次拒绝；已配对记录未改动。`,
    };
  }

  if (best.caratDiff > MAX_CARAT_DIFF) {
    return {
      ok: false,
      orderId,
      candidate,
      reason: "carat",
      message: `${candidateText}克拉差超过 0.02，整次拒绝；已配对记录未改动。`,
    };
  }

  const cd = colorDiffOf(best.a.color, best.b.color);
  if (cd > MAX_COLOR_DIFF) {
    return {
      ok: false,
      orderId,
      candidate,
      reason: "color",
      message: `${candidateText}色级差 ${cd} 级（${best.a.color}/${best.b.color}），超过一级，整次拒绝；已配对记录未改动。`,
    };
  }

  const next: BenchState = {
    ...state,
    pairs: [
      ...state.pairs,
      { orderId, stoneIds: candidate, pairedAt: Date.now() },
    ],
  };
  return {
    ok: true,
    orderId,
    state: next,
    stoneIds: candidate,
    caratDiff: best.caratDiff,
    colorDiff: cd,
    message: `${orderId} 配对成功：${best.a.id} + ${best.b.id}（克拉差 ${formatCarat(best.caratDiff)}，色级差 ${cd} 级）。`,
  };
}

/** 拆对：只释放本对两颗，其他订单的配对一律不碰。 */
export function unpairOrder(
  state: BenchState,
  orderId: string,
): { state: BenchState; released: [string, string]; message: string } | null {
  const record = pairForOrder(state, orderId);
  if (!record) return null;
  const next: BenchState = {
    ...state,
    pairs: state.pairs.filter((p) => p.orderId !== orderId),
  };
  return {
    state: next,
    released: [record.stoneIds[0], record.stoneIds[1]],
    message: `${orderId} 已拆对，释放 ${record.stoneIds[0]}、${record.stoneIds[1]}；其他订单配对未受影响。`,
  };
}

/**
 * 换石：先把旧颗还原回池子，再拿“新颗 + 原伙伴”整体重验。
 * 任一项不过（占用 / 外形 / 克拉 / 色级）都不交回新状态，调用方保留原对。
 */
export function replaceStone(
  state: BenchState,
  orderId: string,
  oldStoneId: string,
  newStoneId: string,
): ReplaceOutcome {
  const order = state.orders.find((o) => o.id === orderId);
  const record = pairForOrder(state, orderId);
  if (!order || !record) {
    return { ok: false, orderId, reason: "invalid", message: "订单或配对不存在，无法换石。" };
  }
  if (!record.stoneIds.includes(oldStoneId)) {
    return { ok: false, orderId, reason: "invalid", message: "旧颗不在本对中，无法换石。" };
  }

  const partnerId = record.stoneIds.find((id) => id !== oldStoneId)!;
  const partner = state.stones.find((s) => s.id === partnerId);
  const replacement = state.stones.find((s) => s.id === newStoneId);
  if (!partner || !replacement || newStoneId === partnerId || newStoneId === oldStoneId) {
    return { ok: false, orderId, reason: "invalid", message: "新颗无效，已保留原对。" };
  }

  const suffix = `已保留原对 ${record.stoneIds[0]} + ${record.stoneIds[1]}。`;

  // 先还原旧颗：占用判定时把本订单排除，旧颗随之回到池中。
  const holder = stoneHolder(state, newStoneId, orderId);
  if (holder) {
    return {
      ok: false,
      orderId,
      reason: "occupied",
      message: `${newStoneId} 已被 ${holder} 占用，换石重验未通过；${suffix}`,
    };
  }

  if (replacement.shape !== order.shape) {
    return {
      ok: false,
      orderId,
      reason: "shape",
      message: `${newStoneId} 是${replacement.shape}，订单要求${order.shape}，外形不同；${suffix}`,
    };
  }

  const d = caratDiff(replacement, partner);
  if (d > MAX_CARAT_DIFF) {
    return {
      ok: false,
      orderId,
      reason: "carat",
      message: `${newStoneId} 与 ${partnerId} 克拉差 ${formatCarat(d)}，超过 0.02；${suffix}`,
    };
  }

  const cd = colorDiffOf(replacement.color, partner.color);
  if (cd > MAX_COLOR_DIFF) {
    return {
      ok: false,
      orderId,
      reason: "color",
      message: `${newStoneId} 与 ${partnerId} 色级差 ${cd} 级（${replacement.color}/${partner.color}），超过一级；${suffix}`,
    };
  }

  const stoneIds: [string, string] = [partnerId, newStoneId];
  const next: BenchState = {
    ...state,
    pairs: state.pairs.map((p) =>
      p.orderId === orderId ? { ...p, stoneIds } : p,
    ),
  };
  return {
    ok: true,
    orderId,
    state: next,
    releasedId: oldStoneId,
    stoneIds,
    caratDiff: d,
    colorDiff: cd,
    message: `换石成功：旧颗 ${oldStoneId} 已还原回池，${orderId} 现为 ${partnerId} + ${newStoneId}（克拉差 ${formatCarat(d)}，色级差 ${cd} 级）。`,
  };
}
