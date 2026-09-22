// ===== 规则层：临床阈值与单项判定（纯函数） =====
import type { Measurements, Patient, Phoria } from "../data/types";

/**
 * 调节幅度年龄下限：Hofstetter 最小幅度公式 15 − 0.25 × 年龄（D）。
 * 低于该值即判定调节幅度不足。
 */
export function minimumAmplitude(age: number): number {
  return Math.max(0, round1(15 - 0.25 * age));
}

/** 集合近点（NPC）异常阈值：超过 10cm 判定集合不足 */
export const NPC_LIMIT_CM = 10;

export function amplitudeFails(amplitude: number, age: number): boolean {
  return round1(amplitude) < minimumAmplitude(age);
}

export function npcFails(npc: number): boolean {
  return npc > NPC_LIMIT_CM;
}

export interface MeasurementFlags {
  amplitudeFails: boolean;
  npcFails: boolean;
  abnormal: boolean;
  amplitudeMin: number;
}

export function evaluateMeasurements(
  measurements: Measurements,
  age: number,
): MeasurementFlags {
  const ampFails = amplitudeFails(measurements.amplitude, age);
  const npcBad = npcFails(measurements.npc);
  return {
    amplitudeFails: ampFails,
    npcFails: npcBad,
    abnormal: ampFails || npcBad,
    amplitudeMin: minimumAmplitude(age),
  };
}

export function findPatient(patients: Patient[], id: string): Patient | undefined {
  return patients.find((p) => p.id === id);
}

/** 隐斜文本，如 “外隐斜 6△”、“正位” */
export function formatPhoria(phoria: Phoria): string {
  if (phoria.direction === "ortho" || phoria.magnitude === 0) return "正位";
  const dir = phoria.direction === "exo" ? "外隐斜" : "内隐斜";
  return `${dir} ${round1(phoria.magnitude)}△`;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
