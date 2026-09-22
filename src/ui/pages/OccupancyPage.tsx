import { useMemo } from "react";
import { SCHEDULE_DAYS, SESSIONS, STATIONS, dateKey, offsetDate } from "../../data/catalog";
import { useStore } from "../../state/store";
import { StatusBadge } from "../components/StatusBadge";
import { weekdayLabel } from "../format";

export function OccupancyPage() {
  const { state, cancelBooking } = useStore();

  const rows = useMemo(() => {
    const days = Array.from({ length: SCHEDULE_DAYS }, (_, i) =>
      dateKey(offsetDate(new Date(), i)),
    );
    return days
      .map((date) => ({
        date,
        items: state.bookings
          .map((b) => {
            const slot = state.slots.find((s) => s.id === b.slotId);
            const assessment = state.assessments.find((a) => a.id === b.assessmentId);
            const patient = state.patients.find((p) => p.id === b.patientId);
            return { booking: b, slot, assessment, patient };
          })
          .filter((r) => r.slot?.date === date)
          .sort((x, y) => {
            const sx = SESSIONS.find((s) => s.id === x.slot!.sessionId)?.startMinutes ?? 0;
            const sy = SESSIONS.find((s) => s.id === y.slot!.sessionId)?.startMinutes ?? 0;
            return sx - sy;
          }),
      }))
      .filter((d) => d.items.length > 0);
  }, [state]);

  const totalSlots = SCHEDULE_DAYS * SESSIONS.length * STATIONS.length;

  return (
    <section className="panel occupancy-panel">
      <div className="section-heading">
        <div>
          <p>占用台账</p>
          <h2>
            已排 {state.bookings.length} / {totalSlots} 个训练位时段
          </h2>
        </div>
      </div>

      {rows.length === 0 && <p className="muted-hint">当前排期内暂无占用。</p>}

      {rows.map((day) => (
        <div key={day.date} className="occ-day">
          <h3>
            {day.date}（{weekdayLabel(day.date)}）
          </h3>
          <div className="occ-list">
            {day.items.map(({ booking, slot, assessment, patient }) => {
              const session = SESSIONS.find((s) => s.id === slot!.sessionId);
              const station = STATIONS.find((s) => s.id === slot!.stationId);
              return (
                <div key={booking.id} className="occ-item">
                  <div className="occ-time">
                    <strong>{session?.label}</strong>
                    <span>{station?.name}</span>
                  </div>
                  <div className="occ-who">
                    <strong>{patient?.name}</strong>
                    <small>
                      {assessment?.chainId} v{assessment?.version} · 检查日{" "}
                      {assessment?.measuredAt}
                    </small>
                  </div>
                  <div className="occ-status">
                    {assessment && <StatusBadge status={assessment.status} />}
                    <button onClick={() => cancelBooking(booking.assessmentId)}>
                      释放时段
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
