// 规则层：排课占用规则
// 纯函数，对 AppData 当前快照做判定，不修改数据

import type { AppData, Booking } from "../domain/types";
import { STATION_IDS, PERIOD_IDS } from "../domain/slots";

export interface SlotKey {
  date: string;
  stationId: string;
  periodId: string;
}

export function slotKey(k: SlotKey): string {
  return `${k.date}|${k.stationId}|${k.periodId}`;
}

export function activeBookings(data: AppData): Booking[] {
  return data.bookings.filter((b) => b.active);
}

/** 同一训练位同一时段的有效占用（可排除某条预约，改约时使用） */
export function occupantOf(
  data: AppData,
  k: SlotKey,
  excludeBookingId?: string
): Booking | undefined {
  return activeBookings(data).find(
    (b) =>
      b.date === k.date &&
      b.stationId === k.stationId &&
      b.periodId === k.periodId &&
      b.bookingId !== excludeBookingId
  );
}

export function isSlotFree(
  data: AppData,
  k: SlotKey,
  excludeBookingId?: string
): boolean {
  return !occupantOf(data, k, excludeBookingId);
}

/** 同一患者同日是否已有有效排课（跨训练位也不允许重复占用一节训练） */
export function patientBookedSameDay(
  data: AppData,
  assessmentId: string,
  date: string,
  excludeBookingId?: string
): Booking | undefined {
  return activeBookings(data).find(
    (b) =>
      b.assessmentId === assessmentId &&
      b.date === date &&
      (!excludeBookingId || b.bookingId !== excludeBookingId)
  );
}

export interface BookingBlock {
  code: "SLOT_TAKEN" | "PATIENT_DUPLICATE_DAY" | "INVALID_SLOT";
  message: string;
}

/** 排课前占用校验 */
export function checkBooking(
  data: AppData,
  assessmentId: string,
  k: SlotKey
): BookingBlock | null {
  if (!STATION_IDS.includes(k.stationId) || !PERIOD_IDS.includes(k.periodId)) {
    return { code: "INVALID_SLOT", message: "训练位或时段不存在" };
  }
  const occ = occupantOf(data, k);
  if (occ) {
    return {
      code: "SLOT_TAKEN",
      message: `该时段已被 ${occ.patientName} 占用`,
    };
  }
  const dup = patientBookedSameDay(data, assessmentId, k.date);
  if (dup) {
    return {
      code: "PATIENT_DUPLICATE_DAY",
      message: `该患者当日已在 ${dup.stationId} ${dup.periodId} 排课`,
    };
  }
  return null;
}

export function bookingsOnDate(data: AppData, date: string): Booking[] {
  return activeBookings(data)
    .filter((b) => b.date === date)
    .sort((a, b2) => a.stationId.localeCompare(b2.stationId) || a.periodId.localeCompare(b2.periodId));
}
