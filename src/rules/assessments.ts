// ===== 规则层：评估生命周期（纯函数式状态迁移） =====
import type {
  AppState,
  Assessment,
  AssessmentStatus,
  Measurements,
  Patient,
} from "../data/types";
import { evaluateMeasurements, findPatient } from "./clinical";

export interface RuleResult {
  state: AppState;
  ok: boolean;
  error?: string;
}

const ok = (state: AppState): RuleResult => ({ state, ok: true });
const fail = (state: AppState, error: string): RuleResult => ({ state, ok: false, error });

export function nextId(state: AppState, prefix: string): string {
  state.seq += 1;
  return `${prefix}-${String(state.seq).padStart(3, "0")}`;
}

function simpleClone(state: AppState): AppState {
  return {
    patients: [...state.patients],
    assessments: state.assessments.map((a) => ({
      ...a,
      measurements: { ...a.measurements },
    })),
    slots: [...state.slots],
    bookings: state.bookings.map((b) => ({ ...b })),
    seq: state.seq,
  };
}

export function getAssessment(state: AppState, id: string): Assessment | undefined {
  return state.assessments.find((a) => a.id === id);
}

export function getPatient(state: AppState, patientId: string): Patient | undefined {
  return findPatient(state.patients, patientId);
}

function validateMeasurements(input: Measurements): string | null {
  if (!Number.isFinite(input.amplitude) || input.amplitude <= 0) {
    return "调节幅度须为大于 0 的数字（D）";
  }
  if (!Number.isFinite(input.npc) || input.npc <= 0) {
    return "集合近点须为大于 0 的数字（cm）";
  }
  if (input.distancePhoria.direction !== "ortho" && input.distancePhoria.magnitude < 0) {
    return "远距隐斜度数不能为负";
  }
  if (input.nearPhoria.direction !== "ortho" && input.nearPhoria.magnitude < 0) {
    return "近距隐斜度数不能为负";
  }
  return null;
}

export interface CreateAssessmentInput {
  patientId: string;
  measuredAt: string;
  measurements: Measurements;
  trainingPlan?: string;
}

/** 登记评估：一律先进「待确认」，确认后才冻结 */
export function createAssessment(
  state: AppState,
  input: CreateAssessmentInput,
  now = Date.now(),
): RuleResult {
  const patient = getPatient(state, input.patientId);
  if (!patient) return fail(state, "请选择患者");
  if (!input.measuredAt) return fail(state, "请选择检查日期");
  const invalid = validateMeasurements(input.measurements);
  if (invalid) return fail(state, invalid);

  const next = simpleClone(state);
  const id = nextId(next, "A");
  next.assessments.push({
    id,
    chainId: id,
    version: 1,
    patientId: input.patientId,
    measuredAt: input.measuredAt,
    createdAt: now,
    status: "draft",
    measurements: { ...input.measurements },
    trainingPlan: input.trainingPlan?.trim() || undefined,
  });
  return ok(next);
}

/** 新增患者后直接登记评估（原子操作） */
export function addPatient(
  state: AppState,
  input: { name: string; age: number },
): RuleResult {
  if (!input.name.trim()) return fail(state, "请填写患者姓名");
  if (!Number.isInteger(input.age) || input.age <= 0 || input.age > 120) {
    return fail(state, "年龄须为 1–120 的整数");
  }
  const next = simpleClone(state);
  const id = nextId(next, "P");
  next.patients.push({ id, name: input.name.trim(), age: input.age });
  return ok(next);
}

/** 待确认版本可直接改检查值 */
export function updateDraft(
  state: AppState,
  id: string,
  patch: Partial<Omit<Assessment, "id" | "chainId" | "version">>,
): RuleResult {
  const current = getAssessment(state, id);
  if (!current) return fail(state, "评估不存在");
  if (current.status !== "draft") return fail(state, "已确认评估不可直接修改，请走更正流程");

  if (patch.measurements) {
    const invalid = validateMeasurements(patch.measurements);
    if (invalid) return fail(state, invalid);
  }
  const next = simpleClone(state);
  const target = next.assessments.find((a) => a.id === id)!;
  Object.assign(target, patch);
  if (patch.measurements) target.measurements = { ...patch.measurements };
  return ok(next);
}

export function deleteDraft(state: AppState, id: string): RuleResult {
  const current = getAssessment(state, id);
  if (!current) return fail(state, "评估不存在");
  if (current.status !== "draft") return fail(state, "已确认评估不可删除，只能更正");
  const next = simpleClone(state);
  next.assessments = next.assessments.filter((a) => a.id !== id);
  return ok(next);
}

/** 确认评估：冻结检查值，按规则分流「合格 / 训练待复核」 */
export function confirmAssessment(state: AppState, id: string, now = Date.now()): RuleResult {
  const current = getAssessment(state, id);
  if (!current) return fail(state, "评估不存在");
  if (current.status !== "draft") return fail(state, "只有待确认评估可以确认");

  const patient = getPatient(state, current.patientId);
  if (!patient) return fail(state, "患者不存在");

  const next = simpleClone(state);
  const target = next.assessments.find((a) => a.id === id)!;
  const flags = evaluateMeasurements(target.measurements, patient.age);
  target.status = flags.abnormal ? "review" : "passed";
  target.confirmedAt = now;
  return ok(next);
}

