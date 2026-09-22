import { useState } from "react";
import type { Assessment, Patient } from "../../data/types";
import { SESSIONS, STATIONS } from "../../data/catalog";
import { useStore, S } from "../../state/store";
import { evaluateMeasurements, formatPhoria, NPC_LIMIT_CM } from "../../rules/clinical";
import type { AssessmentChain } from "../../rules/versionChain";
import { StatusBadge } from "./StatusBadge";
import { weekdayLabel } from "../format";

function MeasurementRows({
  assessment,
  patient,
}: {
  assessment: Assessment;
  patient: Patient;
}) {
  const flags = evaluateMeasurements(assessment.measurements, patient.age);
  const m = assessment.measurements;
  return (
    <dl className="measure-grid">
      <div>
        <dt>远距隐斜</dt>
        <dd>{formatPhoria(m.distancePhoria)}</dd>
      </div>
      <div>
        <dt>近距隐斜</dt>
        <dd>{formatPhoria(m.nearPhoria)}</dd>
      </div>
      <div className={flags.amplitudeFails ? "bad" : ""}>
        <dt>
          调节幅度 <small>下限 {flags.amplitudeMin}D</small>
        </dt>
        <dd>
          {m.amplitude}D {flags.amplitudeFails && <em className="tag-fail">低于下限</em>}
        </dd>
      </div>
      <div className={flags.npcFails ? "bad" : ""}>
        <dt>
          集合近点 <small>&gt;{NPC_LIMIT_CM}cm 异常</small>
        </dt>
        <dd>
          {m.npc}cm {flags.npcFails && <em className="tag-fail">超过阈值</em>}
        </dd>
      </div>
    </dl>
  );
}

function BookingSummary({ assessment }: { assessment: Assessment }) {
  const { state } = useStore();
  const slot = S.slotOfAssessment(state, assessment);
  if (!slot) return null;
  const session = SESSIONS.find((x) => x.id === slot.sessionId);
  const station = STATIONS.find((x) => x.id === slot.stationId);
  return (
    <p className="booking-line">
      已占训练位：{slot.date}（{weekdayLabel(slot.date)}）· {session?.label} · {station?.name}
    </p>
  );
}

