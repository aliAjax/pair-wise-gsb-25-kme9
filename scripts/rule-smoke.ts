// 规则层/状态层不变式冒烟测试（Node 运行，不依赖 DOM；localStorage 做桩）
import { buildSeed } from "../src/domain/seed";
import { amplitudeLowerLimit, evaluateChecks, trainingEligibility } from "../src/rules/clinicalRules";
import { checkBooking } from "../src/rules/bookingRules";
import {
  activeBookingsForVersion,
  currentVersion,
  summarizeChain,
} from "../src/rules/versionRules";
import { validateSchedule } from "../src/rules/validation";
import type { Action } from "../src/state/store";
import type { ExamValues } from "../src/domain/types";
import { addDaysISO, todayISO } from "../src/domain/dates";

// reducer 直接复用源文件逻辑需要 React 上下文，这里内联一个极简驱动不现实；
// 改为把 store 的纯 reducer 抽测：通过动态 import esbuild 打包后的 bundle。
// 为保持简单，本文件仅验证纯规则函数 + 数据一致性；reducer 行为由浏览器手测覆盖。

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (!cond) {
    failures++;
    console.error(`✗ ${name} ${detail}`);
  } else {
    console.log(`✓ ${name}`);
  }
}

// 1. Hofstetter 下限
check("AMP 下限 12 岁 = 12D", amplitudeLowerLimit(12) === 12);
check("AMP 下限 28 岁 = 8D", amplitudeLowerLimit(28) === 8);
check("AMP 下限 40 岁 = 5D", amplitudeLowerLimit(40) === 5);

// 2. 检查判定
const vPass: ExamValues = {
  distancePhoria: { value: 1, direction: "exo" },
  nearPhoria: { value: 6, direction: "exo" },
  amplitude: 13,
  npc: 6,
};
check("达标检查 0 失败", evaluateChecks(12, vPass).length === 0);
const vAmpLow: ExamValues = { ...vPass, amplitude: 10 };
check("AMP 10D@12 岁判低", evaluateChecks(12, vAmpLow).some((f) => f.code === "AMP_LOW"));
const vNpcFar: ExamValues = { ...vPass, npc: 10.5 };
check("NPC 10.5cm 判超限", evaluateChecks(12, vNpcFar).some((f) => f.code === "NPC_FAR"));
check("NPC 恰好 10cm 不超限", !evaluateChecks(12, { ...vPass, npc: 10 }).some((f) => f.code === "NPC_FAR"));

// 3. 准入：未通过且无方案不可排课；有方案可排
const noPlan = trainingEligibility(12, vAmpLow, "");
check("未通过+无方案 needsReview", noPlan.needsReview && !noPlan.canSchedule);
const withPlan = trainingEligibility(12, vAmpLow, "翻转拍训练");
check("未通过+有方案 canSchedule", withPlan.canSchedule);
check("达标无需方案 canSchedule", trainingEligibility(12, vPass, "").canSchedule);

// 4. 占用规则（基于 seed）
const today = todayISO();
const seed = buildSeed(today);
check("seed 今日 sta-A/p1 被占", !!checkBooking(seed, "EV-0003", { date: today, stationId: "sta-A", periodId: "p1" }));
check("seed 今日空格可约", !checkBooking(seed, "EV-0003", { date: today, stationId: "sta-B", periodId: "p1" }));
check("同患者同日重复排课拦截", !!checkBooking(seed, "EV-0001", { date: today, stationId: "sta-B", periodId: "p3" }));
check("不同日可约", !checkBooking(seed, "EV-0001", { date: addDaysISO(today, 3), stationId: "sta-B", periodId: "p3" }));

// 5. seed 状态一致性
const c3 = seed.chains.find((c) => c.assessmentId === "EV-0003")!;
const s3 = summarizeChain(seed, c3);
check("EV-0003 待复核且缺方案", s3.state === "REVIEW_NEED_PLAN");
check("EV-0003 不可排课", validateSchedule(seed, c3) !== null);

const c2 = seed.chains.find((c) => c.assessmentId === "EV-0002")!;
const s2 = summarizeChain(seed, c2);
check("EV-0002 待复核但方案已填", s2.state === "REVIEW_READY");
check("EV-0002 可排课", validateSchedule(seed, c2) === null);

const c4 = seed.chains.find((c) => c.assessmentId === "EV-0004")!;
const s4 = summarizeChain(seed, c4);
check("EV-0004 更正待确认", s4.state === "CORRECTION_PENDING" && !!s4.draft && !!s4.current);
check("更正期间不可排课", validateSchedule(seed, c4) !== null);
const v1 = c4.versions[0];
const toRelease = activeBookingsForVersion(seed, v1.versionId);
check("EV-0004 更正确认应释放 v1 的 1 节", toRelease.length === 1 && toRelease[0].date === today);

// 6. 每个时段至多一条 active（不变式扫描）
const map = new Map<string, string>();
let dup = false;
for (const b of seed.bookings.filter((b) => b.active)) {
  const k = `${b.date}|${b.stationId}|${b.periodId}`;
  if (map.has(k)) dup = true;
  map.set(k, b.bookingId);
}
check("seed 无同一训练位同一时段重复占用", !dup);

// 7. currentVersion 只返回 confirmed
check("EV-0004 当前版本仍是 v1", currentVersion(c4)?.versionNo === 1);

void (0 as unknown as Action); // 保证类型导入不被剥离

if (failures > 0) {
  console.error(`\n${failures} 项失败`);
  process.exit(1);
}
console.log("\n全部规则冒烟测试通过");