/** 训练待复核：填写训练方案后进入待排课 */
export function saveTrainingPlan(state: AppState, id: string, plan: string): RuleResult {
  const trimmed = plan.trim();
  if (!trimmed) return fail(state, "训练方案必填后才可排课");
  const current = getAssessment(state, id);
  if (!current) return fail(state, "评估不存在");
  if (current.status !== "review" && current.status !== "ready") {
    return fail(state, "只有训练待复核 / 待排课的评估可维护训练方案");
  }
  const next = simpleClone(state);
  const target = next.assessments.find((a) => a.id === id)!;
  target.trainingPlan = trimmed;
  target.status = "ready";
  return ok(next);
}

/**
 * 更正已确认评估：
 * - 旧版本冻结、标记 superseded 并保留旧值与原因链；
 * - 新版本（chainId 相同、version+1）为「待确认」，携带旧检查值与方案供修改；
 * - 旧版本若已排课，先释放原训练位时段（级联删除占课）。
 */
export function correctAssessment(
  state: AppState,
  id: string,
  reason: string,
  now = Date.now(),
): RuleResult {
  const trimmedReason = reason.trim();
  if (!trimmedReason) return fail(state, "更正必须填写原因");
  const current = getAssessment(state, id);
  if (!current) return fail(state, "评估不存在");
  if (!isLatestVersion(state, current)) {
    return fail(state, "该版本已被更正，只能更正最新版本");
  }
  if (current.status === "draft" || current.status === "superseded") {
    return fail(state, "只能更正已确认的评估");
  }

  const next = simpleClone(state);
  const old = next.assessments.find((a) => a.id === id)!;
  const newId = nextId(next, "A");

  // 已排课：先释放原时段
  if (old.bookingId) {
    next.bookings = next.bookings.filter((b) => b.id !== old.bookingId);
    old.bookingId = undefined;
  }
  old.status = "superseded";
  old.supersededById = newId;
  old.supersededAt = now;

  const newVersion: Assessment = {
    id: newId,
    chainId: old.chainId,
    version: old.version + 1,
    patientId: old.patientId,
    measuredAt: old.measuredAt,
    createdAt: now,
    status: "draft",
    measurements: { ...old.measurements },
    trainingPlan: old.trainingPlan,
    reason: trimmedReason,
  };
  next.assessments.push(newVersion);
  return ok(next);
}

export function isLatestVersion(state: AppState, assessment: Assessment): boolean {
  return !state.assessments.some(
    (a) => a.chainId === assessment.chainId && a.version > assessment.version,
  );
}

/**
 * 刷新一致性修复（reconcile）：
 * 每次加载/动作后重放不变量，使评估、排课、占用、版本链一致。
 * - 有 supersededById → superseded；
 * - 已确认 + 检查值正常 → passed（不占课）；
 * - 已确认 + 异常 + 无方案 → review；
 * - 异常 + 有方案 + 有效占课 → booked；
 * - 异常 + 有方案 + 无占课 → ready；
 * - 同一时段重复占课保留最早一条；悬空占课清除。
 */
export function reconcile(state: AppState): AppState {
  const next = simpleClone(state);

  // 有效占课：评估 / 时段存在，且为同链最新版本
  const validAssessments = new Map(next.assessments.map((a) => [a.id, a]));
  const validSlots = new Set(next.slots.map((s) => s.id));

  let bookings = next.bookings.filter((b) => {
    const a = validAssessments.get(b.assessmentId);
    return a && validSlots.has(b.slotId) && isLatestVersion(next, a);
  });

  // 同一时段最多一条占课：createdAt 最早者保留
  const bySlot = new Map<string, typeof bookings>();
  bookings.forEach((b) => {
    const list = bySlot.get(b.slotId) ?? [];
    list.push(b);
    bySlot.set(b.slotId, list);
  });
  bookings = [...bySlot.values()]
    .map((list) =>
      [...list].sort((x, y) =>
        x.createdAt === y.createdAt ? x.id.localeCompare(y.id) : x.createdAt - y.createdAt,
      )[0],
    )
    .sort((x, y) => x.createdAt - y.createdAt);

  const bookingByAssessment = new Map(bookings.map((b) => [b.assessmentId, b]));

  next.assessments.forEach((a) => {
    const booking = bookingByAssessment.get(a.id);
    a.bookingId = booking?.id;

    if (a.supersededById) {
      a.status = "superseded";
      a.bookingId = undefined;
      return;
    }
    // 未确认（无 confirmedAt）一律待确认，不参与分流、不持占课
    if (!a.confirmedAt) {
      a.status = "draft";
      a.bookingId = undefined;
      return;
    }

    const patient = findPatient(next.patients, a.patientId);
    if (!patient) return;
    const flags = evaluateMeasurements(a.measurements, patient.age);

    if (!flags.abnormal) {
      a.status = "passed";
      a.bookingId = undefined;
      return;
    }
    if (!a.trainingPlan?.trim()) {
      a.status = "review";
      a.bookingId = undefined;
      return;
    }
    a.status = booking ? "booked" : "ready";
  });

  // 清除与评估状态不一致的占课
  const keep = new Set(
    next.assessments.filter((a) => a.status === "booked").map((a) => a.bookingId),
  );
  bookings = bookings.filter((b) => keep.has(b.id));
  next.bookings = bookings;
  return next;
}

/** 计算确认后应处状态（UI 预判） */
export function previewStatus(
  state: AppState,
  assessment: Assessment,
): AssessmentStatus {
  const patient = getPatient(state, assessment.patientId);
  if (!patient) return assessment.status;
  const flags = evaluateMeasurements(assessment.measurements, patient.age);
  if (!flags.abnormal) return "passed";
  return assessment.trainingPlan?.trim() ? "ready" : "review";
}
