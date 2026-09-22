// 数据层：示例数据（用于首次加载演示，之后以 localStorage 为准）

import type { AppData, AssessmentChain, AssessmentStatus, Booking, ExamValues } from "./types";
import { addDaysISO } from "./dates";

let seq = 0;
function now(base: string, hour: number, minute = 0): string {
  return `${base}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function chain(
  id: string,
  name: string,
  age: number,
  v: ExamValues,
  plan: string,
  versionNo = 1,
  status: AssessmentStatus = "confirmed",
  dateBase: string,
  reason = ""
): AssessmentChain {
  return {
    assessmentId: id,
    patientName: name,
    patientAge: age,
    versions: [
      {
        versionId: `${id}-v${versionNo}`,
        assessmentId: id,
        versionNo,
        status,
        createdAt: now(dateBase, 9),
        confirmedAt: status === "draft" ? null : now(dateBase, 9, 15),
        trainingPlan: plan,
        correctionReason: reason,
        ...v,
      },
    ],
  };
}

/**
 * 示例说明（当前日期由运行时注入）：
 * - A001 检查通过，已排今日
 * - A002 调节不足，方案已填，已排明日
 * - A003 集合不足且未填方案，训练待复核，不可排课
 * - A004 检查通过；已确认版本 v1 + 更正草稿 v2（确认后将释放 v1 的课时）
 */
export function buildSeed(today: string): AppData {
  const tomorrow = addDaysISO(today, 1);
  const yesterday = addDaysISO(today, -1);

  const chains: AssessmentChain[] = [
    chain(
      "EV-0001",
      "林晓",
      12,
      {
        distancePhoria: { value: 1, direction: "exo" },
        nearPhoria: { value: 6, direction: "exo" },
        amplitude: 13,
        npc: 6,
      },
      "",
      1,
      "confirmed",
      yesterday
    ),
    chain(
      "EV-0002",
      "周子航",
      28,
      {
        distancePhoria: { value: 2, direction: "exo" },
        nearPhoria: { value: 10, direction: "exo" },
        amplitude: 6.5,
        npc: 8,
      },
      "翻转拍 ±2.00D：每日 2 组，每组 20 周期，4 周复评",
      1,
      "confirmed",
      yesterday
    ),
    chain(
      "EV-0003",
      "陈雨桐",
      9,
      {
        distancePhoria: { value: 0, direction: "ortho" },
        nearPhoria: { value: 12, direction: "exo" },
        amplitude: 8,
        npc: 14,
      },
      "",
      1,
      "confirmed",
      yesterday
    ),
    chain(
      "EV-0004",
      "何睦",
      34,
      {
        distancePhoria: { value: 1, direction: "eso" },
        nearPhoria: { value: 3, direction: "exo" },
        amplitude: 8,
        npc: 7,
      },
      "",
      1,
      "confirmed",
      yesterday
    ),
  ];

  // A004 的 v1 将被更正取代：追加 v2 草稿（NPC 重测 12cm，集合不足，需补方案）
  chains[3].versions.push({
    versionId: "EV-0004-v2",
    assessmentId: "EV-0004",
    versionNo: 2,
    status: "draft",
    createdAt: now(today, 8, 30),
    confirmedAt: null,
    trainingPlan: "Brock 线集合训练：每日 1 次，每次 10 分钟，3 周复评",
    correctionReason: "首次 NPC 测量配合欠佳，复查重测为 12cm",
    distancePhoria: { value: 1, direction: "eso" },
    nearPhoria: { value: 8, direction: "exo" },
    amplitude: 8,
    npc: 12,
  });

  const bookings: Booking[] = [
    {
      bookingId: `BK-${String(++seq).padStart(4, "0")}`,
      assessmentId: "EV-0001",
      versionId: "EV-0001-v1",
      patientName: "林晓",
      date: today,
      stationId: "sta-A",
      periodId: "p1",
      active: true,
      createdAt: now(yesterday, 10),
      releasedAt: null,
      note: "",
    },
    {
      bookingId: `BK-${String(++seq).padStart(4, "0")}`,
      assessmentId: "EV-0002",
      versionId: "EV-0002-v1",
      patientName: "周子航",
      date: tomorrow,
      stationId: "sta-B",
      periodId: "p3",
      active: true,
      createdAt: now(yesterday, 11),
      releasedAt: null,
      note: "",
    },
    {
      bookingId: `BK-${String(++seq).padStart(4, "0")}`,
      assessmentId: "EV-0004",
      versionId: "EV-0004-v1",
      patientName: "何睦",
      date: today,
      stationId: "sta-C",
      periodId: "p2",
      active: true,
      createdAt: now(yesterday, 14),
      releasedAt: null,
      note: "",
    },
  ];

  return { schemaVersion: 1, chains, bookings };
}
