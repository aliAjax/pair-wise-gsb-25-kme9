import { useMemo } from "react";
import { SCHEDULE_DAYS, SESSIONS, STATIONS, offsetDate, dateKey } from "../../data/catalog";
import { useStore, S } from "../../state/store";
import type { Slot } from "../../data/types";
import { weekdayLabel } from "../format";

export function SchedulePage({
  selectedAssessmentId,
  setSelectedAssessmentId,
}: {
  selectedAssessmentId: string | null;
  setSelectedAssessmentId: (id: string | null) => void;
}) {
  const { state, bookSlot, cancelBooking } = useStore();

  const days = useMemo(
    () => Array.from({ length: SCHEDULE_DAYS }, (_, i) => dateKey(offsetDate(new Date(), i))),
    [],
  );
  const slotsByKey = useMemo(() => {
    const map = new Map<string, Slot>();
    state.slots.forEach((s) => map.set(`${s.date}|${s.sessionId}|${s.stationId}`, s));
    return map;
  }, [state.slots]);

  const bookingMap = useMemo(() => {
    const map = new Map<string, (typeof state.bookings)[number]>();
    state.bookings.forEach((b) => map.set(b.slotId, b));
    return map;
  }, [state.bookings]);

  const readyAssessments = state.assessments.filter((a) => a.status === "ready");
  const selected = state.assessments.find((a) => a.id === selectedAssessmentId) ?? null;

  function clickSlot(slot: Slot) {
    const booking = bookingMap.get(slot.id);
    if (booking) {
      // 已占：展示占用患者，若属于当前选中评估则可取消
      const owner = state.assessments.find((a) => a.id === booking.assessmentId);
      if (owner && (selected?.id === owner.id || owner.status === "booked")) {
        if (window.confirm(`该时段已排给 ${patientName(owner.patientId)}，确认释放该时段？`)) {
          cancelBooking(owner.id);
        }
      } else {
        window.alert("该训练位时段已被占用，同一时段只能排一人。");
      }
      return;
    }
    if (!selected) {
      window.alert("请先在左侧选择一条「待排课」评估。");
      return;
    }
    if (!S.canBook(state, selected)) {
      window.alert("训练待复核：须填写训练方案才可排课。");
      return;
    }
    const p = state.patients.find((x) => x.id === selected.patientId);
    if (!window.confirm(`确认把 ${p?.name} 排到该训练位时段？`)) return;
    bookSlot(selected.id, slot.id);
  }

  function patientName(pid: string): string {
    return state.patients.find((p) => p.id === pid)?.name ?? pid;
  }

  return (
    <div className="schedule-layout">
      <aside className="panel queue-panel">
        <p className="eyebrow-sm">待排课队列</p>
        <h2>训练待复核 · 已就绪</h2>
        {readyAssessments.length === 0 && (
          <p className="muted-hint">暂无待排课评估：异常评估须先填写训练方案。</p>
        )}
        <div className="queue-list">
          {readyAssessments.map((a) => {
            const p = state.patients.find((x) => x.id === a.patientId);
            const active = selected?.id === a.id;
            return (
              <button
                key={a.id}
                className={`queue-item ${active ? "active" : ""}`}
                onClick={() => setSelectedAssessmentId(active ? null : a.id)}
              >
                <strong>{p?.name}</strong>
                <small>
                  {p?.age} 岁 · {a.measuredAt}
                </small>
                <span className="queue-chain">{a.chainId} · v{a.version}</span>
              </button>
            );
          })}
        </div>
        <div className="queue-foot">
          {selected ? (
            <p>
              当前选中：<strong>{patientName(selected.patientId)}</strong>，点击右侧空格占课
            </p>
          ) : (
            <p className="muted-hint">选中评估后点击课表空格排课；点击占用格可释放。</p>
          )}
        </div>
      </aside>

      <section className="panel grid-panel">
        <div className="section-heading">
          <div>
            <p>训练位周课表</p>
            <h2>同一训练位时段仅可排一人</h2>
          </div>
          <div className="legend">
            <span className="lg free">空闲</span>
            <span className="lg mine">当前患者</span>
            <span className="lg busy">已占用</span>
          </div>
        </div>

        <div className="table-scroll">
          <table className="schedule-table">
            <thead>
              <tr>
                <th className="time-col">时段</th>
                {days.map((day) => (
                  <th key={day}>
                    {day.slice(5)}
                    <small>{weekdayLabel(day)}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SESSIONS.map((session) =>
                STATIONS.map((station, ti) => (
                  <tr key={`${session.id}-${station.id}`}>
                    <td className="time-col">
                      <strong>{ti === 0 ? session.label : ""}</strong>
                      <small>{station.name}</small>
                    </td>
                    {days.map((day) => {
                      const slot = slotsByKey.get(`${day}|${session.id}|${station.id}`);
                      if (!slot) return <td key={day} className="cell missing" />;
                      const booking = bookingMap.get(slot.id);
                      const owner = booking
                        ? state.assessments.find((a) => a.id === booking.assessmentId)
                        : undefined;
                      const isMine = !!owner && selected?.id === owner.id;
                      const cls = booking ? (isMine ? "cell mine" : "cell busy") : "cell free";
                      return (
                        <td key={day} className={cls} onClick={() => clickSlot(slot)}>
                          {owner ? (
                            <div className="cell-inner">
                              <strong>{patientName(owner.patientId)}</strong>
                              <small>{owner.chainId} v{owner.version}</small>
                            </div>
                          ) : (
                            <span className="plus">＋</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
