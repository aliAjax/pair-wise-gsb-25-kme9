import type { AssessmentStatus } from "../../data/types";
import { STATUS_META } from "../format";

export function StatusBadge({ status }: { status: AssessmentStatus }) {
  const meta = STATUS_META[status];
  return <span className={`badge ${meta.tone}`}>{meta.label}</span>;
}
