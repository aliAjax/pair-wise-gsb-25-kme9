// ===== 状态层：Provider =====
import { useCallback, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AppState, Assessment, Measurements } from "../data/types";
import { loadState, resetState } from "../data/storage";
import { reconcile } from "../rules/assessments";
import type { Store } from "./store";
import { StoreContext, applyRule, A, S } from "./store";

type Notice = { kind: "ok" | "error"; text: string } | null;

export function StoreProvider({ children }: { children: ReactNode }) {
  // 首次加载即 reconcile：刷新后评估、排课、占用、版本链一致
  const [state, setState] = useState<AppState>(() => reconcile(loadState()));
  const [notice, setNotice] = useState<Notice>(null);
  const timer = useRef<number | undefined>(undefined);

  const flash = useCallback((next: Notice) => {
    setNotice(next);
    window.clearTimeout(timer.current);
    if (next) {
      timer.current = window.setTimeout(() => setNotice(null), 3200);
    }
  }, []);

  const run = useCallback(
    (result: A.RuleResult, success: string): boolean => {
      if (!result.ok) {
        flash({ kind: "error", text: result.error ?? "操作未通过规则校验" });
        return false;
      }
      setState((prev) => applyRule(prev, result));
      flash({ kind: "ok", text: success });
      return true;
    },
    [flash],
  );

  const createAssessment = useCallback(
    (input: {
      patientId: string;
      measuredAt: string;
      measurements: Measurements;
      trainingPlan?: string;
    }) => run(A.createAssessment(state, input), "评估已登记，等待确认"),
    [state, run],
  );

  const addPatient = useCallback(
    (input: { name: string; age: number }) => {
      const result = A.addPatient(state, input);
      if (!result.ok) {
        flash({ kind: "error", text: result.error ?? "建档失败" });
        return null;
      }
      const before = new Set(state.patients.map((p) => p.id));
      const created = result.state.patients.find((p) => !before.has(p.id));
      setState((prev) => applyRule(prev, result));
      flash({ kind: "ok", text: `患者 ${input.name} 已建档` });
      return created?.id ?? null;
    },
    [state, flash],
  );

  const updateDraft = useCallback(
    (id: string, patch: Partial<Omit<Assessment, "id" | "chainId" | "version">>) =>
      run(A.updateDraft(state, id, patch), "待确认评估已更新"),
    [state, run],
  );

  const deleteDraft = useCallback(
    (id: string) => run(A.deleteDraft(state, id), "待确认评估已删除"),
    [state, run],
  );

  const confirmAssessment = useCallback(
    (id: string) => run(A.confirmAssessment(state, id), "评估已确认并冻结"),
    [state, run],
  );

  const saveTrainingPlan = useCallback(
    (id: string, plan: string) =>
      run(A.saveTrainingPlan(state, id, plan), "训练方案已保存，可进入排课"),
    [state, run],
  );

  const correctAssessment = useCallback(
    (id: string, reason: string) =>
      run(A.correctAssessment(state, id, reason), "已生成更正版本，原排课已释放"),
    [state, run],
  );

  const bookSlot = useCallback(
    (assessmentId: string, slotId: string) =>
      run(S.bookSlot(state, assessmentId, slotId), "排课成功，训练位时段已占用"),
    [state, run],
  );

  const cancelBooking = useCallback(
    (assessmentId: string) => run(S.cancelBooking(state, assessmentId), "已释放原训练位时段"),
    [state, run],
  );

  const reset = useCallback(() => {
    setState(reconcile(resetState()));
    flash({ kind: "ok", text: "已恢复演示数据" });
  }, [flash]);

  const dismissNotice = useCallback(() => flash(null), [flash]);

  const store = useMemo<Store>(
    () => ({
      state,
      notice,
      createAssessment,
      addPatient,
      updateDraft,
      deleteDraft,
      confirmAssessment,
      saveTrainingPlan,
      correctAssessment,
      bookSlot,
      cancelBooking,
      reset,
      dismissNotice,
    }),
    [
      state,
      notice,
      createAssessment,
      addPatient,
      updateDraft,
      deleteDraft,
      confirmAssessment,
      saveTrainingPlan,
      correctAssessment,
      bookSlot,
      cancelBooking,
      reset,
      dismissNotice,
    ],
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
