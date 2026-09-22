// 数据层：本地日期工具，统一 YYYY-MM-DD（按本地时区，避免 UTC 偏移）

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDaysISO(base: string, delta: number): string {
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return toISODate(dt);
}

export function weekdayCN(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return "周" + ["日", "一", "二", "三", "四", "五", "六"][new Date(y, m - 1, d).getDay()];
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}