export function AssessmentCard({
  chain,
  assessment,
  patient,
  onGoSchedule,
}: {
  chain: AssessmentChain;
  assessment: Assessment;
  patient: Patient;
  onGoSchedule: (assessmentId: string) => void;
}) {
  const {
    state,
    confirmAssessment,
    deleteDraft,
    saveTrainingPlan,
    correctAssessment,
    cancelBooking,
  } = useStore();
  const [planDraft, setPlanDraft] = useState("");
  const [editingPlan, setEditingPlan] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [reason, setReason] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const a = assessment;
  const isSuperseded = a.status === "superseded";
  const oldVersions = chain.versions.filter((v) => v.id !== chain.latest.id);

  function submitPlan(initial: string) {
    void initial;
    const success = saveTrainingPlan(a.id, planDraft);
    if (success) {
      setEditingPlan(false);
      setPlanDraft("");
    }
  }

  return (
    <article className={`assessment-card ${isSuperseded ? "dimmed" : ""}`}>
      <header className="card-head">
        <div>
          <h3>
            {patient.name}
            <small>
              {patient.age} 岁 · 检查日 {a.measuredAt}（{weekdayLabel(a.measuredAt)}）
            </small>
          </h3>
          <p className="chain-line">
            版本链 {a.chainId} · 第 {a.version} 版
            {chain.versions.length > 1 && <> · 共 {chain.versions.length} 版</>}
          </p>
        </div>
        <StatusBadge status={a.status} />
      </header>

      <MeasurementRows assessment={a} patient={patient} />

      {a.reason && a.version > 1 && <p className="reason-line">更正原因：{a.reason}</p>}

      {a.trainingPlan ? (
        <p className="plan-line">
          <strong>训练方案：</strong>
          {a.trainingPlan}
        </p>
      ) : (
        !isSuperseded &&
        a.status !== "passed" && (
          <p className="plan-line missing">尚未填写训练方案（异常评估排课前置条件）</p>
        )
      )}

      <BookingSummary assessment={a} />

      {a.status === "draft" && (
        <div className="card-actions">
          <button className="primary-action" onClick={() => confirmAssessment(a.id)}>
            确认并冻结
          </button>
          <button onClick={() => deleteDraft(a.id)}>删除</button>
          <span className="hint-text">确认后检查值冻结</span>
        </div>
      )}

      {a.status === "review" && (
        <div className="review-box">
          <textarea
            rows={2}
            autoFocus
            placeholder="填写训练方案后才可排课，如：推进训练 ×20 次/组，每日 2 组"
            value={planDraft}
            onChange={(e) => setPlanDraft(e.target.value)}
          />
          <div className="card-actions">
            <button className="primary-action" onClick={() => submitPlan("")}>
              提交训练方案
            </button>
          </div>
        </div>
      )}

      {a.status === "ready" && !editingPlan && (
        <div className="card-actions">
          <button className="primary-action" onClick={() => onGoSchedule(a.id)}>
            去排课 →
          </button>
          <button
            onClick={() => {
              setPlanDraft(a.trainingPlan ?? "");
              setEditingPlan(true);
            }}
          >
            修改训练方案
          </button>
          <button onClick={() => setCorrecting(true)}>更正检查值</button>
        </div>
      )}

      {a.status === "ready" && editingPlan && (
        <div className="review-box">
          <textarea
            rows={2}
            value={planDraft}
            onChange={(e) => setPlanDraft(e.target.value)}
          />
          <div className="card-actions">
            <button className="primary-action" onClick={() => submitPlan("")}>
              保存方案
            </button>
            <button onClick={() => setEditingPlan(false)}>取消</button>
          </div>
        </div>
      )}

      {a.status === "booked" && (
        <div className="card-actions">
          <button onClick={() => cancelBooking(a.id)}>取消排课（释放时段）</button>
          <button className="danger-ghost" onClick={() => setCorrecting(true)}>
            更正检查值（先释放原时段）
          </button>
        </div>
      )}

      {a.status === "passed" && (
        <div className="card-actions">
          <button onClick={() => setCorrecting(true)}>更正检查值</button>
          <span className="hint-text">检查值在正常范围，无需复训排课</span>
        </div>
      )}

      {correcting && (
        <div className="correct-box">
          <label>
            <span>更正原因（必填，旧值与原因一并保留在版本链）</span>
            <textarea
              rows={2}
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="如：散瞳复查后复测，调节幅度修正"
            />
          </label>
          <div className="card-actions">
            <button
              className="primary-action"
              onClick={() => {
                const success = correctAssessment(a.id, reason);
                if (success) {
                  setCorrecting(false);
                  setReason("");
                }
              }}
            >
              确认更正，生成新版本
            </button>
            <button onClick={() => setCorrecting(false)}>取消</button>
            {a.status === "booked" && (
              <span className="hint-text warn">该评估已排课，确认后自动释放原时段</span>
            )}
          </div>
        </div>
      )}

      {oldVersions.length > 0 && (
        <div className="history">
          <button className="link-button" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? "收起旧版本" : `查看历史版本（${oldVersions.length}）`}
          </button>
          {showHistory && (
            <div className="history-list">
              {chain.versions.map((v) => {
                const vp = state.patients.find((p) => p.id === v.patientId)!;
                const isCurrent = v.id === a.id;
                return (
                  <div key={v.id} className={`history-item ${isCurrent ? "current" : ""}`}>
                    <div className="history-head">
                      <strong>v{v.version}</strong>
                      <StatusBadge status={v.status} />
                      <small>{v.measuredAt}</small>
                    </div>
                    <MeasurementRows assessment={v} patient={vp} />
                    {v.reason && <p className="reason-line">更正原因：{v.reason}</p>}
                    {v.trainingPlan && (
                      <p className="plan-line">
                        <strong>训练方案：</strong>
                        {v.trainingPlan}
                      </p>
                    )}
                    {isCurrent && <small className="current-tag">当前版本</small>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
