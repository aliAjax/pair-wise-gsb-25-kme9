// 状态机端到端测试：直接驱动 reducer，覆盖确认冻结 / 冲突占用 / 更正释放 / 刷新一致性
import { reducer } from "../src/state/store";
import type { Action } from "../src/state/store";
import { buildSeed } from "../src/domain/seed";
import type { AppData, ExamValues } from "../src/domain/types";
import { activeBookingsForVersion, currentVersion, latestVersion, summarizeChain } from "../src/rules/versionRules";
import { checkBooking } from "../src/rules/bookingRules";
import { addDaysISO, todayISO } from "../src/domain/dates";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (!cond) {
    failures++;
    console.error(`✗ ${name} ${detail}`);
  } else {
    console.log(`✓ ${name}`);
  }
}

/** 安全派发：规则不满足时 reducer 抛错，返回 { state, error } */
function run(initial: AppData, action: Action): { state: AppData; error: string | null } {
  try {
    return { state: reducer(initial, action), error: null };
  } catch (e) {
    return { state: initial, error: e instanceof Error ? e.message : String(e) };
  }
}

const today = todayISO();
let state = buildSeed(today);

// ---------- A. 登记与确认冻结 ----------
const passValues: ExamValues = {
  distancePhoria: { value: 2, direction: "exo" },
  nearPhoria: { value: 8, direction: "exo" },
  amplitude: 13,
  npc: 7,
};

// A1 不填姓名拒绝登记
let r = run(state, { type: "REGISTER", id: "EV-1001", input: { patientName: "  ", patientAge: 12, values: passValues, trainingPlan: "" } });
check("A1 姓名为空拒绝登记", r.error !== null);

// A2 正常登记 + 直接确认
r = run(state, { type: "REGISTER", id: "EV-1001", andConfirm: true, input: { patientName: "测试甲", patientAge: 12, values: passValues, trainingPlan: "" } });
check("A2 登记并确认无报错", r.error === null, r.error ?? "");
state = r.state;
{
  const chain = state.chains.find((c) => c.assessmentId === "EV-1001")!;
  check("A2 新评估编号正确且已冻结", currentVersion(chain)?.status === "confirmed");
  check("A2 版本号为 v1", currentVersion(chain)?.versionNo === 1);
}

// A3 冻结后无法再次确认（幂等拒绝）
r = run(state, { type: "CONFIRM", assessmentId: "EV-1001" });
check("A3 已冻结评估不能重复确认", r.error !== null);

// ---------- B. 待复核与方案门槛 ----------
const badValues: ExamValues = { ...passValues, amplitude: 9, npc: 13 }; // 12 岁下限 12，NPC>10

// B1 不达标 + 无方案：不能确认
r = run(state, { type: "REGISTER", id: "EV-1002", input: { patientName: "测试乙", patientAge: 12, values: badValues, trainingPlan: "" } });
check("B1 不达标可先存草稿", r.error === null);
state = r.state;
r = run(state, { type: "CONFIRM", assessmentId: "EV-1002" });
check("B1 无训练方案禁止确认", r.error !== null && r.error.includes("训练方案"));

// B2 草稿期补方案后可确认
r = run(state, {
  type: "UPDATE_DRAFT",
  assessmentId: "EV-1002",
  patch: { trainingPlan: "调节推进训练：每日 1 次，每次 15 分钟，4 周复评" },
});
check("B2 草稿可更新方案", r.error === null);
state = r.state;
r = run(state, { type: "CONFIRM", assessmentId: "EV-1002" });
check("B2 补齐方案后确认成功", r.error === null, r.error ?? "");
state = r.state;
{
  const chain = state.chains.find((c) => c.assessmentId === "EV-1002")!;
  check("B2 状态为 REVIEW_READY", summarizeChain(state, chain).state === "REVIEW_READY");
}

// ---------- C. 排课占用 ----------
// C1 为 EV-1001 排到今日 sta-B/p1（空格）
r = run(state, { type: "BOOK", assessmentId: "EV-1001", date: today, stationId: "sta-B", periodId: "p1", note: "" });
check("C1 空闲时段排课成功", r.error === null, r.error ?? "");
state = r.state;

