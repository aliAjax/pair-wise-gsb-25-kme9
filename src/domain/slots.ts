// 数据层：训练位与时段的静态定义
// 三个训练位 × 每日 4 个时段；同一训练位同一时段只能排一人

export interface Station {
  id: string;
  name: string;
  desc: string;
}

export interface Period {
  id: string;
  /** 显示顺序 */
  order: number;
  label: string;
  time: string;
}

export const STATIONS: Station[] = [
  { id: "sta-A", name: "训练位 A", desc: "调节训练（翻转拍/推进）" },
  { id: "sta-B", name: "训练位 B", desc: "集合散开（裂隙/ Brock 线）" },
  { id: "sta-C", name: "训练位 C", desc: "双眼协调（融像卡/矢量图）" },
];

export const PERIODS: Period[] = [
  { id: "p1", order: 0, label: "上午第 1 节", time: "09:00 - 09:45" },
  { id: "p2", order: 1, label: "上午第 2 节", time: "10:00 - 10:45" },
  { id: "p3", order: 2, label: "下午第 1 节", time: "14:00 - 14:45" },
  { id: "p4", order: 3, label: "下午第 2 节", time: "15:00 - 15:45" },
];

export const STATION_IDS = STATIONS.map((s) => s.id);
export const PERIOD_IDS = PERIODS.map((p) => p.id);

export function stationName(id: string): string {
  return STATIONS.find((s) => s.id === id)?.name ?? id;
}

export function periodLabel(id: string): string {
  return PERIODS.find((p) => p.id === id)?.label ?? id;
}

export function periodTime(id: string): string {
  return PERIODS.find((p) => p.id === id)?.time ?? "";
}

/** 复训训练方案候选模板，便于登记 */
export const TRAINING_PLAN_TEMPLATES: string[] = [
  "调节推进训练：每日 1 次，每次 15 分钟，4 周复评",
  "翻转拍 ±2.00D：每日 2 组，每组 20 周期，4 周复评",
  "Brock 线集合训练：每日 1 次，每次 10 分钟，3 周复评",
  "融像聚散卡（集合/散开）：每日 2 组，3 周复评",
];
