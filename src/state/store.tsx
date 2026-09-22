// 状态层：应用状态机
// 数据变更的唯一入口；只编排领域规则，不包含任何界面逻辑
// 关键不变式（reducer 内强制）：
//  1. 版本 append-only，confirmed 后冻结，只有「更正」能产生带原因的新版本
//  2. 同一训练位同一时段至多一条 active 排课
//  3. 更正确认（修改检查值）时先释放依据旧版本排的全部有效课时

import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import type {
  AppData,
  AssessmentChain,
  AssessmentVersion,
  Booking,
  ExamValues,
} from "../domain/types";
import { loadData, resetData, saveData } from "../domain/storage";
import { nextAssessmentNo, seedAssessmentSeq, uid } from "../domain/id";
import { evaluateChecks } from "../rules/clinicalRules";
import { checkBooking } from "../rules/bookingRules";
import {
  activeBookingsForVersion,
  currentVersion,
  getChain,
  latestVersion,
} from "../rules/versionRules";

export interface NewAssessment {
  patientName: string;
  patientAge: number;
  values: ExamValues;
  trainingPlan: string;
}

export type Action =
  | { type: "REGISTER"; input: NewAssessment; andConfirm?: boolean; id?: string }
  | {
      type: "UPDATE_DRAFT";
      assessmentId: string;
      patch: Partial<NewAssessment>;
    }
  | { type: "CONFIRM"; assessmentId: string }
  | { type: "DELETE_DRAFT"; assessmentId: string }
  | {
      type: "START_CORRECTION";
      assessmentId: string;
      values: ExamValues;
      trainingPlan: string;
      reason: string;
    }
  | {
      type: "EDIT_CORRECTION";
      assessmentId: string;
      values: ExamValues;
      trainingPlan: string;
      reason: string;
    }
  | { type: "CANCEL_CORRECTION"; assessmentId: string }
  | { type: "CONFIRM_CORRECTION"; assessmentId: string }
  | {
      type: "BOOK";
      assessmentId: string;
      date: string;
      stationId: string;
      periodId: string;
      note: string;
    }
  | { type: "CANCEL_BOOKING"; bookingId: string }
  | { type: "SET_PLAN"; assessmentId: string; plan: string }
  | { type: "RESET_SAMPLE" };

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

/** 登记即生成草稿（规则在 confirm 时复核），注册页可直接确认 */
function register(data: AppData, input: NewAssessment, andConfirm = false, id?: string): AppData {
  assert(input.patientName.trim().length > 0, "请填写患者姓名");
  assert(
    Number.isFinite(input.patientAge) && input.patientAge > 0 && input.patientAge <= 120,
    "年龄需在 1–120 之间"
  );
  assertValidValues(input.values, input.patientAge);

  const assessmentId = id ?? nextAssessmentNo();
  const ts = new Date().toISOString();
  const version: AssessmentVersion = {
    versionId: `${assessmentId}-v1`,
    assessmentId,
    versionNo: 1,
    status: "draft",
    createdAt: ts,
    confirmedAt: null,
    trainingPlan: input.trainingPlan ?? "",
    correctionReason: "",
    ...input.values,
  };
  const chain: AssessmentChain = {
    assessmentId,
    patientName: input.patientName.trim(),
    patientAge: input.patientAge,
    versions: [version],
  };
  const withChain: AppData = { ...data, chains: [chain, ...data.chains] };
  return andConfirm ? confirmVersion(withChain, assessmentId) : withChain;
}

function assertValidValues(v: ExamValues, age: number): void {
  assert(Number.isFinite(v.amplitude) && v.amplitude > 0, "调节幅度需为正数（D）");
  assert(Number.isFinite(v.npc) && v.npc > 0, "集合近点需为正数（cm）");
  assert(v.npc <= 60, "集合近点异常，请核对（≤60cm）");
  assert(v.distancePhoria.value >= 0 && v.nearPhoria.value >= 0, "隐斜棱镜度不能为负");
  assert(age >= 1, "年龄无效");
}

function updateDraft(
  data: AppData,
  assessmentId: string,
  patch: Partial<NewAssessment>
): AppData {
  const chain = getChain(data, assessmentId);
  assert(chain, "评估不存在");
  const draft = chain.versions.find((v) => v.status === "draft");
  assert(draft, "仅登记中的评估可修改");
  const merged: NewAssessment = {
    patientName: chain.patientName,
    patientAge: chain.patientAge,
    values: pickValues(draft),
    trainingPlan: draft.trainingPlan,
    ...patch,
  };
  if (patch.values) assertValidValues(merged.values, merged.patientAge);

  const nextVersions = chain.versions.map((v) =>
    v.versionId === draft.versionId
      ? { ...v, ...merged.values, trainingPlan: merged.trainingPlan }
      : v
  );
  return replaceChain(data, {
    ...chain,
    patientName: merged.patientName.trim(),
    patientAge: merged.patientAge,
    versions: nextVersions,
  });
}

