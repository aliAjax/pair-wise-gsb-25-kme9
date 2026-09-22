import { useMemo, useState } from "react";
import "./styles.css";
import { StoreProvider } from "./state/StoreProvider";
import { useStore } from "./state/store";
import { Notice } from "./ui/components/Notice";
import { AssessmentPage } from "./ui/pages/AssessmentPage";
import { SchedulePage } from "./ui/pages/SchedulePage";
import { OccupancyPage } from "./ui/pages/OccupancyPage";
import { VersionsPage } from "./ui/pages/VersionsPage";
import { NPC_LIMIT_CM } from "./rules/clinical";

type Tab = "assess" | "schedule" | "occupancy" | "versions";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "assess", label: "评估登记" },
  { key: "schedule", label: "复训排课" },
  { key: "occupancy", label: "占用台账" },
  { key: "versions", label: "版本链" },
];

function Metrics() {
  const { state } = useStore();
  const metrics = useMemo(() => {
    const chains = new Set(state.assessments.map((a) => a.chainId));
    return [
      { label: "评估链总数", value: chains.size },
      { label: "训练待复核", value: state.assessments.filter((a) => a.status === "review").length },
      { label: "待排课", value: state.assessments.filter((a) => a.status === "ready").length },
      { label: "已占用时段", value: state.bookings.length },
    ];
  }, [state]);

  return (
    <section className="metrics-grid">
      {metrics.map((m, i) => (
        <article key={m.label} className="metric-card">
          <span>{m.label}</span>
          <strong>{m.value}</strong>
          <i className={["status-ok", "status-watch", "status-danger", "status-info"][i % 4]} />
        </article>
      ))}
    </section>
  );
}

function RulesPanel() {
  return (
    <aside className="panel rules-panel">
      <p className="eyebrow-sm">规则说明</p>
      <h2>判定与冻结</h2>
      <ul>
        <li>
          调节幅度年龄下限：<strong>15 − 0.25 × 年龄</strong>（D，Hofstetter 最小幅度）
        </li>
        <li>
          集合近点 <strong>&gt; {NPC_LIMIT_CM}cm</strong> 判定集合不足
        </li>
        <li>任一项异常且评估确认 →「训练待复核」，须填训练方案才可排课</li>
        <li>检查值正常 →「评估合格」，无需复训、不开放排课</li>
        <li>同一训练位时段（日期 × 时段 × 训练位）只能排一人</li>
        <li>已排课后更正检查值：先释放原时段，再生成更正版本</li>
        <li>确认即冻结；更正新建带原因版本，旧值完整保留可审计</li>
        <li>刷新页面后经一致性修复，评估、排课、占用、版本链保持一致</li>
      </ul>
    </aside>
  );
}

function Shell() {
  const { reset } = useStore();
  const [tab, setTab] = useState<Tab>("assess");
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);

  function goSchedule(assessmentId: string) {
    setSelectedAssessmentId(assessmentId);
    setTab("schedule");
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-11 · 双眼视功能复训排程</p>
          <h1>双眼视功能评估与复训排课</h1>
          <p className="subtitle">
            登记远近视隐斜、调节幅度与集合近点；异常评估经训练待复核、填写训练方案后进入排课；
            确认冻结、更正留痕、训练位时段唯一占用。
          </p>
        </div>
        <div className="stack-card">
          <span>分层架构</span>
          <strong>数据层 data / 规则层 rules / 页面层 ui</strong>
          <button onClick={reset}>恢复演示数据</button>
        </div>
      </section>

      <Notice />
      <Metrics />

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "tab active" : "tab"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "assess" && (
        <div className="assess-workspace">
          <AssessmentPage onGoSchedule={goSchedule} />
          <RulesPanel />
        </div>
      )}
      {tab === "schedule" && (
        <SchedulePage
          selectedAssessmentId={selectedAssessmentId}
          setSelectedAssessmentId={setSelectedAssessmentId}
        />
      )}
      {tab === "occupancy" && <OccupancyPage />}
      {tab === "versions" && <VersionsPage />}
    </main>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
