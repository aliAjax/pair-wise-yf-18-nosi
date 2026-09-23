import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import {
  bestPairFor,
  colorDiffOf,
  formatCarat,
  matchOrder,
  pairForOrder,
  replaceStone,
  unpairOrder,
  MAX_CARAT_DIFF,
  MAX_COLOR_DIFF,
  type BenchState,
  type Order,
  type Stone,
} from "./matching";
import { loadState, resetState, saveState } from "./storage";

interface Notice {
  tone: "success" | "error";
  text: string;
}

type ShapeFilter = "全部" | Stone["shape"];

export default function App() {
  const [bench, setBench] = useState<BenchState>(() => loadState());
  const [notice, setNotice] = useState<Notice | null>(null);
  const [shapeFilter, setShapeFilter] = useState<ShapeFilter>("全部");
  const [swapping, setSwapping] = useState<{
    orderId: string;
    oldStoneId: string;
  } | null>(null);
  const [swapPick, setSwapPick] = useState<string>("");

  // 数据只存浏览器：每次变更立刻落 localStorage，刷新后保留。
  useEffect(() => {
    saveState(bench);
  }, [bench]);

  const stoneMap = useMemo(() => {
    const map = new Map<string, Stone>();
    bench.stones.forEach((s) => map.set(s.id, s));
    return map;
  }, [bench.stones]);

  const holderOf = useMemo(() => {
    const map = new Map<string, string>();
    bench.pairs.forEach((p) => {
      p.stoneIds.forEach((id) => map.set(id, p.orderId));
    });
    return map;
  }, [bench.pairs]);

  const pairedOrders = bench.pairs.length;
  const pairedStones = bench.pairs.length * 2;

  function handleMatch(order: Order) {
    const outcome = matchOrder(bench, order.id);
    if (outcome.ok) {
      setBench(outcome.state);
      setNotice({ tone: "success", text: outcome.message });
    } else {
      setNotice({ tone: "error", text: outcome.message });
    }
  }

  function handleUnpair(orderId: string) {
    const result = unpairOrder(bench, orderId);
    if (!result) return;
    setBench(result.state);
    setSwapping(null);
    setNotice({ tone: "success", text: result.message });
  }

  function startSwap(orderId: string, oldStoneId: string) {
    setSwapping({ orderId, oldStoneId });
    setSwapPick("");
  }

  function confirmSwap(orderId: string) {
    if (!swapping || swapPick === "") return;
    const outcome = replaceStone(bench, orderId, swapping.oldStoneId, swapPick);
    if (outcome.ok) {
      setBench(outcome.state);
      setSwapping(null);
      setSwapPick("");
      setNotice({ tone: "success", text: outcome.message });
    } else {
      // 重验不过：不接收新状态，原对保留。
      setNotice({ tone: "error", text: outcome.message });
    }
  }

  function handleReset() {
    const fresh = resetState();
    setBench(fresh);
    setSwapping(null);
    setSwapPick("");
    setNotice({
      tone: "success",
      text: "已恢复出厂预置：14 颗裸石、4 张订单全部回到未配对状态。",
    });
  }

  const visibleStones =
    shapeFilter === "全部"
      ? bench.stones
      : bench.stones.filter((s) => s.shape === shapeFilter);

  return (
    <main className="app">
      <section className="hero">
        <div className="hero-top">
          <p>对戒配石台 · 数据仅存本浏览器</p>
          <button className="ghost" onClick={handleReset}>
            恢复出厂预置
          </button>
        </div>
        <h1>对戒配石台</h1>
        <span>
          每张订单配两颗裸石：外形相同、克拉差不超过 {formatCarat(MAX_CARAT_DIFF)}、
          色级差不超过 {MAX_COLOR_DIFF} 级（D 最好、J 最差）。挑石只按克拉差最小优先；
          最优候选被占用或超差就整次拒绝，不挑下一颗、不动已配对记录。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>裸石总数</small>
          <strong>{bench.stones.length}</strong>
        </article>
        <article>
          <small>已配对裸石</small>
          <strong>
            {pairedStones}
            <em>颗</em>
          </strong>
        </article>
        <article>
          <small>已配订单</small>
          <strong>
            {pairedOrders}
            <em>/ {bench.orders.length}</em>
          </strong>
        </article>
        <article>
          <small>待配订单</small>
          <strong>{bench.orders.length - pairedOrders}</strong>
        </article>
      </section>

      {notice && (
        <div className={`notice ${notice.tone}`} role="status">
          {notice.text}
        </div>
      )}

      <section className="panel">
        <div className="heading">
          <div>
            <p>配石工位</p>
            <h2>订单配石</h2>
          </div>
        </div>
        <div className="orders-grid">
          {bench.orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              bench={bench}
              stoneMap={stoneMap}
              holderOf={holderOf}
              swapping={swapping}
              swapPick={swapPick}
              onMatch={() => handleMatch(order)}
              onUnpair={() => handleUnpair(order.id)}
              onStartSwap={(oldStoneId) => startSwap(order.id, oldStoneId)}
              onCancelSwap={() => {
                setSwapping(null);
                setSwapPick("");
              }}
              onPick={setSwapPick}
              onConfirmSwap={() => confirmSwap(order.id)}
            />
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>裸石池</p>
            <h2>十四颗预置裸石</h2>
          </div>
          <div className="chips static">
            {(["全部", ...(["圆形", "椭圆", "梨形", "祖母绿切"] as const)] as ShapeFilter[]).map(
              (shape) => (
                <button
                  key={shape}
                  className={shapeFilter === shape ? "chip-on" : ""}
                  onClick={() => setShapeFilter(shape)}
                >
                  {shape}
                </button>
              ),
            )}
          </div>
        </div>
        <div className="stones-grid">
          {visibleStones.map((stone) => {
            const holder = holderOf.get(stone.id);
            return (
              <article key={stone.id} className={holder ? "stone busy" : "stone free"}>
                <div className="stone-head">
                  <b>{stone.id}</b>
                  <span className="tag">{stone.shape}</span>
                </div>
                <p>{formatCarat(stone.carat)} ct · 色级 {stone.color}</p>
                <small>{holder ? `已配给 ${holder}` : "空闲，可候选"}</small>
              </article>
            );
          })}
        </div>
      </section>

      <p className="footnote">
        所有配对记录仅保存在本浏览器 localStorage 中，刷新页面后保留；不会上传任何服务器。
      </p>
    </main>
  );
}

interface OrderCardProps {
  order: Order;
  bench: BenchState;
  stoneMap: Map<string, Stone>;
  holderOf: Map<string, string>;
  swapping: { orderId: string; oldStoneId: string } | null;
  swapPick: string;
  onMatch: () => void;
  onUnpair: () => void;
  onStartSwap: (oldStoneId: string) => void;
  onCancelSwap: () => void;
  onPick: (stoneId: string) => void;
  onConfirmSwap: () => void;
}

function OrderCard({
  order,
  bench,
  stoneMap,
  holderOf,
  swapping,
  swapPick,
  onMatch,
  onUnpair,
  onStartSwap,
  onCancelSwap,
  onPick,
  onConfirmSwap,
}: OrderCardProps) {
  const pair = pairForOrder(bench, order.id);
  const preview = bestPairFor(bench.stones, order.shape);
  const swapOpen = swapping?.orderId === order.id ? swapping : null;

  let candidateFlags: string[] = [];
  if (preview) {
    const holderA = holderOf.get(preview.a.id);
    const holderB = holderOf.get(preview.b.id);
    if (holderA || holderB) {
      const holder = holderA ?? holderB;
      candidateFlags.push(`已被 ${holder} 占用`);
    }
    if (preview.caratDiff > MAX_CARAT_DIFF) {
      candidateFlags.push(`克拉差 ${formatCarat(preview.caratDiff)} 超限`);
    }
    const cd = colorDiffOf(preview.a.color, preview.b.color);
    if (cd > MAX_COLOR_DIFF) {
      candidateFlags.push(`色级差 ${cd} 级超限`);
    }
  }

  const swapOptions = swapOpen
    ? bench.stones.filter((s) => {
        if (s.shape !== order.shape) return false;
        if (s.id === swapOpen.oldStoneId) return false;
        const partnerId = pair?.stoneIds.find((id) => id !== swapOpen.oldStoneId);
        return s.id !== partnerId;
      })
    : [];

  return (
    <article className={`order-card ${pair ? "matched" : "pending"}`}>
      <div className="order-head">
        <div>
          <h3>{order.id}</h3>
          <p>
            {order.customer} · 要求 {order.shape} · 每单两颗
          </p>
        </div>
        <span className={`status ${pair ? "ok" : "wait"}`}>
          {pair ? "已配对" : "待配石"}
        </span>
      </div>

      {pair ? (
        <>
          <div className="pair-line">
            {pair.stoneIds.map((id) => {
              const stone = stoneMap.get(id);
              if (!stone) return null;
              return (
                <div key={id} className="pair-stone">
                  <b>{stone.id}</b>
                  <span>
                    {stone.shape} · {formatCarat(stone.carat)} ct · 色级 {stone.color}
                  </span>
                  <button
                    className="link-btn"
                    onClick={() => onStartSwap(stone.id)}
                    disabled={swapOpen !== null}
                  >
                    换石
                  </button>
                </div>
              );
            })}
          </div>
          <p className="paired-at">
            配对时间：{new Date(pair.pairedAt).toLocaleString("zh-CN")}
          </p>

          {swapOpen &&
            (() => {
              const partner = pair.stoneIds.find((id) => id !== swapOpen.oldStoneId);
              return (
                <div className="swap-box">
                  <p>
                    还原旧颗 {swapOpen.oldStoneId}，挑一颗新石与 {partner} 整体重验：
                  </p>
                  <select value={swapPick} onChange={(e) => onPick(e.target.value)}>
                    <option value="">选择候选裸石…</option>
                    {swapOptions.map((s) => {
                      const holder = holderOf.get(s.id);
                      return (
                        <option key={s.id} value={s.id}>
                          {s.id} · {formatCarat(s.carat)} ct · 色级 {s.color}
                          {holder ? `（${holder} 占用）` : ""}
                        </option>
                      );
                    })}
                  </select>
                  <div className="swap-actions">
                    <button
                      className="primary small"
                      disabled={swapPick === ""}
                      onClick={onConfirmSwap}
                    >
                      确认换石
                    </button>
                    <button className="small" onClick={onCancelSwap}>
                      取消
                    </button>
                  </div>
                  <small>重验不过会保留原对，旧颗不会真的离对。</small>
                </div>
              );
            })()}

          <button className="danger" onClick={onUnpair} disabled={swapOpen !== null}>
            拆对（只释放本对两颗）
          </button>
        </>
      ) : (
        <>
          <div className="candidate">
            {preview ? (
              <>
                <p className="candidate-title">
                  最优候选：{preview.a.id} + {preview.b.id}
                </p>
                <p>
                  克拉差 {formatCarat(preview.caratDiff)}
                  {preview.caratDiff <= MAX_CARAT_DIFF ? " ✓" : " ✗"} · 色级差{" "}
                  {colorDiffOf(preview.a.color, preview.b.color)} 级
                  {colorDiffOf(preview.a.color, preview.b.color) <= MAX_COLOR_DIFF
                    ? " ✓"
                    : " ✗"}
                </p>
                {candidateFlags.length > 0 && (
                  <p className="candidate-flags">判定：{candidateFlags.join("；")}，将整次拒绝</p>
                )}
                {candidateFlags.length === 0 && (
                  <p className="candidate-ok">判定：候选合格，可落配对记录。</p>
                )}
              </>
            ) : (
              <p className="candidate-flags">池子里凑不齐两颗{order.shape}裸石。</p>
            )}
          </div>
          <button className="primary" onClick={onMatch}>
            自动配石
          </button>
        </>
      )}
    </article>
  );
}
