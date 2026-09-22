// ===== 数据层：演示种子数据 =====
// 状态字段刻意留空，统一由规则层 reconcile 派生，保证种子与规则一致。
import { buildSlots } from "./catalog";
import type { AppState, Assessment, Measurements, Patient, Phoria } from "./types";

const ph = (direction: Phoria["direction"], magnitude: number): Phoria => ({
  direction,
  magnitude,
});

export const SEED_PATIENTS: Patient[] = [
  { id: "P-001", name: "张亦晨", age: 10 },
  { id: "P-002", name: "李沐阳", age: 16 },
  { id: "P-003", name: "王思远", age: 28 },
  { id: "P-004", name: "赵雨桐", age: 12 },
  { id: "P-005", name: "陈嘉宁", age: 40 },
  { id: "P-006", name: "刘一禾", age: 9 },
];

function m(
  distance: Phoria,
  near: Phoria,
  amplitude: number,
  npc: number,
): Measurements {
  return {
    distancePhoria: distance,
    nearPhoria: near,
    amplitude,
    npc,
  };
}

interface SeedAssessment {
  id: string;
  chainId: string;
  version: number;
  patientId: string;
  measuredAt: string;
  measurements: Measurements;
  trainingPlan?: string;
  reason?: string;
  supersededById?: string;
}

// 由种子日期（今天）派生检查日
function d(offset: number): string {
  const base = new Date();
  base.setDate(base.getDate() + offset);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(
    base.getDate(),
  ).padStart(2, "0")}`;
}

export const SEED_ASSESSMENTS_RAW: SeedAssessment[] = [
  // 1) 10岁，AA 7D 异常（下限 12.5D）+ NPC 13cm 异常 → review，无方案，不可排课
  {
    id: "A-001",
    chainId: "C-001",
    version: 1,
    patientId: "P-001",
    measuredAt: d(-1),
    measurements: m(ph("ortho", 0), ph("exo", 10), 7, 13),
  },
  // 2) 16岁，AA 13D 正常 + NPC 5cm 正常 → passed
  {
    id: "A-002",
    chainId: "C-002",
    version: 1,
    patientId: "P-002",
    measuredAt: d(-2),
    measurements: m(ph("exo", 1), ph("exo", 4), 13, 5),
  },
  // 3) 28岁，AA 6D 异常（下限 8.5-0.25×28=1.5）+ NPC 12cm 异常
  //    review 且已填方案 → ready
  {
    id: "A-003",
    chainId: "C-003",
    version: 1,
    patientId: "P-003",
    measuredAt: d(-3),
    measurements: m(ph("eso", 2), ph("eso", 6), 6, 12),
    trainingPlan: "推进训练 × 20 次/组，每日 2 组；聚散球训练 10 分钟，每周 5 天，4 周后复查。",
  },
  // 4) 12岁，AA 10D 异常（下限 15-0.25×12=12D）+ NPC 11cm 异常
  //    review 且已填方案 → ready，演示已排课
  {
    id: "A-004",
    chainId: "C-004",
    version: 1,
    patientId: "P-004",
    measuredAt: d(-2),
    measurements: m(ph("exo", 2), ph("exo", 12), 10, 11),
    trainingPlan: "Brock 线追踪 10 分钟 + 集合卡训练 15 分钟，每周 4 次。",
  },
  // 5) 40岁：下限 15-0.25×40 = 5D，AA 2D 异常 + NPC 14cm 异常
  //    → review，无方案
  {
    id: "A-005",
    chainId: "C-005",
    version: 1,
    patientId: "P-005",
    measuredAt: d(-4),
    measurements: m(ph("ortho", 0), ph("eso", 4), 2, 14),
  },
  // 6) 版本链演示：P-006 v1 已确认异常且排过课，后被 v2 更正（释放原时段）
  {
    id: "A-006",
    chainId: "C-006",
    version: 1,
    patientId: "P-006",
    measuredAt: d(-6),
    measurements: m(ph("exo", 3), ph("exo", 14), 6, 12),
    trainingPlan: "调节推进 + 集合卡，每日 1 组。",
    reason: undefined,
    supersededById: "A-007",
  },
  {
    id: "A-007",
    chainId: "C-006",
    version: 2,
    patientId: "P-006",
    measuredAt: d(-5),
    measurements: m(ph("exo", 2), ph("exo", 8), 9, 9),
    trainingPlan: "维持调节推进训练，每两周随访。",
    reason: "散瞳复查后复测，调节幅度由 6D 修正为 9D，集合近点由 12cm 修正为 9cm。",
  },
];

export const SEED_BOOKINGS = [
  // A-004 占用「明天 × 10:00 × 训练位 A」；A-007（更正后重排）占用「后天 × 14:00 × B」
  { assessmentId: "A-004", day: 1, sessionIndex: 1, stationIndex: 0 },
  { assessmentId: "A-007", day: 2, sessionIndex: 3, stationIndex: 1 },
];

export function buildSeedState(): AppState {
  const slots = buildSlots();
  const now = Date.now();
  const assessments: Assessment[] = SEED_ASSESSMENTS_RAW.map((a, i) => ({
    ...a,
    createdAt: now - (SEED_ASSESSMENTS_RAW.length - i) * 1000,
    // 种子为已确认的历史评估；状态交由 reconcile 统一派生
    confirmedAt: now - (SEED_ASSESSMENTS_RAW.length - i) * 1000,
    status: "draft",
  }));
  const bookings = SEED_BOOKINGS.map((b, i) => {
    const slotId = `SL-${b.day}-${b.sessionIndex}-${b.stationIndex}`;
    const assessment = assessments.find((a) => a.id === b.assessmentId);
    return {
      id: `B-${String(i + 1).padStart(3, "0")}`,
      assessmentId: b.assessmentId,
      patientId: assessment?.patientId ?? "",
      slotId,
      createdAt: now,
    };
  });
  return {
    patients: SEED_PATIENTS,
    assessments,
    slots,
    bookings,
    seq: 100,
  };
}