function pickValues(v: AssessmentVersion): ExamValues {
  return {
    distancePhoria: v.distancePhoria,
    nearPhoria: v.nearPhoria,
    amplitude: v.amplitude,
    npc: v.npc,
  };
}

function confirmVersion(data: AppData, assessmentId: string): AppData {
  const chain = getChain(data, assessmentId);
  assert(chain, "评估不存在");
  const draft = chain.versions.find((v) => v.status === "draft");
  assert(draft && !currentVersion(chain), "仅未确认的登记草稿可确认");
  assertValidValues(pickValues(draft), chain.patientAge);
  const eligibility = evaluateChecks(chain.patientAge, draft);
  // 检查不通过时必须有训练方案才能确认进入可排课状态
  if (eligibility.length > 0) {
    assert(draft.trainingPlan.trim().length > 0, "训练待复核评估须先填写训练方案");
  }
  const confirmed: AssessmentVersion = {
    ...draft,
    status: "confirmed",
    confirmedAt: new Date().toISOString(),
  };
  return replaceChain(
    data,
    { ...chain, versions: chain.versions.map((v) => (v === draft ? confirmed : v)) }
  );
}

function startCorrection(
  data: AppData,
  assessmentId: string,
  values: ExamValues,
  trainingPlan: string,
  reason: string
): AppData {
  const chain = getChain(data, assessmentId);
  assert(chain, "评估不存在");
  const current = currentVersion(chain);
  assert(current, "仅已确认的评估可更正");
  assert(!chain.versions.some((v) => v.status === "draft"), "已有待确认的更正");
  assert(reason.trim().length > 0, "更正必须填写原因");
  assertValidValues(values, chain.patientAge);

  const base = latestVersion(chain);
  const draft: AssessmentVersion = {
    ...values,
    versionId: `${assessmentId}-v${base.versionNo + 1}`,
    assessmentId,
    versionNo: base.versionNo + 1,
    status: "draft",
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    trainingPlan,
    correctionReason: reason.trim(),
  };
  return replaceChain(data, { ...chain, versions: [...chain.versions, draft] });
}

function confirmCorrection(data: AppData, assessmentId: string): AppData {
  const chain = getChain(data, assessmentId);
  assert(chain, "评估不存在");
  const current = currentVersion(chain);
  const draft = latestVersion(chain);
  assert(current && draft.status === "draft", "更正草稿不存在");
  assert(draft.correctionReason.trim().length > 0, "更正原因不能为空");
  const failed = evaluateChecks(chain.patientAge, draft);
  if (failed.length > 0) {
    assert(draft.trainingPlan.trim().length > 0, "训练待复核评估须保留/填写训练方案");
  }

  // ① 先释放原时段：依据被取代版本排的全部有效课时
  const releaseIds = new Set(
    activeBookingsForVersion(data, current.versionId).map((b) => b.bookingId)
  );
  const releasedAt = new Date().toISOString();
  const bookings = data.bookings.map((b) =>
    releaseIds.has(b.bookingId) ? { ...b, active: false, releasedAt } : b
  );

  // ② 旧版本置为 superseded（旧值原样保留），新草稿确认冻结
  const versions = chain.versions.map((v) => {
    if (v.versionId === current.versionId) return { ...v, status: "superseded" as const };
    if (v.versionId === draft.versionId)
      return { ...v, status: "confirmed" as const, confirmedAt: releasedAt };
    return v;
  });

  return {
    ...data,
    bookings,
    chains: data.chains.map((c) =>
      c.assessmentId === assessmentId ? { ...chain, versions } : c
    ),
  };
}

function book(
  data: AppData,
  assessmentId: string,
  date: string,
  stationId: string,
  periodId: string,
  note: string
): AppData {
  const chain = getChain(data, assessmentId);
  assert(chain, "评估不存在");
  const current = currentVersion(chain);
  assert(current && !chain.versions.some((v) => v.status === "draft"), "评估当前不可排课");
  const failed = evaluateChecks(chain.patientAge, current);
  if (failed.length > 0) {
    assert(current.trainingPlan.trim().length > 0, "训练待复核评估须先填写训练方案");
  }
  const block = checkBooking(data, assessmentId, { date, stationId, periodId });
  assert(!block, block?.message ?? "时段不可用");

  const record: Booking = {
    bookingId: uid("BK"),
    assessmentId,
    versionId: current.versionId,
    patientName: chain.patientName,
    date,
    stationId,
    periodId,
    active: true,
    createdAt: new Date().toISOString(),
    releasedAt: null,
    note,
  };
  return { ...data, bookings: [...data.bookings, record] };
}

