import { useMemo } from "react";
import { useStore } from "../../state/store";
import { selectChains } from "../../rules/versionChain";
import { evaluateMeasurements, formatPhoria, NPC_LIMIT_CM } from "../../rules/clinical";
import { StatusBadge } from "../components/StatusBadge";
import { weekdayLabel } from "../format";

export function VersionsPage() {
  const { state } = useStore();
  const chains = useMemo(
    () => selectChains(state.assessments).filter((c) => c.versions.length > 1),
    [state.assessments],
  );

  return (
    <section className="panel versions-panel">
      <div className="section-heading">
        <div>
          <p>版本链审计</p>
          <h2>更正新建版本 · 旧值完整保留</h2>
        </div>
      </div>
      <p className="muted-hint">
        共 {chains.length} 条发生过更正的评估链；全部评估（含未更正）共{" "}
        {selectChains(state.assessments).length} 条链。
      </p>

      {chains.length === 0 && <p className="muted-hint">暂无更正记录。</p>}

      {chains.map((chain) => {
        const patient = state.patients.find((p) => p.id === chain.latest.patientId);
        return (
          <div key={chain.chainId} className="v-chain">
            <h3>
              {patient?.name} · 链 {chain.chainId}（{chain.versions.length} 版）
            </h3>
            <div className="v-track">
              {chain.versions.map((v, i) => {
                const flags = patient
                  ? evaluateMeasurements(v.measurements, patient.age)
                  : null;
                return (
                  <div key={v.id} className="v-node-wrap">
                    <div className={`v-node ${v.status === "superseded" ? "old" : "new"}`}>
                      <div className="v-node-head">
                        <strong>v{v.version}</strong>
                        <StatusBadge status={v.status} />
                        <small>
                          {v.measuredAt}（{weekdayLabel(v.measuredAt)}）
                        </small>
                      </div>
                      <ul className="v-values">
                        <li>
                          远距隐斜 {formatPhoria(v.measurements.distancePhoria)} · 近距{" "}
                          {formatPhoria(v.measurements.nearPhoria)}
                        </li>
                        <li className={flags?.amplitudeFails ? "bad" : ""}>
                          调节幅度 {v.measurements.amplitude}D
                          {flags && <>（下限 {flags.amplitudeMin}D）</>}
                          {flags?.amplitudeFails && " ✗"}
                        </li>
                        <li className={flags?.npcFails ? "bad" : ""}>
                          集合近点 {v.measurements.npc}cm（&gt;{NPC_LIMIT_CM}cm 异常）
                          {flags?.npcFails && " ✗"}
                        </li>
                      </ul>
                      {v.reason && (
                        <p className="reason-line">
                          {v.version > 1 ? "更正原因：" : ""}
                          {v.reason}
                        </p>
                      )}
                      {v.trainingPlan && (
                        <p className="plan-line">
                          <strong>方案：</strong>
                          {v.trainingPlan}
                        </p>
                      )}
                    </div>
                    {i < chain.versions.length - 1 && <div className="v-arrow">→ 更正（旧版冻结，已排课先释放）</div>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
