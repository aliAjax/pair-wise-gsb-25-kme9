// ===== 页面层：展示格式化 =====
import type { AssessmentStatus } from "../data/types";

export const STATUS_META: Record<
  AssessmentStatus,
  { label: string; tone: "neutral" | "ok" | "warn" | "danger" | "info" }
> = {
  draft: { label: "待确认", tone: "neutral" },
  passed: { label: "评估合格", tone: "ok" },
  review: { label: "训练待复核", tone: "warn" },
  ready: { label: "待排课", tone: "info" },
  booked: { label: "已排课", tone: "ok" },
  superseded: { label: "已更正（旧版）", tone: "neutral" },
};

export function weekdayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
