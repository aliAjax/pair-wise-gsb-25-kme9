// 页面层：评估登记与版本链
// 左：评估链列表（状态/检查结论/排课数） 右：当前冻结版本 + 版本链 + 操作区
// 登记 → 草稿确认；确认后冻结；更正新建带原因版本并保留旧值；待复核须先填方案

import { useEffect, useMemo, useState } from "react";
import { useStore } from "../state/store";
import type { AssessmentChain, AssessmentVersion } from "../domain/types";
import { clinicalLabel, evaluateChecks } from "../rules/clinicalRules";
import {
  canSchedule,
  currentVersion,
  latestVersion,
  summarizeChain,
  type ChainSummary,
} from "../rules/versionRules";
import { activeBookings } from "../rules/bookingRules";
import {
  validateConfirm,
  validateCorrection,
  validateRegister,
  type DraftInput,
} from "../rules/validation";
import { TRAINING_PLAN_TEMPLATES } from "../domain/slots";
import { formatDateTime } from "../domain/dates";
import { Badge, ExamValueTable, Modal } from "./components";
import { ExamForm, emptyForm, formFromInput, toDraftInput, type ExamFormState } from "./ExamForm";
import { useToast } from "./Toast";
import { formatPhoria } from "./format";
import { nextAssessmentNo } from "../domain/id";

interface PageProps {
  onGoSchedule: (assessmentId: string | null) => void;
  preselectId: string | null;
  onConsumePreselect: () => void;
}

const STATE_BADGE: Record<string, { text: string; tone: "ok" | "warn" | "danger" | "info" | "neutral" }> = {
  DRAFT: { text: "登记草稿", tone: "neutral" },
  READY: { text: "可排课", tone: "ok" },
  REVIEW_NEED_PLAN: { text: "训练待复核 · 方案待填", tone: "danger" },
  REVIEW_READY: { text: "训练待复核 · 方案已填", tone: "warn" },
  CORRECTION_PENDING: { text: "更正待确认", tone: "info" },
};

