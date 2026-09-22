// 数据层：双眼视功能复训排程领域模型
// 仅包含类型定义与静态结构，不含业务判定与界面逻辑

/** 隐斜方向：exo 外隐斜 / eso 内隐斜 / ortho 正位 */
export type PhoriaDirection = "exo" | "eso" | "ortho";

export interface Phoria {
  /** 棱镜度 △，方向为 ortho 时记 0 */
  value: number;
  direction: PhoriaDirection;
}

/** 一次评估登记的检查值 */
export interface ExamValues {
  /** 远距离水平隐斜（棱镜度 △） */
  distancePhoria: Phoria;
  /** 近距离水平隐斜（棱镜度 △） */
  nearPhoria: Phoria;
  /** 调节幅度 AMP（屈光度 D，取双眼/较低眼） */
  amplitude: number;
  /** 集合近点 NPC（厘米 cm） */
  npc: number;
}

/** 评估生命周期状态 */
export type AssessmentStatus =
  | "draft" // 登记中，可改可删
  | "confirmed" // 已确认冻结
  | "superseded"; // 已被更正版本取代

/** 评估版本（append-only，确认后不可变） */
export interface AssessmentVersion extends ExamValues {
  versionId: string;
  /** 评估登记编号，一条评估一个 */
  assessmentId: string;
  versionNo: number;
  status: AssessmentStatus;
  createdAt: string;
  confirmedAt: string | null;
  /** 训练方案：复核不通过时必须填写后才可排课 */
  trainingPlan: string;
  /** 更正原因：v2 及以后必填，旧值原样保留在上一版本 */
  correctionReason: string;
}

/** 评估链：同一患者一次评估的版本序列 */
export interface AssessmentChain {
  assessmentId: string;
  patientName: string;
  patientAge: number;
  versions: AssessmentVersion[];
}

/** 已排课程（同一训练位同一时段至多一条 active 记录） */
export interface Booking {
  bookingId: string;
  assessmentId: string;
  /** 排课所依据的评估版本 */
  versionId: string;
  patientName: string;
  date: string; // YYYY-MM-DD
  stationId: string;
  periodId: string;
  active: boolean; // false = 修改检查值/更正时释放
  createdAt: string;
  releasedAt: string | null;
  note: string;
}

export interface AppData {
  schemaVersion: 1;
  chains: AssessmentChain[];
  bookings: Booking[];
}