function cancelBooking(data: AppData, bookingId: string): AppData {
  return {
    ...data,
    bookings: data.bookings.map((b) =>
      b.bookingId === bookingId && b.active
        ? { ...b, active: false, releasedAt: new Date().toISOString() }
        : b
    ),
  };
}

/** 复核补录训练方案：只改已确认当前版本上的方案字段，检查值保持冻结 */
function setPlan(data: AppData, assessmentId: string, plan: string): AppData {
  assert(plan.trim().length > 0, "训练方案不能为空");
  const chain = getChain(data, assessmentId);
  assert(chain, "评估不存在");
  const current = currentVersion(chain);
  assert(current, "评估尚未确认");
  assert(!chain.versions.some((v) => v.status === "draft"), "存在待确认更正，请先处理");
  const versions = chain.versions.map((v) =>
    v.versionId === current.versionId ? { ...v, trainingPlan: plan.trim() } : v
  );
  return replaceChain(data, { ...chain, versions });
}

function replaceChain(data: AppData, chain: AssessmentChain): AppData {
  return {
    ...data,
    chains: data.chains.map((c) => (c.assessmentId === chain.assessmentId ? chain : c)),
  };
}

export function reducer(data: AppData, action: Action): AppData {
  switch (action.type) {
    case "REGISTER":
      return register(data, action.input, action.andConfirm, action.id);
    case "UPDATE_DRAFT":
      return updateDraft(data, action.assessmentId, action.patch);
    case "CONFIRM":
      return confirmVersion(data, action.assessmentId);
    case "DELETE_DRAFT": {
      const chain = getChain(data, action.assessmentId);
      assert(chain && chain.versions.every((v) => v.status === "draft"), "仅可删除未确认的登记");
      return {
        ...data,
        chains: data.chains.filter((c) => c.assessmentId !== action.assessmentId),
        bookings: data.bookings.filter((b) => b.assessmentId !== action.assessmentId),
      };
    }
    case "START_CORRECTION":
      return startCorrection(
        data,
        action.assessmentId,
        action.values,
        action.trainingPlan,
        action.reason
      );
    case "EDIT_CORRECTION": {
      const chain = getChain(data, action.assessmentId);
      assert(chain, "评估不存在");
      const draft = latestVersion(chain);
      assert(draft.status === "draft" && chain.versions.length > 1, "更正草稿不存在");
      assert(action.reason.trim().length > 0, "更正必须填写原因");
      assertValidValues(action.values, chain.patientAge);
      const next: AssessmentVersion = {
        ...draft,
        ...action.values,
        trainingPlan: action.trainingPlan,
        correctionReason: action.reason.trim(),
      };
      return replaceChain(
        data,
        { ...chain, versions: chain.versions.map((v) => (v === draft ? next : v)) }
      );
    }
    case "CANCEL_CORRECTION": {
      const chain = getChain(data, action.assessmentId);
      assert(chain, "评估不存在");
      const draft = latestVersion(chain);
      assert(draft.status === "draft" && chain.versions.length > 1, "更正草稿不存在");
      return replaceChain(
        data,
        { ...chain, versions: chain.versions.filter((v) => v.versionId !== draft.versionId) }
      );
    }
    case "CONFIRM_CORRECTION":
      return confirmCorrection(data, action.assessmentId);
    case "BOOK":
      return book(
        data,
        action.assessmentId,
        action.date,
        action.stationId,
        action.periodId,
        action.note
      );
    case "CANCEL_BOOKING":
      return cancelBooking(data, action.bookingId);
    case "SET_PLAN":
      return setPlan(data, action.assessmentId, action.plan);
    case "RESET_SAMPLE":
      return resetData();
    default:
      return data;
  }
}

interface StoreValue {
  data: AppData;
  dispatch: React.Dispatch<Action>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, dispatch] = useReducer(reducer, undefined, () => {
    const initial = loadData();
    seedAssessmentSeq(initial.chains.map((c) => c.assessmentId));
    return initial;
  });

  useEffect(() => {
    saveData(data);
  }, [data]);

  const value = useMemo(() => ({ data, dispatch }), [data]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore 必须在 StoreProvider 内使用");
  return ctx;
}
