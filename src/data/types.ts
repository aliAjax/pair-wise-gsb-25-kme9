// ===== 数据层：领域类型 =====
// 仅描述数据形状，不含任何规则判断与界面逻辑。

/** 隐斜方向：外隐斜 / 内隐斜 / 正位 */
export type Direction = "exo" | "eso" | "ortho";

/** 隐斜测量值，单位棱镜度 △；正位时 magnitude 为 0 */
export interface Phoria {
  direction: Direction;
  magnitude: number;
}

/** 一次双眼视功能评估的检查值 */
export interface Measurements {
  /** 远距隐斜（5m） */
  distancePhoria: Phoria;
  /** 近距隐斜（33cm） */
  nearPhoria: Phoria;
  /** 调节幅度，单位 D */
  amplitude: number;
  /** 集合近点（破裂点），单位 cm */
  npc: number;
}

/**
 * 评估生命周期：
 * draft 待确认 → passed 评估合格（无需复训）
 *              → review 训练待复核 → ready 待排课 → booked 已排课
 * 确认后任意状态更正：旧版本 superseded，新版本重新进入 draft。
 */
export type AssessmentStatus =
  | "draft"
  | "passed"
  | "review"
  | "ready"
  | "booked"
  | "superseded";

export interface Assessment {
  id: string;
  /** 同一评估历次版本共用一条链 id */
  chainId: string;
  version: number;
  patientId: string;
  /** 检查日期 yyyy-mm-dd */
  measuredAt: string;
  createdAt: number;
  confirmedAt?: number;
  status: AssessmentStatus;
  measurements: Measurements;
  /** 训练方案：异常评估必填，否则不可排课 */
  trainingPlan?: string;
  bookingId?: string;
  /** v2+ 版本必填的更正原因 */
  reason?: string;
  supersededById?: string;
  supersededAt?: number;
}

export interface Patient {
  id: string;
  name: string;
  age: number;
}

export interface Station {
  id: string;
  name: string;
}

export interface Session {
  id: string;
  label: string;
  /** 一天中的排序键（分钟） */
  startMinutes: number;
}

/** 训练位时段：某日期 × 某时段 × 某训练位 */
export interface Slot {
  id: string;
  date: string;
  sessionId: string;
  stationId: string;
}

export interface Booking {
  id: string;
  assessmentId: string;
  patientId: string;
  slotId: string;
  createdAt: number;
}

export interface AppState {
  patients: Patient[];
  assessments: Assessment[];
  slots: Slot[];
  bookings: Booking[];
  seq: number;
}