// C2 同一训练位同一时段再排他人 → 拒绝（EV-1002 虽具备资格）
r = run(state, { type: "BOOK", assessmentId: "EV-1002", date: today, stationId: "sta-B", periodId: "p1", note: "" });
check("C2 同时段第二人被拒", r.error !== null && r.error.includes("占用"));

// C3 同一患者同日跨训练位 → 拒绝
r = run(state, { type: "BOOK", assessmentId: "EV-1001", date: today, stationId: "sta-C", periodId: "p4", note: "" });
check("C3 同患者同日第二节被拒", r.error !== null && r.error.includes("当日已"));

// C4 另一日可正常排
r = run(state, { type: "BOOK", assessmentId: "EV-1001", date: addDaysISO(today, 2), stationId: "sta-C", periodId: "p4", note: "" });
check("C4 他日排课成功", r.error === null, r.error ?? "");
state = r.state;

// C5 释放后同时段可立即被他人预约
const bkId = state.bookings.find((b) => b.assessmentId === "EV-1001" && b.date === today)!.bookingId;
r = run(state, { type: "CANCEL_BOOKING", bookingId: bkId });
check("C5 释放成功", r.error === null);
state = r.state;
r = run(state, { type: "BOOK", assessmentId: "EV-1002", date: today, stationId: "sta-B", periodId: "p1", note: "" });
check("C5 释放后他人可约", r.error === null, r.error ?? "");
state = r.state;

// ---------- D. 更正版本链 + 释放原时段 ----------
// EV-0004 seed 中：v1 confirmed（已排今日 sta-C/p2），v2 草稿（NPC 12）
const c4Before = state.chains.find((c) => c.assessmentId === "EV-0004")!;
check("D0 seed 中 v2 为待确认更正", latestVersion(c4Before).status === "draft");

// D1 更正草稿存在期间禁止再开更正
r = run(state, {
  type: "START_CORRECTION",
  assessmentId: "EV-0004",
  values: passValues,
  trainingPlan: "",
  reason: "x",
});
check("D1 已有更正草稿时禁止再建", r.error !== null);

// D2 无原因不能更正确认（通过新建更正场景测试原因必填）
{
  // 先取消 seed 的 v2 草稿
  let s = reducer(state, { type: "CANCEL_CORRECTION", assessmentId: "EV-0004" });
  const noReason = run(s, {
    type: "START_CORRECTION",
    assessmentId: "EV-0004",
    values: { ...passValues, npc: 12 },
    trainingPlan: "Brock 线集合训练",
    reason: "   ",
  });
  check("D2 更正原因为空被拒", noReason.error !== null && noReason.error.includes("原因"));
}

// D3 确认 seed 更正：必须先释放 v1 排的今日 sta-C/p2
{
  const v1BookingsBefore = activeBookingsForVersion(state, "EV-0004-v1");
  check("D3a 确认前 v1 有 1 节有效课时", v1BookingsBefore.length === 1 && v1BookingsBefore[0].active);

  r = run(state, { type: "CONFIRM_CORRECTION", assessmentId: "EV-0004" });
  check("D3b 确认更正成功", r.error === null, r.error ?? "");
  state = r.state;

  const chain = state.chains.find((c) => c.assessmentId === "EV-0004")!;
  const v1 = chain.versions.find((v) => v.versionNo === 1)!;
  const v2 = chain.versions.find((v) => v.versionNo === 2)!;
  check("D3c v1 置为 superseded 且旧值保留（npc=7）", v1.status === "superseded" && v1.npc === 7);
  check("D3d v2 已冻结，NPC=12，原因保留", v2.status === "confirmed" && v2.npc === 12 && v2.correctionReason.includes("配合欠佳"));
  check("D3e 当前生效版本为 v2", currentVersion(chain)?.versionNo === 2);

  const oldSlot = checkBooking(state, "EV-1001", { date: today, stationId: "sta-C", periodId: "p2" });
  check("D3f 原时段已释放可被他人预约", oldSlot === null);

  const releasedBk = state.bookings.find((b) => b.versionId === "EV-0004-v1" && b.date === today)!;
  check("D3g 旧排课记录保留且 active=false", releasedBk.active === false && !!releasedBk.releasedAt);
}

