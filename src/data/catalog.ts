// ===== 数据层：训练位 / 时段目录与排期生成 =====
import type { Session, Slot, Station } from "./types";

export const STATIONS: Station[] = [
  { id: "ST-A", name: "训练位 A" },
  { id: "ST-B", name: "训练位 B" },
  { id: "ST-C", name: "训练位 C" },
];

export const SESSIONS: Session[] = [
  { id: "SE-1", label: "09:00–09:45", startMinutes: 9 * 60 },
  { id: "SE-2", label: "10:00–10:45", startMinutes: 10 * 60 },
  { id: "SE-3", label: "11:00–11:45", startMinutes: 11 * 60 },
  { id: "SE-4", label: "14:00–14:45", startMinutes: 14 * 60 },
  { id: "SE-5", label: "15:00–15:45", startMinutes: 15 * 60 },
  { id: "SE-6", label: "16:00–16:45", startMinutes: 16 * 60 },
];

export const SCHEDULE_DAYS = 7;

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function offsetDate(base: Date, offset: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  return d;
}

/** 以 base 日起生成 SCHEDULE_DAYS 天的全部训练位时段 */
export function buildSlots(base: Date = new Date()): Slot[] {
  const slots: Slot[] = [];
  for (let day = 0; day < SCHEDULE_DAYS; day++) {
    const date = dateKey(offsetDate(base, day));
    SESSIONS.forEach((session, si) => {
      STATIONS.forEach((station, ti) => {
        slots.push({
          id: `SL-${day}-${si}-${ti}`,
          date,
          sessionId: session.id,
          stationId: station.id,
        });
      });
    });
  }
  return slots;
}
