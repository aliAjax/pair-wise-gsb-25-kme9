// ===== 状态层：React 接线（reducer + reconcile + 持久化） =====
// 规则函数全部为纯迁移，这里只负责调用、统一 reconcile、写 localStorage 与提示。
import { createContext, useContext } from "react";
import type { AppState, Assessment, Measurements, Patient } from "../data/types";
import { loadState, resetState, saveState } from "../data/storage";
import { reconcile } from "../rules/assessments";
import * as A from "../rules/assessments";
import * as S from "../rules/scheduling";

export interface Store {
  state: AppState;
  notice: { kind: "ok" | "error"; text: string } | null;
  // 评估
  createAssessment: (input: {
    patientId: string;
    measuredAt: string;
    measurements: Measurements;
    trainingPlan?: string;
  }) => boolean;
  /** 建档成功返回新患者 id，否则 null */
  addPatient: (input: { name: string; age: number }) => string | null;
  updateDraft: (
    id: string,
    patch: Partial<Omit<Assessment, "id" | "chainId" | "version">>,
  ) => boolean;
  deleteDraft: (id: string) => boolean;
  confirmAssessment: (id: string) => boolean;
  saveTrainingPlan: (id: string, plan: string) => boolean;
  correctAssessment: (id: string, reason: string) => boolean;
  // 排课
  bookSlot: (assessmentId: string, slotId: string) => boolean;
  cancelBooking: (assessmentId: string) => boolean;
  reset: () => void;
  dismissNotice: () => void;
}

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("StoreContext 缺少 Provider");
  return store;
}

/** 应用规则并统一过一遍一致性修复后持久化 */
export function applyRule(
  state: AppState,
  result: A.RuleResult,
): AppState {
  if (!result.ok) return state;
  const reconciled = reconcile(result.state);
  saveState(reconciled);
  return reconciled;
}

export { loadState, resetState, A, S };
