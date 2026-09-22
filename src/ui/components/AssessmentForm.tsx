import { useMemo, useState } from "react";
import type { Measurements, Phoria } from "../../data/types";
import { useStore } from "../../state/store";
import { evaluateMeasurements, formatPhoria, NPC_LIMIT_CM } from "../../rules/clinical";
import { PhoriaInput } from "./PhoriaInput";
import { todayKey } from "../format";

interface FormState {
  patientId: string;
  measuredAt: string;
  distance: Phoria;
  near: Phoria;
  amplitude: string;
  npc: string;
  trainingPlan: string;
}

const EMPTY: FormState = {
  patientId: "",
  measuredAt: todayKey(),
  distance: { direction: "ortho", magnitude: 0 },
  near: { direction: "ortho", magnitude: 0 },
  amplitude: "",
  npc: "",
  trainingPlan: "",
};

export function AssessmentForm({ onDone }: { onDone?: () => void }) {
  const { state, createAssessment, addPatient } = useStore();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAge, setNewAge] = useState("");

  const patient = state.patients.find((p) => p.id === form.patientId);
  const amplitude = Number(form.amplitude);
  const npc = Number(form.npc);
  const draft: Measurements | null =
    form.amplitude !== "" && form.npc !== ""
      ? {
          distancePhoria: form.distance,
          nearPhoria: form.near,
          amplitude,
          npc,
        }
      : null;

  const flags = useMemo(
    () => (patient && draft ? evaluateMeasurements(draft, patient.age) : null),
    [patient, draft],
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleNewPatient() {
    const id = addPatient({ name: newName, age: Number(newAge) });
    if (!id) return;
    update("patientId", id);
    setShowNewPatient(false);
    setNewName("");
    setNewAge("");
  }

  function submit() {
    if (!draft) return;
    const success = createAssessment({
      patientId: form.patientId,
      measuredAt: form.measuredAt,
      measurements: draft,
      trainingPlan: form.trainingPlan || undefined,
    });
    if (success) {
      setForm({ ...EMPTY, measuredAt: todayKey() });
      onDone?.();
    }
  }

  return (
    <div className="panel form-panel">
      <div className="section-heading">
        <div>
          <p>评估登记</p>
          <h2>双眼视功能检查</h2>
        </div>
        <button className="ghost" onClick={() => setShowNewPatient((v) => !v)}>
          {showNewPatient ? "收起新建" : "＋ 新建患者"}
        </button>
      </div>

      {showNewPatient && (
        <div className="inline-patient">
          <input
            placeholder="患者姓名"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            type="number"
            min={1}
            max={120}
            placeholder="年龄"
            value={newAge}
            onChange={(e) => setNewAge(e.target.value)}
          />
          <button onClick={handleNewPatient}>建档并选中</button>
        </div>
      )}

      <div className="field-grid">
        <label className="field">
          <span>患者</span>
          <select
            value={form.patientId}
            onChange={(e) => update("patientId", e.target.value)}
          >
            <option value="">请选择患者</option>
            {state.patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（{p.age} 岁）
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>检查日期</span>
          <input
            type="date"
            value={form.measuredAt}
            onChange={(e) => update("measuredAt", e.target.value)}
          />
        </label>

        <PhoriaInput
          label="远距隐斜（5m）"
          value={form.distance}
          onChange={(v) => update("distance", v)}
        />
        <PhoriaInput
          label="近距隐斜（33cm）"
          value={form.near}
          onChange={(v) => update("near", v)}
        />

        <label className="field">
          <span>调节幅度（D）</span>
          <input
            type="number"
            min={0}
            step={0.5}
            placeholder="如 10"
            value={form.amplitude}
            onChange={(e) => update("amplitude", e.target.value)}
          />
        </label>
        <label className="field">
          <span>集合近点 NPC（cm）</span>
          <input
            type="number"
            min={0}
            step={0.5}
            placeholder="如 8"
            value={form.npc}
            onChange={(e) => update("npc", e.target.value)}
          />
        </label>
      </div>

      {patient && flags && draft && (
        <div className={`rule-hint ${flags.abnormal ? "bad" : "good"}`}>
          <div>
            <strong>
              {patient.name}（{patient.age} 岁）实时判定：
            </strong>
          </div>
          <ul>
            <li className={flags.amplitudeFails ? "fail" : "pass"}>
              调节幅度 {draft.amplitude}D，年龄下限 {flags.amplitudeMin}D
              {flags.amplitudeFails ? " → 低于下限 ✗" : " → 达标 ✓"}
            </li>
            <li className={flags.npcFails ? "fail" : "pass"}>
              集合近点 {draft.npc}cm，阈值 {NPC_LIMIT_CM}cm
              {flags.npcFails ? " → 超过阈值 ✗" : " → 达标 ✓"}
            </li>
            <li className="muted">
              远距 {formatPhoria(form.distance)} · 近距 {formatPhoria(form.near)}（登记留档）
            </li>
            <li>
              确认后将进入：
              <strong>
                {flags.abnormal
                  ? "训练待复核（须填训练方案才可排课）"
                  : "评估合格（无需复训）"}
              </strong>
            </li>
          </ul>
        </div>
      )}

      <label className="field plan-field">
        <span>训练方案（异常评估排课前必填，也可在复核环节补填）</span>
        <textarea
          rows={2}
          placeholder="如：推进训练 × 20 次/组，每日 2 组，4 周后复查"
          value={form.trainingPlan}
          onChange={(e) => update("trainingPlan", e.target.value)}
        />
      </label>

      <div className="form-actions">
        <button className="primary-action" onClick={submit}>
          登记评估（进入待确认）
        </button>
        <span className="hint-text">确认后冻结；修改检查值须走「更正」并保留旧值</span>
      </div>
    </div>
  );
}
