import { useEffect, useMemo, useState } from "react";
import {
  BenchState,
  Order,
  Stone,
  Shape,
  autoMatch,
  unpair,
  replaceStone,
  evaluatePair,
  findStone,
  holderOf,
  formatCarat,
  SHAPES,
  COLOR_TOLERANCE,
  CARAT_TOLERANCE,
} from "./matching";
import { loadState, saveState, resetState } from "./storage";

type MessageKind = "ok" | "warn" | "info";
interface Message {
  text: string;
  kind: MessageKind;
}

const FILTERS: ["全部", ...Shape[]] = ["全部", ...SHAPES];

function resultKind(code: string): MessageKind {
  if (code === "paired" || code === "swapped") return "ok";
  if (code === "same-stone" || code === "already") return "info";
  return "warn";
}

function PairingBench() {
  const [bench, setBench] = useState<BenchState>(loadState);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("全部");
  const [replacing, setReplacing] = useState<{ orderId: string; slot: "a" | "b" } | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  // 数据只存浏览器，每次变化即落盘，刷新保留
  useEffect(() => {
    saveState(bench);
  }, [bench]);

  const pairedOrders = bench.orders.filter((o) => o.pair).length;
  const occupiedStones = new Set(
    bench.orders.flatMap((o) => (o.pair ? [o.pair.a, o.pair.b] : [])),
  ).size;

  const visibleStones = useMemo(
    () => bench.stones.filter((s) => filter === "全部" || s.shape === filter),
    [bench.stones, filter],
  );

  const flash = (text: string, kind: MessageKind) => setMessage({ text, kind });

  const handleAutoMatch = (orderId: string) => {
    const result = autoMatch(bench, orderId);
    if (result.code === "paired") {
      setBench((prev) => ({
        ...prev,
        orders: prev.orders.map((o) =>
          o.id === orderId ? { ...o, pair: { a: result.stoneA.id, b: result.stoneB.id } } : o,
        ),
      }));
    }
    flash(result.message, resultKind(result.code));
  };

  const handleUnpair = (orderId: string) => {
    const outcome = unpair(bench, orderId);
    setBench(outcome.state);
    setReplacing((r) => (r && r.orderId === orderId ? null : r));
    flash(outcome.message, "info");
  };

  const handlePickReplacement = (orderId: string, slot: "a" | "b", newStoneId: string) => {
    const outcome = replaceStone(bench, orderId, slot, newStoneId);
    setBench(outcome.state);
    setReplacing(null);
    flash(outcome.result.message, resultKind(outcome.result.code));
  };

  const handleReset = () => {
    setBench(resetState());
    setReplacing(null);
    flash("已恢复出厂预置：14 颗裸石、4 张未配对订单", "info");
  };

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62006 · 对戒配石台 · 数据仅存本机浏览器</p>
        <h1>对戒配石台</h1>
        <span>
          每单两颗：外形相同、克拉差 ≤ {CARAT_TOLERANCE}ct、色级差 ≤ {COLOR_TOLERANCE}
          级。挑石按克拉差最小优先；最优候选超色级差或已被其他订单占用，整次拒绝且已配对记录不动。换石先还原旧颗再整对重验，不过则保留原对。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>裸石总数</small>
          <strong>{bench.stones.length}</strong>
        </article>
        <article>
          <small>已占用裸石</small>
          <strong>{occupiedStones}</strong>
        </article>
        <article>
          <small>已配订单</small>
          <strong>{pairedOrders}</strong>
        </article>
        <article>
          <small>待配订单</small>
          <strong>{bench.orders.length - pairedOrders}</strong>
        </article>
      </section>

      {message && (
        <div className={`banner banner-${message.kind}`} onClick={() => setMessage(null)}>
          {message.text}
        </div>
      )}

      <section className="workspace">
        <aside className="panel">
          <h2>外形筛选</h2>
          <div className="chips">
            {FILTERS.map((shape) => (
              <button key={shape} className={filter === shape ? "chip-on" : ""} onClick={() => setFilter(shape)}>
                {shape}
              </button>
            ))}
          </div>
          <h2 className="second-title">占用说明</h2>
          <ul className="legend">
            <li>
              <span className="dot dot-free" /> 空闲裸石
            </li>
            <li>
              <span className="dot dot-held" /> 已被订单占用
            </li>
          </ul>
          <button className="ghost reset-btn" onClick={handleReset}>
            恢复出厂预置
          </button>
        </aside>

        <section className="panel">
          <div className="heading">
            <div>
              <p>订单工作台</p>
              <h2>四张对戒订单</h2>
            </div>
          </div>
          <div className="orders">
            {bench.orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                bench={bench}
                replacing={replacing}
                onAutoMatch={handleAutoMatch}
                onUnpair={handleUnpair}
                onStartReplace={(slot) => setReplacing({ orderId: order.id, slot })}
                onCancelReplace={() => setReplacing(null)}
                onPickReplacement={(newId) =>
                  replacing && handlePickReplacement(order.id, replacing.slot, newId)
                }
              />
            ))}
          </div>
        </section>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>裸石池</p>
            <h2>十四颗预置裸石</h2>
          </div>
        </div>
        <div className="stone-grid">
          {visibleStones.map((stone) => {
            const holder = holderOf(bench.orders, stone.id);
            const held = holder !== null;
            return (
              <article key={stone.id} className={held ? "stone stone-held" : "stone stone-free"}>
                <div className="stone-head">
                  <b>{stone.id}</b>
                  <span className="shape-tag">{stone.shape}</span>
                </div>
                <p>
                  {formatCarat(stone.carat)} · 色级 {stone.color} · {stone.clarity}
                </p>
                <small>{held ? `已占用：${holder!.id}` : "空闲"}</small>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

interface OrderCardProps {
  order: Order;
  bench: BenchState;
  replacing: { orderId: string; slot: "a" | "b" } | null;
  onAutoMatch: (orderId: string) => void;
  onUnpair: (orderId: string) => void;
  onStartReplace: (slot: "a" | "b") => void;
  onCancelReplace: () => void;
  onPickReplacement: (newStoneId: string) => void;
}

function OrderCard({
  order,
  bench,
  replacing,
  onAutoMatch,
  onUnpair,
  onStartReplace,
  onCancelReplace,
  onPickReplacement,
}: OrderCardProps) {
  const isPairing = order.pair !== null;
  const stoneA = order.pair ? findStone(bench.stones, order.pair.a) : undefined;
  const stoneB = order.pair ? findStone(bench.stones, order.pair.b) : undefined;
  const verdict = stoneA && stoneB ? evaluatePair(stoneA, stoneB) : null;

  return (
    <article className="order-card">
      <div className="order-head">
        <div>
          <h3>
            {order.id} <span className="order-title">{order.title}</span>
          </h3>
          <p>
            要求外形：<b>{order.shape}</b>
          </p>
        </div>
        <div className="order-actions">
          {isPairing ? (
            <span className="status status-ok">已配对</span>
          ) : (
            <span className="status status-wait">待配对</span>
          )}
          {!isPairing && (
            <button className="primary" onClick={() => onAutoMatch(order.id)}>
              自动配对
            </button>
          )}
          {isPairing && (
            <button className="ghost" onClick={() => onUnpair(order.id)}>
              拆对
            </button>
          )}
        </div>
      </div>

      {isPairing && stoneA && stoneB && verdict && (
        <div className="pair-row">
          <StoneSlot
            stone={stoneA}
            order={order}
            slot="a"
            onStartReplace={onStartReplace}
            active={replacing?.orderId === order.id && replacing.slot === "a"}
          />
          <div className="pair-mid">
            <span>＋</span>
            <small>
              克拉差 {verdict.caratDiff.toFixed(3)}ct · 色级差 {verdict.colorDiff} 级
            </small>
          </div>
          <StoneSlot
            stone={stoneB}
            order={order}
            slot="b"
            onStartReplace={onStartReplace}
            active={replacing?.orderId === order.id && replacing.slot === "b"}
          />
        </div>
      )}

      {replacing?.orderId === order.id && order.pair && (
        <ReplacePicker
          bench={bench}
          order={order}
          slot={replacing.slot}
          onCancel={onCancelReplace}
          onPick={onPickReplacement}
        />
      )}
    </article>
  );
}

interface StoneSlotProps {
  stone: Stone;
  order: Order;
  slot: "a" | "b";
  active: boolean;
  onStartReplace: (slot: "a" | "b") => void;
}

function StoneSlot({ stone, slot, active, onStartReplace }: StoneSlotProps) {
  return (
    <div className="slot">
      <div className="slot-head">
        <b>{stone.id}</b>
        <button className={active ? "link link-on" : "link"} onClick={() => onStartReplace(slot)}>
          换石
        </button>
      </div>
      <p>
        {stone.shape} · {formatCarat(stone.carat)}
      </p>
      <small>
        色级 {stone.color} · {stone.clarity}
      </small>
    </div>
  );
}

interface ReplacePickerProps {
  bench: BenchState;
  order: Order;
  slot: "a" | "b";
  onCancel: () => void;
  onPick: (newStoneId: string) => void;
}

function ReplacePicker({ bench, order, slot, onCancel, onPick }: ReplacePickerProps) {
  const pair = order.pair!;
  const oldId = slot === "a" ? pair.a : pair.b;
  const keepId = slot === "a" ? pair.b : pair.a;
  const keepStone = findStone(bench.stones, keepId)!;

  // 先还原旧颗：旧颗本身也出现在候选里；其他订单占用的裸石不可选
  const candidates = bench.stones
    .filter((s) => s.shape === order.shape)
    .filter((s) => s.id === oldId || holderOf(bench.orders, s.id, order.id) === null)
    .sort((a, b) => {
      const da = Math.abs(a.carat - keepStone.carat);
      const db = Math.abs(b.carat - keepStone.carat);
      return da - db || a.id.localeCompare(b.id);
    });

  return (
    <div className="picker">
      <div className="picker-head">
        <b>
          为 {keepId} 重选配对颗（旧颗 {oldId} 已先还原回池，整体重验）
        </b>
        <button className="ghost" onClick={onCancel}>
          取消
        </button>
      </div>
      <div className="candidate-list">
        {candidates.map((c) => {
          const isOld = c.id === oldId;
          const v = evaluatePair(keepStone, c);
          const disabled = !isOld && !v.ok;
          return (
            <button
              key={c.id}
              className="candidate"
              disabled={disabled}
              onClick={() => onPick(c.id)}
              title={disabled ? "不满足配对条件，选中会被拒绝并保留原对" : "整体重验通过后入对"}
            >
              <span>
                <b>{c.id}</b>
                {isOld && <em className="old-tag">原位旧颗</em>}
              </span>
              <small>
                {formatCarat(c.carat)} · 色级 {c.color}
              </small>
              <small className={v.ok ? "verdict-ok" : "verdict-bad"}>
                克拉差 {v.caratDiff.toFixed(3)}ct / 色级差 {v.colorDiff} 级
                {v.ok ? " ✓" : " ✗"}
              </small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default PairingBench;
