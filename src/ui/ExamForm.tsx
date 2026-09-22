// 页面层：双眼视功能检查录入表单（登记 / 更正复用）
// 字段：患者、年龄、远近隐斜、调节幅度、集合近点、训练方案
// 实时提示直接调用规则层，但不改变任何数据

import React from "react";
import type { PhoriaDirection } from "../domain/types";
import { TRAINING_PLAN_TEMPLATES } from "../domain/slots";
import { amplitudeLowerLimit, evaluateChecks, NPC_LIMIT_CM } from "../rules/clinicalRules";
import type { DraftInput } from "../rules/validation";

export interface ExamFormState {
  patientName: string;
  patientAge: string;
  distValue: string;
  distDir: PhoriaDirection;
  nearValue: string;
  nearDir: PhoriaDirection;
  amplitude: string;
  npc: string;
  trainingPlan: string;
}

export function emptyForm(): ExamFormState {
  return {
    patientName: "",
    patientAge: "",
    distValue: "",
    distDir: "exo",
    nearValue: "",
    nearDir: "exo",
    amplitude: "",
    npc: "",
    trainingPlan: "",
  };
}

export function formFromInput(input: DraftInput): ExamFormState {
  return {
    patientName: input.patientName,
    patientAge: String(input.patientAge),
    distValue: String(input.values.distancePhoria.value),
    distDir: input.values.distancePhoria.direction,
    nearValue: String(input.values.nearPhoria.value),
    nearDir: input.values.nearPhoria.direction,
    amplitude: String(input.values.amplitude),
    npc: String(input.values.npc),
    trainingPlan: input.trainingPlan,
  };
}

export function toDraftInput(s: ExamFormState): DraftInput {
  return {
    patientName: s.patientName,
    patientAge: Number(s.patientAge),
    values: {
      distancePhoria: { value: Number(s.distValue) || 0, direction: s.distDir },
      nearPhoria: { value: Number(s.nearValue) || 0, direction: s.nearDir },
      amplitude: Number(s.amplitude),
      npc: Number(s.npc),
    },
    trainingPlan: s.trainingPlan,
  };
}

interface ExamFormProps {
  state: ExamFormState;
  onChange: (next: ExamFormState) => void;
  showPatient?: boolean;
  /** 训练方案编辑区：always 显示 / reviewOnly 仅在检查不通过时显示 / hide 不显示 */
  planMode?: "always" | "reviewOnly" | "hide";
  disabled?: boolean;
}

export function ExamForm({
  state,
  onChange,
  showPatient = true,
  planMode = "reviewOnly",
  disabled = false,
}: ExamFormProps) {
  const set = <K extends keyof ExamFormState>(key: K, value: ExamFormState[K]) =>
    onChange({ ...state, [key]: value });

  const age = Number(state.patientAge);
  const ageOk = Number.isFinite(age) && age > 0 && age <= 120;
  const ampMin = ageOk ? amplitudeLowerLimit(age) : null;
  const allFilled =
    state.distValue !== "" &&
    state.nearValue !== "" &&
    state.amplitude !== "" &&
    state.npc !== "" &&
    ageOk;
  const failed = allFilled ? evaluateChecks(age, toDraftInput(state).values) : [];
  const showPlan = planMode === "always" || (planMode === "reviewOnly" && failed.length > 0);

  return (
    <div className="exam-form">
      {showPatient && (
        <div className="form-row form-row-2">
          <label className="field">
            <span>患者姓名</span>
            <input
              value={state.patientName}
              disabled={disabled}
              placeholder="如：林晓"
              onChange={(e) => set("patientName", e.target.value)}
            />
          </label>
          <label className="field">
            <span>年龄（岁）</span>
            <input
              type="number"
              min={1}
              max={120}
              value={state.patientAge}
              disabled={disabled}
              placeholder="用于 Hofstetter 下限"
              onChange={(e) => set("patientAge", e.target.value)}
            />
          </label>
        </div>
      )}

      <div className="form-row form-row-2">
        <label className="field">
          <span>远距离水平隐斜（5m，棱镜度 △）</span>
          <div className="inline-num">
            <input
              type="number"
              min={0}
              step={0.5}
              value={state.distValue}
              disabled={disabled}
              placeholder="0"
              onChange={(e) => set("distValue", e.target.value)}
            />
            <select
              value={state.distDir}
              disabled={disabled}
              onChange={(e) => set("distDir", e.target.value as PhoriaDirection)}
            >
              <option value="exo">外隐斜 EXO</option>
              <option value="eso">内隐斜 ESO</option>
              <option value="ortho">正位</option>
            </select>
          </div>
        </label>
        <label className="field">
          <span>近距离水平隐斜（33cm，棱镜度 △）</span>
          <div className="inline-num">
            <input
              type="number"
              min={0}
              step={0.5}
              value={state.nearValue}
              disabled={disabled}
              placeholder="0"
              onChange={(e) => set("nearValue", e.target.value)}
            />
            <select
              value={state.nearDir}
              disabled={disabled}
              onChange={(e) => set("nearDir", e.target.value as PhoriaDirection)}
            >
              <option value="exo">外隐斜 EXO</option>
              <option value="eso">内隐斜 ESO</option>
              <option value="ortho">正位</option>
            </select>
          </div>
        </label>
      </div>

      <div className="form-row form-row-2">
        <label className="field">
          <span>
            调节幅度 AMP（D）
            {ampMin !== null && <em className="hint">年龄下限 {ampMin}D</em>}
          </span>
          <input
            type="number"
            min={0}
            step={0.25}
            value={state.amplitude}
            disabled={disabled}
            placeholder="如 12"
            onChange={(e) => set("amplitude", e.target.value)}
          />
        </label>
        <label className="field">
          <span>
            集合近点 NPC（cm）
            <em className="hint">阈值 ≤ {NPC_LIMIT_CM}cm</em>
          </span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={state.npc}
            disabled={disabled}
            placeholder="如 6"
            onChange={(e) => set("npc", e.target.value)}
          />
        </label>
      </div>

      {allFilled && (
        <div className={`check-strip ${failed.length ? "is-fail" : "is-pass"}`}>
          {failed.length === 0 ? (
            <span>✓ 调节幅度与集合近点均达标，确认后可直接排课</span>
          ) : (
            failed.map((f) => <span key={f.code}>⚠ {f.message}，进入训练待复核</span>)
          )}
        </div>
      )}

      {showPlan && (
        <label className="field plan-field">
          <span>
            训练方案（复核必填，未填不可排课）
            {failed.some((f) => f.code === "AMP_LOW" || f.code === "NPC_FAR") && (
              <em className="hint">可选用模板后修改</em>
            )}
          </span>
          <textarea
            rows={3}
            value={state.trainingPlan}
            disabled={disabled}
            placeholder="如：翻转拍 ±2.00D，每日 2 组，每组 20 周期，4 周复评"
            onChange={(e) => set("trainingPlan", e.target.value)}
          />
          <div className="template-row">
            {TRAINING_PLAN_TEMPLATES.map((tpl) => (
              <button
                type="button"
                key={tpl}
                className="chip-btn"
                disabled={disabled}
                onClick={() => set("trainingPlan", tpl)}
              >
                {tpl.split("：")[0]}
              </button>
            ))}
          </div>
        </label>
      )}
    </div>
  );
}
