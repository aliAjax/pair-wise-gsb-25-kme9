// 规则层：双眼视功能临床判定
// 纯函数：年龄下限、集合近点阈值、训练准入
// 页面与数据层均不内置这些阈值，统一引用此处

import type { ExamValues } from "../domain/types";

/** 集合近点阈值（厘米）：超过此值判定集合不足 */
export const NPC_LIMIT_CM = 10;

/**
 * 调节幅度年龄下限（D）—— Hofstetter 最小幅度公式
 * 最小幅度 = 15 − 0.25 × 年龄
 */
export function amplitudeLowerLimit(age: number): number {
  return Math.round((15 - 0.25 * age) * 100) / 100;
}

export type CheckCode = "AMP_LOW" | "NPC_FAR";

export interface FailedCheck {
  code: CheckCode;
  /** 现场检查值 */
  actual: number;
  /** 判定标准 */
  standard: string;
  message: string;
}

/** 逐条列出未通过的检查项 */
export function evaluateChecks(age: number, v: ExamValues): FailedCheck[] {
  const failed: FailedCheck[] = [];
  const ampMin = amplitudeLowerLimit(age);
  if (v.amplitude < ampMin) {
    failed.push({
      code: "AMP_LOW",
      actual: v.amplitude,
      standard: `调节幅度 ≥ ${ampMin}D（Hofstetter 15−0.25×${age}）`,
      message: `调节幅度 ${v.amplitude}D 低于年龄下限 ${ampMin}D`,
    });
  }
  if (v.npc > NPC_LIMIT_CM) {
    failed.push({
      code: "NPC_FAR",
      actual: v.npc,
      standard: `集合近点 ≤ ${NPC_LIMIT_CM}cm`,
      message: `集合近点 ${v.npc}cm 超过 ${NPC_LIMIT_CM}cm`,
    });
  }
  return failed;
}

/**
 * 训练准入：
 * - 全部通过 → 可直接排课
 * - 任一不通过 → 只能进入「训练待复核」，须填训练方案后才可排课
 */
export function trainingEligibility(age: number, v: ExamValues, plan: string) {
  const failed = evaluateChecks(age, v);
  const needsReview = failed.length > 0;
  const hasPlan = plan.trim().length > 0;
  return {
    failed,
    needsReview,
    hasPlan,
    canSchedule: !needsReview || hasPlan,
  };
}

/** 临床状态徽标 */
export function clinicalLabel(
  age: number,
  v: ExamValues,
  plan: string
): { text: string; tone: "ok" | "warn" | "danger" } {
  const failed = evaluateChecks(age, v);
  if (failed.length === 0) return { text: "检查通过", tone: "ok" };
  if (plan.trim()) return { text: "训练待复核 · 方案已填", tone: "warn" };
  return { text: "训练待复核 · 方案待填", tone: "danger" };
}
