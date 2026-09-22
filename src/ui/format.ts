// 页面层：隐斜/检查值展示格式（纯展示，规则阈值仍在 rules 层）

import type { Phoria } from "../domain/types";

export function formatPhoria(p: Phoria): string {
  if (p.direction === "ortho" || p.value === 0) return "正位";
  const arrow = p.direction === "exo" ? "EXO" : "ESO";
  return `${p.value}△ ${arrow}`;
}

export function formatPhoriaLong(p: Phoria): string {
  if (p.direction === "ortho" || p.value === 0) return "正位（ortho）";
  const cn = p.direction === "exo" ? "外隐斜" : "内隐斜";
  return `${p.value}△ ${cn}`;
}
