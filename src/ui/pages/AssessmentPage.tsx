import { useMemo, useState } from "react";
import type { AssessmentStatus } from "../../data/types";
import { useStore } from "../../state/store";
import { selectChains } from "../../rules/versionChain";
import { AssessmentForm } from "../components/AssessmentForm";
import { AssessmentCard } from "../components/AssessmentCard";
import { STATUS_META } from "../format";

const FILTERS: Array<{ key: AssessmentStatus | "all"; label: string }> = [
  { key: "all", label: "全部" },
  { key: "draft", label: STATUS_META.draft.label },
  { key: "review", label: STATUS_META.review.label },
  { key: "ready", label: STATUS_META.ready.label },
  { key: "booked", label: STATUS_META.booked.label },
  { key: "passed", label: STATUS_META.passed.label },
  { key: "superseded", label: STATUS_META.superseded.label },
];

export function AssessmentPage({
  onGoSchedule,
}: {
  onGoSchedule: (assessmentId: string) => void;
}) {
  const { state } = useStore();
  const [filter, setFilter] = useState<AssessmentStatus | "all">("all");

  const chains = useMemo(() => selectChains(state.assessments), [state.assessments]);
  const visible = chains.filter((c) => filter === "all" || c.latest.status === filter);

  return (
    <div className="assessment-layout">
      <AssessmentForm />
      <section className="panel list-panel">
        <div className="section-heading">
          <div>
            <p>评估与版本链</p>
            <h2>确认后冻结 · 更正保留旧值</h2>
          </div>
        </div>
        <div className="filter-row">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={filter === f.key ? "chip active" : "chip"}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="card-list">
          {visible.length === 0 && <p className="muted-hint">没有符合筛选的评估记录。</p>}
          {visible.map((chain) => {
            const a = chain.latest;
            const patient = state.patients.find((p) => p.id === a.patientId);
            if (!patient) return null;
            return (
              <AssessmentCard
                key={a.id}
                chain={chain}
                assessment={a}
                patient={patient}
                onGoSchedule={onGoSchedule}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
