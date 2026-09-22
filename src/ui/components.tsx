// 页面层：通用展示组件——状态徽标 / 弹层 / 检查值表格

import React from "react";
import type { AssessmentVersion, ExamValues } from "../domain/types";
import { amplitudeLowerLimit, evaluateChecks } from "../rules/clinicalRules";
import { formatPhoriaLong } from "./format";

type Tone = "ok" | "warn" | "danger" | "neutral" | "info";

export function Badge({ text, tone = "neutral" }: { text: string; tone?: Tone }) {
  return <span className={`badge badge-${tone}`}>{text}</span>;
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className={`modal ${wide ? "modal-wide" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** 冻结检查值展示：远/近隐斜、AMP（含年龄下限）、NPC（含阈值） */
export function ExamValueTable({
  age,
  values,
}: {
  age: number;
  values: ExamValues | AssessmentVersion;
}) {
  const failed = evaluateChecks(age, values);
  const failSet = new Set(failed.map((f) => f.code));
  const ampMin = amplitudeLowerLimit(age);
  return (
    <table className="exam-table">
      <thead>
        <tr>
          <th>项目</th>
          <th>检查值</th>
          <th>判定标准</th>
          <th>结果</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>远距离隐斜（5m）</td>
          <td>{formatPhoriaLong(values.distancePhoria)}</td>
          <td className="muted">登记项，供视功能分析</td>
          <td><Badge text="已记录" tone="neutral" /></td>
        </tr>
        <tr>
          <td>近距离隐斜（33cm）</td>
          <td>{formatPhoriaLong(values.nearPhoria)}</td>
          <td className="muted">登记项，供视功能分析</td>
          <td><Badge text="已记录" tone="neutral" /></td>
        </tr>
        <tr className={failSet.has("AMP_LOW") ? "row-fail" : ""}>
          <td>调节幅度 AMP</td>
          <td>
            <strong>{values.amplitude}D</strong>
          </td>
          <td>≥ {ampMin}D（15−0.25×{age}）</td>
          <td>
            {failSet.has("AMP_LOW") ? (
              <Badge text="低于下限" tone="danger" />
            ) : (
              <Badge text="达标" tone="ok" />
            )}
          </td>
        </tr>
        <tr className={failSet.has("NPC_FAR") ? "row-fail" : ""}>
          <td>集合近点 NPC</td>
          <td>
            <strong>{values.npc}cm</strong>
          </td>
          <td>≤ 10cm</td>
          <td>
            {failSet.has("NPC_FAR") ? (
              <Badge text="超过 10cm" tone="danger" />
            ) : (
              <Badge text="达标" tone="ok" />
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
