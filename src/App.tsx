import { useState } from "react";
import "./styles.css";
import { StoreProvider, useStore } from "./state/store";
import { ToastProvider, useToast } from "./ui/Toast";
import { Dashboard } from "./ui/Dashboard";
import { AssessmentsPage } from "./ui/AssessmentsPage";
import { SchedulePage } from "./ui/SchedulePage";

type Tab = "assessments" | "schedule";

function Shell() {
  const { data, dispatch } = useStore();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("assessments");
  const [schedulePick, setSchedulePick] = useState<string | null>(null);

  const goSchedule = (assessmentId: string | null) => {
    setSchedulePick(assessmentId);
    setTab("schedule");
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-11 · 双眼视功能复训排程</p>
          <h1>眼科验光记录 → 双眼视功能复训排程</h1>
          <p className="subtitle">
            每次评估登记患者、远距离/近距离隐斜、调节幅度与集合近点；
            调节幅度低于年龄下限（Hofstetter 15−0.25×年龄）或集合近点超过 10cm 时进入
            <strong> 训练待复核</strong>，须填训练方案才可排课。评估确认后冻结，更正生成带原因新版本并保留旧值。
          </p>
        </div>
        <div className="stack-card">
          <span>数据 / 规则 / 页面 分层</span>
          <strong>
            domain（类型·存储·示例）
            <br />
            rules（临床·占用·版本·校验）
            <br />
            state（reducer）· ui（页面）
          </strong>
          <button
            className="reset-btn"
            onClick={() => {
              if (window.confirm("恢复为内置演示数据？当前录入将被清空。")) {
                dispatch({ type: "RESET_SAMPLE" });
                toast("已恢复演示数据");
              }
            }}
          >
            重置演示数据
          </button>
        </div>
      </section>

      <Dashboard data={data} />

      <nav className="main-tabs">
        <button className={tab === "assessments" ? "active" : ""} onClick={() => setTab("assessments")}>
          评估与版本链
        </button>
        <button className={tab === "schedule" ? "active" : ""} onClick={() => setTab("schedule")}>
          复训排课
        </button>
      </nav>

      {tab === "assessments" ? (
        <AssessmentsPage
          onGoSchedule={goSchedule}
          preselectId={schedulePick}
          onConsumePreselect={() => setSchedulePick(null)}
        />
      ) : (
        <SchedulePage
          preselectId={schedulePick}
          onConsumePreselect={() => setSchedulePick(null)}
        />
      )}

      <footer className="rules-foot">
        <h3>系统规则</h3>
        <ul>
          <li>登记项：患者、年龄、远/近视隐斜（△ EXO/ESO/正位）、调节幅度 AMP（D）、集合近点 NPC（cm）。</li>
          <li>排课门槛：AMP ≥ 15−0.25×年龄 且 NPC ≤ 10cm；任一不达标即为训练待复核，补齐训练方案前排课按钮禁用。</li>
          <li>占用规则：同一训练位同一时段至多 1 人，同一患者同日至多 1 节；释放后时段立即可约。</li>
          <li>冻结与版本：确认后检查值不可改；更正必须填原因，生成新版本，旧版本标记「已被取代」并完整保留。</li>
          <li>已排课后修改检查值：更正确认时先释放依据旧版本排的全部有效课时，再按新版本重新排课。</li>
          <li>数据保存在浏览器本地（localStorage），刷新后评估、排课、占用与版本链保持一致。</li>
        </ul>
      </footer>
    </main>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </StoreProvider>
  );
}
