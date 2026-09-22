// 规则层：登记/确认/更正的输入校验
// 返回错误消息（null 表示通过），页面提交前调用；reducer 断言作为最后兜底

import type { AppData, AssessmentChain, ExamValues } from "../domain/types";
import { evaluateChecks } from "./clinicalRules";
import { currentVersion, latestVersion } from "./versionRules";

export interface DraftInput {
  patientName: string;
  patientAge: number;
  values: ExamValues;
  trainingPlan: string;
}

export function validateExamValues(v: ExamValues, age: number): string | null {
  if (!Number.isFinite(v.amplitude) || v.amplitude <= 0) return "调节幅度需为正数（D）";
  if (!Number.isFinite(v.npc) || v.npc <= 0) return "集合近点需为正数（cm）";
  if (v.npc > 60) return "集合近点异常，请核对（≤60cm）";
  if (v.distancePhoria.value < 0 || v.nearPhoria.value < 0)
    return "隐斜棱镜度不能为负数";
  if (!Number.isFinite(age) || age < 1 || age > 120) return "年龄需在 1–120 之间";
  return null;
}

export function validateRegister(input: DraftInput): string | null {
  if (!input.patientName.trim()) return "请填写患者姓名";
  const valueError = validateExamValues(input.values, input.patientAge);
  if (valueError) return valueError;
  // 登记草稿允许先不填方案，但确认时仍会拦截
  return null;
}

/** 确认（首次登记）校验 */
export function validateConfirm(chain: AssessmentChain): string | null {
  const hasDraft = chain.versions.some((v) => v.status === "draft");
  if (!hasDraft || currentVersion(chain)) return "该评估当前不是待确认状态";
  const draft = latestVersion(chain);
  const valueError = validateExamValues(draft, chain.patientAge);
  if (valueError) return valueError;
  const failed = evaluateChecks(chain.patientAge, draft);
  if (failed.length > 0 && !draft.trainingPlan.trim())
    return "调节幅度/集合近点未通过，须填写训练方案后才能确认";
  return null;
}

/** 新建/编辑更正草稿校验 */
export function validateCorrection(
  chain: AssessmentChain,
  values: ExamValues,
  plan: string,
  reason: string
): string | null {
  if (!currentVersion(chain)) return "仅已确认冻结的评估可以更正";
  if (!reason.trim()) return "更正必须填写原因（旧值会保留在版本链中）";
  const valueError = validateExamValues(values, chain.patientAge);
  if (valueError) return valueError;
  const failed = evaluateChecks(chain.patientAge, values);
  if (failed.length > 0 && !plan.trim())
    return "更正后检查未通过，须填写训练方案才可确认";
  return null;
}

/** 排课准入校验（占用冲突之外的临床与版本条件） */
export function validateSchedule(
  data: AppData,
  chain: AssessmentChain
): string | null {
  const current = currentVersion(chain);
  if (!current) return "评估尚未确认，无法排课";
  if (chain.versions.some((v) => v.status === "draft"))
    return "存在待确认的更正版本，请先完成或取消更正";
  const failed = evaluateChecks(chain.patientAge, current);
  if (failed.length > 0 && !current.trainingPlan.trim())
    return "训练待复核：须填写训练方案后才可排课";
  void data;
  return null;
}