export function AssessmentsPage({ onGoSchedule, preselectId, onConsumePreselect }: PageProps) {
  const { data, dispatch } = useStore();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(
    preselectId ?? data.chains[0]?.assessmentId ?? null
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "review" | "frozen" | "draft">("all");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [correctId, setCorrectId] = useState<string | null>(null);

  // 从排课页跳转回来选中某评估
  useEffect(() => {
    if (preselectId) {
      setSelectedId(preselectId);
      onConsumePreselect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectId]);

  const summaries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.chains
      .map((c) => summarizeChain(data, c))
      .filter((s) => {
        if (q && !`${s.chain.patientName} ${s.chain.assessmentId}`.toLowerCase().includes(q))
          return false;
        if (filter === "review")
          return s.state === "REVIEW_NEED_PLAN" || s.state === "REVIEW_READY";
        if (filter === "frozen")
          return s.state === "READY" || s.state === "REVIEW_READY" || s.state === "REVIEW_NEED_PLAN";
        if (filter === "draft") return !!s.draft;
        return true;
      });
  }, [data, query, filter]);

  const selected = selectedId
    ? data.chains.find((c) => c.assessmentId === selectedId)
    : undefined;

  return (
    <div className="page-grid">
      <section className="panel list-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">评估登记</p>
            <h2>双眼视功能评估（{data.chains.length}）</h2>
          </div>
          <button className="primary-action" onClick={() => setRegisterOpen(true)}>
            ＋ 新增评估
          </button>
        </div>
        <input
          className="search-input"
          placeholder="搜索患者姓名 / 评估编号"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="filter-tabs">
          {[
            ["all", "全部"],
            ["frozen", "已确认"],
            ["review", "待复核"],
            ["draft", "草稿/更正"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={filter === key ? "tab active" : "tab"}
              onClick={() => setFilter(key as typeof filter)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="chain-list">
          {summaries.map((s) => (
            <ChainListItem
              key={s.chain.assessmentId}
              summary={s}
              active={s.chain.assessmentId === selectedId}
              onSelect={() => setSelectedId(s.chain.assessmentId)}
            />
          ))}
          {summaries.length === 0 && <p className="empty-hint">没有符合条件的评估记录</p>}
        </div>
      </section>

      <section className="panel detail-panel">
        {selected ? (
          <AssessmentDetail
            chain={selected}
            onCorrect={() => setCorrectId(selected.assessmentId)}
            onGoSchedule={() => onGoSchedule(selected.assessmentId)}
          />
        ) : (
          <p className="empty-hint big">请在左侧选择一条评估记录</p>
        )}
      </section>

      {registerOpen && (
        <RegisterModal
          onClose={() => setRegisterOpen(false)}
          onDone={(id) => {
            setRegisterOpen(false);
            setSelectedId(id);
            toast("评估已确认并冻结，可前往排课");
          }}
          onSaveDraft={(id) => {
            setRegisterOpen(false);
            setSelectedId(id);
            toast("已保存登记草稿", "ok");
          }}
          dispatch={dispatch}
        />
      )}

      {correctId && (
        <CorrectionModal
          chain={data.chains.find((c) => c.assessmentId === correctId)!}
          onClose={() => setCorrectId(null)}
          onSaved={() => {
            setCorrectId(null);
            toast("更正已保存为待确认版本，旧值已保留");
          }}
          onConfirmed={(released) => {
            setCorrectId(null);
            toast(
              released > 0
                ? `更正已确认冻结，原依据旧版本的 ${released} 节排课已释放`
                : "更正已确认冻结，版本链已更新"
            );
          }}
          dispatch={dispatch}
        />
      )}
    </div>
  );
}

function ChainListItem({
  summary,
  active,
  onSelect,
}: {
  summary: ChainSummary;
  active: boolean;
  onSelect: () => void;
}) {
  const { chain, current, draft, state, failedCodes, booked } = summary;
  const shown = draft ?? current;
  const badge = STATE_BADGE[state];
  return (
    <article className={`chain-item ${active ? "active" : ""}`} onClick={onSelect}>
      <div className="chain-item-head">
        <strong>{chain.patientName}</strong>
        <Badge text={badge.text} tone={badge.tone} />
      </div>
      <div className="chain-item-meta">
        <span>{chain.assessmentId}</span>
        <span>{chain.patientAge} 岁</span>
        {shown && (
          <span>
            AMP {shown.amplitude}D · NPC {shown.npc}cm
          </span>
        )}
      </div>
      <div className="chain-item-foot">
        {failedCodes.length > 0 && current && (
          <span className="mini-tags">
            {failedCodes.includes("AMP_LOW") && <i className="tag tag-danger">AMP 低</i>}
            {failedCodes.includes("NPC_FAR") && <i className="tag tag-danger">NPC 远</i>}
          </span>
        )}
        {draft && !current && <i className="tag tag-neutral">未确认</i>}
        {draft && current && <i className="tag tag-info">v{draft.versionNo} 待确认</i>}
        <span className="booked-count">
          {booked.length > 0 ? `已排 ${booked.length} 节` : "未排课"}
        </span>
      </div>
    </article>
  );
}

function AssessmentDetail({
  chain,
  onCorrect,
  onGoSchedule,
}: {
  chain: AssessmentChain;
  onCorrect: () => void;
  onGoSchedule: () => void;
}) {
  const { data, dispatch } = useStore();
  const toast = useToast();
  const summary = summarizeChain(data, chain);
  const { current, draft, state } = summary;
  const [planDraft, setPlanDraft] = useState<string | null>(null);

  const bookings = data.bookings.filter((b) => b.assessmentId === chain.assessmentId);
  const activeCount = bookings.filter((b) => b.active).length;

  return (
    <div className="detail-body">
      <div className="detail-head">
        <div>
          <p className="eyebrow">{chain.assessmentId}</p>
          <h2>
            {chain.patientName}
            <span className="age-tag">{chain.patientAge} 岁</span>
          </h2>
        </div>
        <Badge
          text={STATE_BADGE[state].text}
          tone={STATE_BADGE[state].tone}
        />
      </div>

      {/* 登记草稿：尚未确认 */}
      {draft && !current && (
        <DraftSection
          chain={chain}
          draft={draft}
          onDelete={() => {
            if (window.confirm("删除该未确认登记？此操作不可恢复")) {
              dispatch({ type: "DELETE_DRAFT", assessmentId: chain.assessmentId });
              toast("登记草稿已删除");
            }
          }}
        />
      )}

      {/* 更正草稿：提示释放规则 */}
      {draft && current && (
        <section className="sub-panel correction-pending">
          <h3>v{draft.versionNo} 更正版本（待确认）</h3>
          <p className="reason-line">
            <strong>更正原因：</strong>
            {draft.correctionReason}
          </p>
          <ExamValueTable age={chain.patientAge} values={draft} />
          {draft.trainingPlan && (
            <p className="plan-line">
              <strong>训练方案：</strong>
              {draft.trainingPlan}
            </p>
          )}
          <div className="warn-strip">
            确认更正后：当前 v{current.versionNo} 将冻结为历史版本（旧值保留），
            依据 v{current.versionNo} 排的{" "}
            {data.bookings.filter((b) => b.active && b.versionId === current.versionId).length}{" "}
            节有效课时将
            <strong> 先释放原时段</strong>，需按新版本重新排课。
          </div>
          <div className="btn-row">
            <button
              className="primary-action"
              onClick={() => {
                const err = validateConfirmForCorrection(chain);
                if (err) {
                  toast(err, "err");
                  return;
                }
                const releasing = activeBookings(data).filter(
                  (b) => b.versionId === current.versionId
                ).length;
                dispatch({ type: "CONFIRM_CORRECTION", assessmentId: chain.assessmentId });
                toast(
                  releasing > 0
                    ? `更正已确认，已释放 ${releasing} 节原课时`
                    : "更正已确认冻结"
                );
              }}
            >
              确认更正（释放原时段）
            </button>
            <button
              onClick={() => {
                dispatch({ type: "CANCEL_CORRECTION", assessmentId: chain.assessmentId });
                toast("已放弃更正草稿，冻结版本不变");
              }}
            >
              放弃更正
            </button>
            <button onClick={onCorrect}>编辑更正内容</button>
          </div>
        </section>
      )}

      {/* 当前生效冻结版本 */}
      {current && (
        <section className="sub-panel">
          <div className="sub-head">
            <h3>当前评估 · v{current.versionNo}（已冻结）</h3>
            <span className="muted small">确认于 {formatDateTime(current.confirmedAt)}</span>
          </div>
          <ExamValueTable age={chain.patientAge} values={current} />
          <div className="plan-block">
            <div className="plan-head">
              <strong>训练方案</strong>
              {(() => {
                const label = clinicalLabel(chain.patientAge, current, current.trainingPlan);
                return <Badge text={label.text} tone={label.tone} />;
              })()}
            </div>
            {planDraft !== null ? (
              <div>
                <textarea
                  rows={3}
                  className="plan-edit"
                  value={planDraft}
                  onChange={(e) => setPlanDraft(e.target.value)}
                />
                <div className="template-row">
                  {TRAINING_PLAN_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl}
                      type="button"
                      className="chip-btn"
                      onClick={() => setPlanDraft(tpl)}
                    >
                      {tpl.split("：")[0]}
                    </button>
                  ))}
                </div>
                <div className="btn-row">
                  <button
                    className="primary-action"
                    onClick={() => {
                      if (!planDraft.trim()) {
                        toast("训练方案不能为空", "err");
                        return;
                      }
                      dispatch({
                        type: "SET_PLAN",
                        assessmentId: chain.assessmentId,
                        plan: planDraft,
                      });
                      setPlanDraft(null);
                      toast("训练方案已补录（检查值保持冻结）");
                    }}
                  >
                    保存方案
                  </button>
                  <button onClick={() => setPlanDraft(null)}>取消</button>
                </div>
              </div>
            ) : current.trainingPlan ? (
              <p className="plan-line">{current.trainingPlan}</p>
            ) : (
              <p className="plan-line muted">
                {evaluateChecks(chain.patientAge, current).length > 0
                  ? "检查未通过，必须补录训练方案后才可排课"
                  : "检查通过，无需训练方案（如需复训可补录）"}
              </p>
            )}
            {planDraft === null && (
              <button className="link-btn" onClick={() => setPlanDraft(current.trainingPlan)}>
                {current.trainingPlan ? "修改训练方案" : "补录训练方案"}
              </button>
            )}
          </div>

          <div className="btn-row action-row">
            <button
              className="primary-action"
              disabled={!canSchedule(summary)}
              onClick={onGoSchedule}
              title={canSchedule(summary) ? "" : "训练待复核：须先填写训练方案"}
            >
              前往排课 →
            </button>
            <button onClick={onCorrect} disabled={!!draft}>
              更正检查值（新建版本）
            </button>
          </div>
          {!canSchedule(summary) && state !== "CORRECTION_PENDING" && (
            <p className="inline-err">当前不可排课：请先补录训练方案</p>
          )}
        </section>
      )}

      {/* 版本链 */}
      <section className="sub-panel">
        <h3>版本链（{chain.versions.length}）</h3>
        <ol className="version-timeline">
          {[...chain.versions].reverse().map((v) => (
            <VersionNode
              key={v.versionId}
              v={v}
              age={chain.patientAge}
              isCurrent={current?.versionId === v.versionId}
              bookings={bookings.filter((b) => b.versionId === v.versionId)}
            />
          ))}
        </ol>
      </section>
    </div>
  );
}

function validateConfirmForCorrection(chain: AssessmentChain): string | null {
  const draft = latestVersion(chain);
  return validateCorrection(
    chain,
    {
      distancePhoria: draft.distancePhoria,
      nearPhoria: draft.nearPhoria,
      amplitude: draft.amplitude,
      npc: draft.npc,
    },
    draft.trainingPlan,
    draft.correctionReason
  );
}

function DraftSection({
  chain,
  draft,
  onDelete,
}: {
  chain: AssessmentChain;
  draft: AssessmentVersion;
  onDelete: () => void;
}) {
  const { dispatch } = useStore();
  const toast = useToast();
  return (
    <section className="sub-panel draft-panel">
      <div className="sub-head">
        <h3>登记草稿 · v1（确认前可修改）</h3>
        <Badge text="未冻结" tone="neutral" />
      </div>
      <ExamValueTable age={chain.patientAge} values={draft} />
      {draft.trainingPlan && (
        <p className="plan-line">
          <strong>训练方案：</strong>
          {draft.trainingPlan}
        </p>
      )}
      <div className="btn-row">
        <button
          className="primary-action"
          onClick={() => {
            const err = validateConfirm(chain);
            if (err) {
              toast(err, "err");
              return;
            }
            dispatch({ type: "CONFIRM", assessmentId: chain.assessmentId });
            toast("评估已确认并冻结");
          }}
        >
          确认评估（冻结）
        </button>
        <button onClick={onDelete}>删除登记</button>
      </div>
    </section>
  );
}

function VersionNode({
  v,
  age,
  isCurrent,
  bookings,
}: {
  v: AssessmentVersion;
  age: number;
  isCurrent: boolean;
  bookings: { bookingId: string; active: boolean; date: string; stationId: string; periodId: string }[];
}) {
  const statusMap = {
    draft: { text: "待确认", tone: "neutral" as const },
    confirmed: { text: isCurrent ? "当前生效" : "已确认", tone: "ok" as const },
    superseded: { text: "已被取代", tone: "neutral" as const },
  };
  const meta = statusMap[v.status];
  const failed = evaluateChecks(age, v);
  return (
    <li className={`version-node status-${v.status}`}>
      <div className="version-head">
        <strong>v{v.versionNo}</strong>
        <Badge text={meta.text} tone={meta.tone} />
        <span className="muted small">{formatDateTime(v.createdAt)}</span>
      </div>
      <div className="version-values">
        <span>远隐斜 {formatPhoria(v.distancePhoria)}</span>
        <span>近隐斜 {formatPhoria(v.nearPhoria)}</span>
        <span className={failed.some((f) => f.code === "AMP_LOW") ? "val-fail" : ""}>
          AMP {v.amplitude}D
        </span>
        <span className={failed.some((f) => f.code === "NPC_FAR") ? "val-fail" : ""}>
          NPC {v.npc}cm
        </span>
      </div>
      {v.versionNo > 1 && (
        <p className="reason-line small">
          <strong>更正原因：</strong>
          {v.correctionReason}
        </p>
      )}
      {v.trainingPlan && (
        <p className="reason-line small">
          <strong>方案：</strong>
          {v.trainingPlan}
        </p>
      )}
      {bookings.length > 0 && (
        <div className="version-bookings">
          {bookings.map((b) => (
            <span key={b.bookingId} className={`mini-booking ${b.active ? "" : "released"}`}>
              {b.date} {b.stationId.toUpperCase().replace("STA-", "位")}·{b.periodId.toUpperCase()}
              {b.active ? "" : "（已释放）"}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

function RegisterModal({
  onClose,
  onDone,
  onSaveDraft,
  dispatch,
}: {
  onClose: () => void;
  onDone: (id: string) => void;
  onSaveDraft: (id: string) => void;
  dispatch: ReturnType<typeof useStore>["dispatch"];
}) {
  const toast = useToast();
  const [form, setForm] = useState<ExamFormState>(emptyForm);

  const submit = (andConfirm: boolean) => {
    const input: DraftInput = toDraftInput(form);
    const err = validateRegister(input);
    if (err) {
      toast(err, "err");
      return;
    }
    if (andConfirm) {
      const failed = evaluateChecks(Number(input.patientAge), input.values);
      if (failed.length > 0 && !input.trainingPlan.trim()) {
        toast("调节幅度/NPC 未通过：登记前请填写训练方案（进入训练待复核）", "err");
        return;
      }
    }
    const newId = nextAssessmentNo();
    dispatch({ type: "REGISTER", input, andConfirm, id: newId });
    if (andConfirm) onDone(newId);
    else onSaveDraft(newId);
  };

  return (
    <Modal
      title="新增双眼视功能评估登记"
      onClose={onClose}
      wide
      footer={
        <>
          <button onClick={() => submit(false)}>保存草稿</button>
          <button className="primary-action" onClick={() => submit(true)}>
            确认登记并冻结
          </button>
        </>
      }
    >
      <ExamForm state={form} onChange={setForm} planMode="reviewOnly" />
      <p className="form-footnote">
        调节幅度低于年龄下限（Hofstetter 15−0.25×年龄）或集合近点超过 10cm 时，只能进入
        <strong>训练待复核</strong>，填写训练方案后方可排课。
      </p>
    </Modal>
  );
}

function CorrectionModal({
  chain,
  onClose,
  onSaved,
  onConfirmed,
  dispatch,
}: {
  chain: AssessmentChain;
  onClose: () => void;
  onSaved: () => void;
  onConfirmed: (released: number) => void;
  dispatch: ReturnType<typeof useStore>["dispatch"];
}) {
  const { data } = useStore();
  const toast = useToast();
  const cur = currentVersion(chain)!;
  const existingDraft = chain.versions.find((v) => v.status === "draft" && v !== cur);
  const [form, setForm] = useState<ExamFormState>(() =>
    formFromInput({
      patientName: chain.patientName,
      patientAge: chain.patientAge,
      values: existingDraft ?? cur,
      trainingPlan: existingDraft?.trainingPlan ?? cur.trainingPlan,
    })
  );
  const [reason, setReason] = useState(existingDraft?.correctionReason ?? "");

  const buildValues = () => toDraftInput(form).values;
  const values = buildValues();
  const err = reason.trim()
    ? validateCorrection(chain, values, form.trainingPlan, reason)
    : null;
  const releasing = data.bookings.filter(
    (b) => b.active && b.versionId === cur.versionId
  ).length;

  const saveDraftOnly = () => {
    if (!reason.trim()) {
      toast("更正必须填写原因", "err");
      return;
    }
    const verr = validateCorrection(chain, values, form.trainingPlan, reason);
    if (verr && verr.includes("须填写训练方案")) {
      toast(verr, "err");
      return;
    }
    if (existingDraft) {
      dispatch({
        type: "EDIT_CORRECTION",
        assessmentId: chain.assessmentId,
        values,
        trainingPlan: form.trainingPlan,
        reason,
      });
    } else {
      dispatch({
        type: "START_CORRECTION",
        assessmentId: chain.assessmentId,
        values,
        trainingPlan: form.trainingPlan,
        reason,
      });
    }
    onSaved();
  };

  const confirmNow = () => {
    const verr = validateCorrection(chain, values, form.trainingPlan, reason);
    if (verr) {
      toast(verr, "err");
      return;
    }
    if (existingDraft) {
      dispatch({
        type: "EDIT_CORRECTION",
        assessmentId: chain.assessmentId,
        values,
        trainingPlan: form.trainingPlan,
        reason,
      });
    } else {
      dispatch({
        type: "START_CORRECTION",
        assessmentId: chain.assessmentId,
        values,
        trainingPlan: form.trainingPlan,
        reason,
      });
    }
    dispatch({ type: "CONFIRM_CORRECTION", assessmentId: chain.assessmentId });
    onConfirmed(releasing);
  };

  return (
    <Modal
      title={`更正检查值 · ${chain.patientName}（${chain.assessmentId}）`}
      onClose={onClose}
      wide
      footer={
        <>
          <button onClick={saveDraftOnly}>保存更正草稿</button>
          <button className="primary-action" onClick={confirmNow}>
            确认更正{releasing > 0 ? `（释放 ${releasing} 节原排课）` : ""}
          </button>
        </>
      }
    >
      <div className="correction-compare">
        <div>
          <p className="eyebrow">冻结旧值 v{cur.versionNo}（保留不可改）</p>
          <ExamValueTable age={chain.patientAge} values={cur} />
        </div>
        <div className="correction-new">
          <p className="eyebrow">新检查值 v{cur.versionNo + 1}</p>
          <ExamForm state={form} onChange={setForm} showPatient={false} planMode="reviewOnly" />
        </div>
      </div>
      <label className="field reason-field">
        <span>更正原因（必填，将随版本链永久保留）</span>
        <textarea
          rows={2}
          value={reason}
          placeholder="如：首次测量配合欠佳，散瞳后复查重测"
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {err && <p className="inline-err">{err}</p>}
      <p className="form-footnote">
        确认更正后 v{cur.versionNo} 置为「已被取代」并原样保留；依据 v{cur.versionNo} 的
        {releasing > 0 ? ` ${releasing} 节` : ""}有效排课会先释放，再按新版本重新排课。
      </p>
    </Modal>
  );
}
