// 数据层：localStorage 持久化
// 刷新后评估、排课、占用与版本链保持一致——整树原子读写

import type { AppData } from "./types";
import { buildSeed } from "./seed";
import { todayISO } from "./dates";

const STORAGE_KEY = "binocular-vision-scheduler:v1";

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      if (parsed && parsed.schemaVersion === 1 && Array.isArray(parsed.chains)) {
        return parsed;
      }
    }
  } catch {
    // 存储损坏时回落到示例数据
  }
  return buildSeed(todayISO());
}

export function saveData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 隐私模式等场景下放生存活内存即可
  }
}

export function resetData(): AppData {
  const seed = buildSeed(todayISO());
  saveData(seed);
  return seed;
}