// D4 更正后新检查不达标且无方案 → 不允许确认更正
{
  const noPlan = run(state, {
    type: "START_CORRECTION",
    assessmentId: "EV-1001",
    values: badValues,
    trainingPlan: "",
    reason: "散瞳复查",
  });
  // START 允许（草稿），CONFIRM_CORRECTION 才拦方案
  check("D4a 更正可先存草稿", noPlan.error === null);
  const s2 = noPlan.state;
  const confirm = run(s2, { type: "CONFIRM_CORRECTION", assessmentId: "EV-1001" });
  check("D4b 不达标无方案时确认更正被拒", confirm.error !== null && confirm.error.includes("训练方案"));
  // 且状态未被破坏
  const chain = s2.chains.find((c) => c.assessmentId === "EV-1001")!;
  check("D4c 拒绝后 v1 仍为生效版本", currentVersion(chain)?.versionNo === 1);
}

// ---------- E. 取消更正不影响冻结版本与既有排课 ----------
{
  const before = (() => {
    const x = run(state, {
      type: "START_CORRECTION",
      assessmentId: "EV-1002",
      values: { ...badValues, npc: 9, amplitude: 11 },
      trainingPlan: "调整方案",
      reason: "复测",
    });
    return x.state;
  })();
  const bookingsBefore = before.bookings.filter((b) => b.active && b.assessmentId === "EV-1002").length;
  const after = reducer(before, { type: "CANCEL_CORRECTION", assessmentId: "EV-1002" });
  const chain = after.chains.find((c) => c.assessmentId === "EV-1002")!;
  check("E1 取消后版本链回到单版本", chain.versions.length === 1 && currentVersion(chain)?.status === "confirmed");
  const bookingsAfter = after.bookings.filter((b) => b.active && b.assessmentId === "EV-1002").length;
  check("E2 取消更正不影响既有排课", bookingsBefore === bookingsAfter);
}

// ---------- F. 「刷新一致性」：整树不变式扫描 ----------
{
  // 1) 占用唯一
  const seen = new Set<string>();
  let violation = false;
  for (const b of state.bookings.filter((x) => x.active)) {
    const k = `${b.date}|${b.stationId}|${b.periodId}`;
    if (seen.has(k)) violation = true;
    seen.add(k);
  }
  check("F1 最终状态无重复占用", !violation);

  // 2) 每条 active 排课的评估与版本都存在且版本为 confirmed
  let dangling = false;
  for (const b of state.bookings.filter((x) => x.active)) {
    const chain = state.chains.find((c) => c.assessmentId === b.assessmentId);
    const ver = chain?.versions.find((v) => v.versionId === b.versionId);
    if (!chain || !ver || ver.status !== "confirmed") dangling = true;
  }
  check("F2 active 排课均引用 confirmed 版本", !dangling);

  // 3) 每条链至多一个 draft，且 append-only（版本号连续）
  let chainBad = false;
  for (const c of state.chains) {
    if (c.versions.filter((v) => v.status === "draft").length > 1) chainBad = true;
    c.versions.forEach((v, i) => {
      if (v.versionNo !== i + 1) chainBad = true;
    });
  }
  check("F3 版本链 append-only 且至多一个草稿", !chainBad);

  // 4) JSON 可序列化（localStorage 刷新往返）
  let roundtripOk = false;
  try {
    const json = JSON.stringify(state);
    const back = JSON.parse(json) as AppData;
    roundtripOk = back.chains.length === state.chains.length && back.bookings.length === state.bookings.length;
  } catch {
    roundtripOk = false;
  }
  check("F4 序列化往返后数据一致（模拟刷新）", roundtripOk);
}

if (failures > 0) {
  console.error(`\n${failures} 项失败`);
  process.exit(1);
}
console.log("\n全部状态机端到端测试通过");
