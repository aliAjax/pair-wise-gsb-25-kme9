// ===== 规则层：排课与占用（纯函数式状态迁移） =====
import type { AppState, Assessment, Booking, Slot } from "../data/types";
import { evaluateMeasurements, findPatient } from "./clinical";
import type { RuleResult } from "./assessments";
import { getAssessment, nextId } from "./assessments";

const ok = (state: AppState): RuleResult => ({ state, ok: true });
const fail = (state: AppState, error: string): RuleResult => ({
  state,
  ok: false,
  error,
});

/**
 * 可排课判定：异常评估（调节幅度低于年龄下限 或 集合近点超过 10cm）
 * 必须已填训练方案才允许排课；正常评估无需复训，不开放排课。
 */
export function canBook(state: AppState, assessment: Assessment): boolean {
  const patient = findPatient(state.patients, assessment.patientId);
  if (!patient || assessment.status === "draft" || assessment.status === "superseded") {
    return false;
  }
  const flags = evaluateMeasurements(assessment.measurements, patient.age);
  return flags.abnormal && !!assessment.trainingPlan?.trim();
}

export function slotOccupiedBy(state: AppState, slotId: string): Booking | undefined {
  return state.bookings.find((b) => b.slotId === slotId);
}

export function bookingForSlot(
  state: AppState,
  slotId: string,
): { booking: Booking; assessment?: Assessment } | undefined {
  const booking = slotOccupiedBy(state, slotId);
  if (!booking) return undefined;
  return { booking, assessment: getAssessment(state, booking.assessmentId) };
}

/**
 * 占课：同一训练位时段只能排一人。
 * 已排课的评估需先取消（或改检查值时自动释放原时段）。
 */
export function bookSlot(
  state: AppState,
  assessmentId: string,
  slotId: string,
  now = Date.now(),
): RuleResult {
  const assessment = getAssessment(state, assessmentId);
  if (!assessment) return fail(state, "评估不存在");
  if (!state.slots.some((s) => s.id === slotId)) return fail(state, "训练位时段不存在");
  if (!canBook(state, assessment)) {
    return fail(state, "训练待复核：须填写训练方案后才可排课");
  }
  const occupied = slotOccupiedBy(state, slotId);
  if (occupied) {
    if (occupied.assessmentId === assessmentId) return ok(state);
    return fail(state, "该训练位时段已被占用，请选择其他时段");
  }

  const next: AppState = {
    ...state,
    patients: [...state.patients],
    assessments: state.assessments.map((a) => ({
      ...a,
      measurements: { ...a.measurements },
    })),
    slots: [...state.slots],
    bookings: state.bookings.map((b) => ({ ...b })),
    seq: state.seq,
  };
  const id = nextId(next, "B");
  next.bookings.push({
    id,
    assessmentId,
    patientId: assessment.patientId,
    slotId,
    createdAt: now,
  });
  return ok(next);
}

/** 取消占课，释放训练位时段，评估回到待排课 */
export function cancelBooking(state: AppState, assessmentId: string): RuleResult {
  const assessment = getAssessment(state, assessmentId);
  if (!assessment) return fail(state, "评估不存在");
  if (!assessment.bookingId) return fail(state, "该评估未排课");

  const next: AppState = {
    ...state,
    patients: [...state.patients],
    assessments: state.assessments.map((a) => ({
      ...a,
      measurements: { ...a.measurements },
    })),
    slots: [...state.slots],
    bookings: state.bookings.map((b) => ({ ...b })),
    seq: state.seq,
  };
  next.bookings = next.bookings.filter((b) => b.assessmentId !== assessmentId);
  return ok(next);
}

/** 排课后修改检查值：先释放原时段（由更正流程调用，此处为通用释放） */
export function releaseByAssessment(state: AppState, assessmentId: string): AppState {
  return {
    ...state,
    bookings: state.bookings.filter((b) => b.assessmentId !== assessmentId),
  };
}

/** 取某评估占用的时段 */
export function slotOfAssessment(state: AppState, assessment: Assessment): Slot | undefined {
  if (!assessment.bookingId) return undefined;
  const booking = state.bookings.find((b) => b.id === assessment.bookingId);
  return booking ? state.slots.find((s) => s.id === booking.slotId) : undefined;
}
