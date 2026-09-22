// 页面层：复训排课
// 日期切换；3 训练位 × 4 时段网格；同一训练位同一时段只能排一人
// 点击空格为可选患者排课；已占格可查看/释放；下方当日清单与版本链一致

import { useEffect, useMemo, useState } from "react";
import { useStore } from "../state/store";
import type { AssessmentChain, Booking } from "../domain/types";
import { PERIODS, STATIONS, periodLabel, periodTime, stationName } from "../domain/slots";
import {
  bookingsOnDate,
  checkBooking,
} from "../rules/bookingRules";
import {
  canSchedule,
  currentVersion,
  summarizeChain,
} from "../rules/versionRules";
import { validateSchedule } from "../rules/validation";
import { addDaysISO, todayISO, weekdayCN } from "../domain/dates";
import { Badge, Modal } from "./components";
import { useToast } from "./Toast";

interface PageProps {
  preselectId: string | null;
  onConsumePreselect: () => void;
}

export function SchedulePage({ preselectId, onConsumePreselect }: PageProps) {
  const { data, dispatch } = useStore();
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [picker, setPicker] = useState<{ stationId: string; periodId: string } | null>(null);
  const [viewBooking, setViewBooking] = useState<Booking | null>(null);

  const dayBookings = useMemo(() => bookingsOnDate(data, date), [data, date]);
  const occupantMap = useMemo(() => {
    const m = new Map<string, Booking>();
    for (const b of dayBookings) m.set(`${b.stationId}|${b.periodId}`, b);
    return m;
  }, [dayBookings]);

  const schedulableChains = data.chains
    .map((c) => ({ chain: c, summary: summarizeChain(data, c) }))
    .filter(({ summary }) => canSchedule(summary) && !summary.draft);

  const initialPickerId = preselectId && schedulableChains.some((x) => x.chain.assessmentId === preselectId)
    ? preselectId
    : null;

  // 从评估页携带的预选只消费一次（打开/关闭弹层后清除）
  useEffect(() => {
    if (preselectId) onConsumePreselect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectId]);

  return (
    <div className="schedule-page">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">复训排课</p>
            <h2>训练位时段表 · {date} {weekdayCN(date)}</h2>
          </div>
          <DateSwitcher date={date} onChange={setDate} />
        </div>

        <div className="schedule-grid-wrap">
          <table className="schedule-grid">
            <thead>
              <tr>
                <th className="corner">时段 ＼ 训练位</th>
                {STATIONS.map((s) => (
                  <th key={s.id}>
                    <strong>{s.name}</strong>
                    <span className="th-sub">{s.desc}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERIODS.map((p) => (
                <tr key={p.id}>
                  <th className="period-cell">
                    <strong>{p.label}</strong>
                    <span className="th-sub">{p.time}</span>
                  </th>
                  {STATIONS.map((s) => {
                    const occ = occupantMap.get(`${s.id}|${p.id}`);
                    return (
                      <td key={s.id}>
                        {occ ? (
                          <button
                            className={`slot slot-taken ${occ.assessmentId === preselectId ? "slot-hint" : ""}`}
                            onClick={() => setViewBooking(occ)}
                          >
                            <strong>{occ.patientName}</strong>
                            <span>{occ.assessmentId}</span>
                            <i className="slot-ver">v{occ.versionId.split("-v")[1]}</i>
                          </button>
                        ) : (
                          <button
                            className="slot slot-free"
                            onClick={() => setPicker({ stationId: s.id, periodId: p.id })}
                          >
                            <span className="plus">＋</span>
                            <span>可排课</span>
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="grid-footnote">
          每个训练位每节时段至多 1 人；同一患者同日仅可排 1 节。点击已占格可查看并释放，释放后该格立即可被他人预约。
        </p>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">当日课时</p>
            <h2>{date} 排课清单（{dayBookings.length}）</h2>
          </div>
          <button className="primary-action" onClick={() => setPicker({ stationId: STATIONS[0].id, periodId: PERIODS[0].id })}>
            ＋ 新增排课
          </button>
        </div>
        {dayBookings.length === 0 ? (
          <p className="empty-hint big">当日暂无排课，点击网格空格安排训练</p>
        ) : (
          <div className="day-list">
            {dayBookings.map((b) => (
              <div key={b.bookingId} className="day-row">
                <div className="day-row-main">
                  <strong>{b.patientName}</strong>
                  <span>{b.assessmentId}</span>
                  <Badge text={stationName(b.stationId)} tone="info" />
                  <span>
                    {periodLabel(b.periodId)} {periodTime(b.periodId)}
                  </span>
                  <span className="muted small">依据 {b.versionId}</span>
                  {b.note && <span className="muted small">备注：{b.note}</span>}
                </div>
                <button
                  className="danger-btn"
                  onClick={() => {
                    if (window.confirm(`释放 ${b.patientName} ${date} 的该节排课？`)) {
                      dispatch({ type: "CANCEL_BOOKING", bookingId: b.bookingId });
                      toast("课时已释放，时段恢复可约");
                    }
                  }}
                >
                  释放
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {picker && (
        <BookingModal
          date={date}
          stationId={picker.stationId}
          periodId={picker.periodId}
          initialAssessmentId={initialPickerId}
          chains={schedulableChains.map((x) => x.chain)}
          blockedChains={data.chains
            .map((c) => ({ chain: c, summary: summarizeChain(data, c) }))
            .filter(({ summary }) => !canSchedule(summary))}
          onClose={() => {
            setPicker(null);
            onConsumePreselect();
          }}
          onBooked={() => {
            toast("排课成功，时段已占用");
            setPicker(null);
            onConsumePreselect();
          }}
          dispatch={dispatch}
        />
      )}

      {viewBooking && (
        <BookingDetailModal
          booking={viewBooking}
          date={date}
          onClose={() => setViewBooking(null)}
          onRelease={() => {
            dispatch({ type: "CANCEL_BOOKING", bookingId: viewBooking.bookingId });
            setViewBooking(null);
            toast("课时已释放");
          }}
        />
      )}
    </div>
  );
}

function DateSwitcher({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const today = todayISO();
  return (
    <div className="date-switcher">
      <button onClick={() => onChange(addDaysISO(date, -1))}>‹ 前一天</button>
      <input type="date" value={date} min={today} onChange={(e) => onChange(e.target.value)} />
      <button onClick={() => onChange(addDaysISO(date, 1))}>后一天 ›</button>
      <button onClick={() => onChange(today)}>今天</button>
    </div>
  );
}

function BookingModal({
  date,
  stationId,
  periodId,
  initialAssessmentId,
  chains,
  blockedChains,
  onClose,
  onBooked,
  dispatch,
}: {
  date: string;
  stationId: string;
  periodId: string;
  initialAssessmentId: string | null;
  chains: AssessmentChain[];
  blockedChains: { chain: AssessmentChain; summary: ReturnType<typeof summarizeChain> }[];
  onClose: () => void;
  onBooked: (assessmentId: string) => void;
  dispatch: ReturnType<typeof useStore>["dispatch"];
}) {
  const { data } = useStore();
  const toast = useToast();
  const [assessmentId, setAssessmentId] = useState<string>(
    initialAssessmentId ?? chains[0]?.assessmentId ?? ""
  );
  const [note, setNote] = useState("");

  const conflict = assessmentId
    ? checkBooking(data, assessmentId, { date, stationId, periodId })
    : null;

  return (
    <Modal
      title={`安排排课 · ${stationName(stationId)} / ${periodLabel(periodId)}`}
      onClose={onClose}
      footer={
        <button
          className="primary-action"
          disabled={!assessmentId || !!conflict}
          onClick={() => {
            if (!assessmentId) return;
            const chain = data.chains.find((c) => c.assessmentId === assessmentId);
            if (!chain) return;
            const ruleErr = validateSchedule(data, chain);
            if (ruleErr) {
              toast(ruleErr, "err");
              return;
            }
            const block = checkBooking(data, assessmentId, { date, stationId, periodId });
            if (block) {
              toast(block.message, "err");
              return;
            }
            dispatch({
              type: "BOOK",
              assessmentId,
              date,
              stationId,
              periodId,
              note: note.trim(),
            });
            onBooked(assessmentId);
          }}
        >
          {conflict ? "时段冲突，无法确认" : "确认排课"}
        </button>
      }
    >
      <p className="modal-meta">
        {date} {periodTime(periodId)} · 该训练位此时段当前空闲
      </p>
      <label className="field">
        <span>选择患者（仅列出已冻结且具备排课资格的评估）</span>
        {chains.length === 0 ? (
          <p className="inline-err">暂无可排课患者——请先在评估页确认评估或补齐训练方案</p>
        ) : (
          <select value={assessmentId} onChange={(e) => setAssessmentId(e.target.value)}>
            {chains.map((c) => {
              const cur = currentVersion(c)!;
              return (
                <option key={c.assessmentId} value={c.assessmentId}>
                  {c.patientName}（{c.assessmentId}，v{cur.versionNo}，AMP {cur.amplitude}D / NPC {cur.npc}cm）
                </option>
              );
            })}
          </select>
        )}
      </label>

      {assessmentId && conflict && <p className="inline-err">⚠ {conflict.message}</p>}

      {blockedChains.length > 0 && (
        <div className="blocked-list">
          <span className="muted small">以下评估不可排课：</span>
          {blockedChains.map(({ chain, summary }) => (
            <span key={chain.assessmentId} className="blocked-item">
              {chain.patientName}（
              {summary.draft
                ? "更正待确认"
                : summary.state === "REVIEW_NEED_PLAN"
                ? "训练待复核·方案待填"
                : "登记未确认"}
              ）
            </span>
          ))}
        </div>
      )}

      <label className="field">
        <span>备注（可选）</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="如：家长陪同，提前 10 分钟到" />
      </label>
    </Modal>
  );
}

function BookingDetailModal({
  booking,
  date,
  onClose,
  onRelease,
}: {
  booking: Booking;
  date: string;
  onClose: () => void;
  onRelease: () => void;
}) {
  const { data } = useStore();
  const chain = data.chains.find((c) => c.assessmentId === booking.assessmentId);
  const version = chain?.versions.find((v) => v.versionId === booking.versionId);
  const isOldVersion = chain
    ? currentVersion(chain)?.versionId !== booking.versionId
    : false;

  return (
    <Modal
      title="课时详情"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>关闭</button>
          <button className="danger-btn" onClick={onRelease}>
            释放此时段
          </button>
        </>
      }
    >
      <div className="booking-detail">
        <p>
          <strong>{booking.patientName}</strong> · {booking.assessmentId}
        </p>
        <p>
          {date} · {stationName(booking.stationId)} · {periodLabel(booking.periodId)}{" "}
          {periodTime(booking.periodId)}
        </p>
        <p className="muted small">依据评估版本：{booking.versionId}</p>
        {isOldVersion && (
          <div className="warn-strip">
            该课时依据的评估版本已被更正取代（检查值发生变化）。按规则请释放原时段，依据新版本重新排课。
          </div>
        )}
        {version && version.trainingPlan && (
          <p className="plan-line small">
            <strong>当前训练方案：</strong>
            {version.trainingPlan}
          </p>
        )}
        {booking.note && <p className="muted small">备注：{booking.note}</p>}
      </div>
    </Modal>
  );
}
