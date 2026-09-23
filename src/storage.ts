// ============================================================
// 存档（业务文件二）
// 数据只存浏览器 localStorage，刷新后保留；支持恢复出厂预置。
// ============================================================

import { BenchState, seedState, SHAPES, COLOR_GRADES } from "./matching";

const STORAGE_KEY = "pair-ring-bench:v1";

function isStone(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.shape === "string" &&
    (SHAPES as readonly string[]).includes(s.shape) &&
    typeof s.carat === "number" &&
    typeof s.color === "string" &&
    (COLOR_GRADES as readonly string[]).includes(s.color) &&
    typeof s.clarity === "string"
  );
}

function isPair(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return typeof p.a === "string" && typeof p.b === "string";
}

function isOrder(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.title === "string" &&
    typeof o.shape === "string" &&
    (SHAPES as readonly string[]).includes(o.shape) &&
    (o.pair === null || isPair(o.pair))
  );
}

/** 结构校验通过才用存档，否则回落到出厂预置，避免脏数据卡死页面 */
export function isValidState(v: unknown): v is BenchState {
  if (typeof v !== "object" || v === null) return false;
  const b = v as Record<string, unknown>;
  return Array.isArray(b.stones) && b.stones.every(isStone) && Array.isArray(b.orders) && b.orders.every(isOrder);
}

export function loadState(): BenchState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isValidState(parsed)) return parsed;
    }
  } catch {
    // 存档损坏或浏览器禁用 localStorage：回落预置
  }
  return seedState();
}

export function saveState(state: BenchState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 配额不足 / 隐私模式下静默失败，不影响当前操作
  }
}

export function resetState(): BenchState {
  const fresh = seedState();
  saveState(fresh);
  return fresh;
}
