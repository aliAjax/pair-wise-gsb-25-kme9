// 页面层：规则看板（指标全部由数据快照派生）

import type { AppData } from "../domain/types";
import { activeBookings } from "../rules/bookingRules";
import { currentVersion, summarizeChain } from "../rules/versionRules";
import { evaluateChecks } from "../rules/clinicalRules";
import { todayISO, addDaysISO } from "../domain/dates";

export function Dashboard({ data }: { data: AppData }) {
  const summaries = data.chains.map((c) => summarizeChain(data, c));
  const pendingPlan = summaries.filter((s) => s.state === "REVIEW_NEED_PLAN").length;
  const schedulable = summaries.filter(
    (s) => s.state === "READY" || s.state === "REVIEW_READY"
  ).length;
  const correcting = summaries.filter((s) => !!s.draft && s.current).length;

  const today = todayISO();
  const todayActive = activeBookings(data).filter((b) => b.date === today).length;
  const totalActive = activeBookings(data).length;
  const released = data.bookings.filter((b) => !b.active).length;

  // 未来 7 天占用趋势（训练位 × 时段 = 12 格/天）
  const week = Array.from({ length: 7 }, (_, i) => addDaysISO(today, i));
  const weekCounts = week.map(
    (d) => activeBookings(data).filter((b) => b.date === d).length
  );
  const maxCount = Math.max(4, ...weekCounts);

  // 本周待复训（检查不通过、方案已填、7 天内有排课之外的待跟进）
  const needFollow = data.chains.filter((c) => {
    const cur = currentVersion(c);
    if (!cur) return false;
    return evaluateChecks(c.patientAge, cur).length > 0;
  }).length;

  const cards = [
    { label: "今日已排课时", value: todayActive, sub: `有效排课共 ${totalActive} 节`, tone: "ok" as const },
    { label: "待复核（缺训练方案）", value: pendingPlan, sub: "补齐方案后方可排课", tone: "danger" as const },
    { label: "更正待确认", value: correcting, sub: "确认后释放原课时", tone: "warn" as const },
    { label: "异常在训随访", value: needFollow, sub: "AMP 或 NPC 未达标", tone: "neutral" as const },
  ];

  return (
    <section className="dashboard">
      <div className="metric-strip">
        {cards.map((c) => (
          <article key={c.label} className={`kpi kpi-${c.tone}`}>
            <span>{c.label}</span>
            <strong>{c.value}</strong>
            <p>{c.sub}</p>
          </article>
        ))}
      </div>

      <div className="panel trend-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">占用一致性</p>
            <h2>未来 7 天训练位占用</h2>
          </div>
          <div className="legend">
            <span className="legend-dot legend-active" /> 有效 {totalActive}
            <span className="legend-dot legend-released" /> 已释放 {released}
            <span className="legend-sep">可排课评估 {schedulable}</span>
          </div>
        </div>
        <div className="trend-bars">
          {week.map((d, i) => (
            <div key={d} className={`trend-col ${d === today ? "is-today" : ""}`}>
              <span className="trend-num">{weekCounts[i]}</span>
              <div className="trend-track">
                <div
                  className="trend-fill"
                  style={{ height: `${Math.round((weekCounts[i] / maxCount) * 100)}%` }}
                />
              </div>
              <span className="trend-day">{d.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
