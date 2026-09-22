// 数据层：ID 生成
// EV- 评估编号；BK- 排课编号

let counter = 0;

export function uid(prefix: string): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}${rand}${counter}`;
}

/** 评估编号人类可读形式 EV-0001（注册时可指定） */
let assessmentSeq = 100;
export function nextAssessmentNo(): string {
  assessmentSeq += 1;
  return `EV-${String(assessmentSeq).padStart(4, "0")}`;
}

/** 用已有链同步序号，避免与历史编号冲突 */
export function seedAssessmentSeq(existing: string[]): void {
  existing.forEach((id) => {
    const m = id.match(/^EV-(\d+)$/);
    if (m) assessmentSeq = Math.max(assessmentSeq, Number(m[1]));
  });
}
