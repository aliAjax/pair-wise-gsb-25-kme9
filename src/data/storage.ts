// ===== 数据层：localStorage 持久化 =====
import { buildSeedState } from "./seed";
import type { AppState } from "./types";

const STORAGE_KEY = "bv-retraining-state-v1";

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && Array.isArray(parsed.assessments) && Array.isArray(parsed.slots)) {
        return parsed;
      }
    }
  } catch {
    // 损坏数据回退到种子
  }
  return buildSeedState();
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时静默降级为内存态
  }
}

export function resetState(): AppState {
  const seed = buildSeedState();
  saveState(seed);
  return seed;
}
