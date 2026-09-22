// 规则层：评估版本链规则
// 登记草稿 → 确认冻结 → 更正新建带原因版本（旧值原样保留）→ 旧版本置为 superseded
// 已排课后修改检查值：更正确认时先释放依据旧版本排的全部有效课时

import type {
  AppData,
  AssessmentChain,
  AssessmentVersion,
  Booking,
  ExamValues,
} from "../domain/types";
import { trainingEligibility } from "./clinicalRules";

export function getChain(
  data: AppData,
  assessmentId: string
): AssessmentChain | undefined {
  return data.chains.find((c) => c.assessmentId === assessmentId);
}

export function latestVersion(chain: AssessmentChain): AssessmentVersion {
  return chain.versions[chain.versions.length - 1];
}

/** 当前生效版本：最新一个已确认版本（更正草稿确认前仍以旧版本为准） */
export function currentVersion(
  chain: AssessmentChain
): AssessmentVersion | undefined {
  for (let i = chain.versions.length - 1; i >= 0; i--) {
    if (chain.versions[i].status === "confirmed") return chain.versions[i];
  }
  return undefined;
}

export function draftVersion(
  chain: AssessmentChain
): AssessmentVersion | undefined {
  return chain.versions.find((v) => v.status === "draft");
}

export function activeBookingsOf(
  data: AppData,
  assessmentId: string
): Booking[] {
  return data.bookings.filter(
    (b) => b.active && b.assessmentId === assessmentId
  );
}

/** 依据某版本排的有效课时 */
export function activeBookingsForVersion(
  data: AppData,
  versionId: string
): Booking[] {
  return data.bookings.filter((b) => b.active && b.versionId === versionId);
}

export type ScheduleState =
  | "DRAFT" // 登记中，未确认
  | "REVIEW_NEED_PLAN" // 训练待复核，方案未填，不可排课
  | "REVIEW_READY" // 训练待复核，方案已填，可排课
  | "READY" // 检查通过，可排课
  | "CORRECTION_PENDING"; // 更正草稿待确认，暂不可排课

export interface ChainSummary {
  chain: AssessmentChain;
  current: AssessmentVersion | undefined;
  draft: AssessmentVersion | undefined;
  state: ScheduleState;
  failedCodes: string[];
  booked: Booking[];
}

export function summarizeChain(
  data: AppData,
  chain: AssessmentChain
): ChainSummary {
  const draft = draftVersion(chain);
  const current = currentVersion(chain);
  const booked = activeBookingsOf(data, chain.assessmentId);

  let state: ScheduleState;
  let failedCodes: string[] = [];

  if (draft && !current) {
    state = "DRAFT";
  } else if (draft && current) {
    state = "CORRECTION_PENDING";
  } else if (current) {
    const e = trainingEligibility(
      chain.patientAge,
      current as ExamValues,
      current.trainingPlan
    );
    failedCodes = e.failed.map((f) => f.code);
    if (!e.needsReview) state = "READY";
    else if (e.hasPlan) state = "REVIEW_READY";
    else state = "REVIEW_NEED_PLAN";
  } else {
    state = "DRAFT";
  }

  return { chain, current, draft, state, failedCodes, booked };
}

/** 排课准入总闸（页面与 reducer 共用） */
export function canSchedule(summary: ChainSummary): boolean {
  return (
    (summary.state === "READY" || summary.state === "REVIEW_READY") &&
    !summary.draft
  );
}

/** 更正确认时需要释放的课时：所有依据被取代版本的有效课时 */
export function bookingsToReleaseOnCorrection(
  data: AppData,
  supersededVersionId: string
): Booking[] {
  return activeBookingsForVersion(data, supersededVersionId);
}
