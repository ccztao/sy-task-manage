import test from "node:test";
import assert from "node:assert/strict";
import { addDays, addMonths, diffDays, logicalToday } from "../src/domain/date";
import { expandOccurrences, isDoneOn } from "../src/domain/repeat";
import { collectAll, collectToday, collectUpcoming, collectCompleted, groupItems, toggleDone } from "../src/domain/tasks";
import type { Task } from "../src/types";

function makeTask(patch: Partial<Task> = {}): Task {
    return {
        id: patch.id || "t1",
        title: "任务",
        note: "",
        projectId: null,
        status: "todo",
        priority: "none",
        startDate: "2026-01-01",
        startTime: null,
        endDate: null,
        endTime: null,
        blockId: null,
        docId: null,
        parentId: null,
        sort: 0,
        repeat: null,
        completedAt: null,
        instances: {},
        notified: {},
        createdAt: Date.UTC(2025, 11, 1),
        updatedAt: Date.UTC(2025, 11, 1),
        ...patch,
    };
}

test("date: 跨月、月末与闰年", () => {
    assert.equal(addDays("2026-02-28", 1), "2026-03-01");
    assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
    assert.equal(addMonths("2026-01-31", 2), "2026-03-31");
    assert.equal(diffDays("2026-01-01", "2026-03-01"), 59);
});

test("date: 逻辑日以 03:00 分界", () => {
    assert.equal(logicalToday("03:00", new Date(2026, 10, 15, 2, 30)), "2026-11-14");
    assert.equal(logicalToday("03:00", new Date(2026, 10, 15, 3, 0)), "2026-11-15");
    assert.equal(logicalToday("03:00", new Date(2026, 10, 15, 23, 0)), "2026-11-15");
});

test("repeat: 每日/每周/间隔/截止/次数", () => {
    const daily = makeTask({
        repeat: { freq: "daily", interval: 1, until: null, count: null },
    });
    assert.deepEqual(expandOccurrences(daily, "2026-01-01", "2026-01-05"), [
        "2026-01-01",
        "2026-01-02",
        "2026-01-03",
        "2026-01-04",
        "2026-01-05",
    ]);

    const everyTwo = makeTask({ repeat: { freq: "daily", interval: 2, until: null, count: null } });
    assert.deepEqual(expandOccurrences(everyTwo, "2026-01-01", "2026-01-10"), [
        "2026-01-01",
        "2026-01-03",
        "2026-01-05",
        "2026-01-07",
        "2026-01-09",
    ]);

    const weekly = makeTask({ repeat: { freq: "weekly", interval: 1, until: null, count: null } });
    assert.deepEqual(expandOccurrences(weekly, "2026-01-01", "2026-01-20"), [
        "2026-01-01",
        "2026-01-08",
        "2026-01-15",
    ]);

    const until = makeTask({ repeat: { freq: "daily", interval: 1, until: "2026-01-03", count: null } });
    assert.deepEqual(expandOccurrences(until, "2026-01-01", "2026-02-01"), [
        "2026-01-01",
        "2026-01-02",
        "2026-01-03",
    ]);

    const count = makeTask({ repeat: { freq: "daily", interval: 1, until: null, count: 3 } });
    assert.deepEqual(expandOccurrences(count, "2026-01-01", "2026-02-01"), [
        "2026-01-01",
        "2026-01-02",
        "2026-01-03",
    ]);
});

test("repeat: 月末日期不漂移", () => {
    const task = makeTask({ startDate: "2026-01-31", repeat: { freq: "monthly", interval: 1, until: null, count: null } });
    assert.deepEqual(expandOccurrences(task, "2026-01-01", "2026-04-30"), [
        "2026-01-31",
        "2026-02-28",
        "2026-03-31",
        "2026-04-30",
    ]);
});

test("repeat: 跳过被标记的日期，完成后不重复", () => {
    const task = makeTask({
        repeat: { freq: "daily", interval: 1, until: null, count: null },
        instances: { "2026-01-02": { skipped: true } },
    });
    assert.deepEqual(expandOccurrences(task, "2026-01-01", "2026-01-03"), ["2026-01-01", "2026-01-03"]);
    const done = toggleDone(task, "2026-01-03");
    assert.equal(isDoneOn(done, "2026-01-03"), true);
    assert.equal(isDoneOn(done, "2026-01-01"), false);
    assert.equal(done.completedAt, null);
});

test("tasks: 今日列表包含逾期，重复事项只显示当天", () => {
    const today = "2026-01-10";
    const overdue = makeTask({ id: "a", startDate: "2026-01-05" });
    const todayTask = makeTask({ id: "b", startDate: "2026-01-10" });
    const future = makeTask({ id: "c", startDate: "2026-01-11" });
    const repeat = makeTask({
        id: "d",
        startDate: "2026-01-01",
        repeat: { freq: "daily", interval: 1, until: null, count: null },
    });
    const items = collectToday([overdue, todayTask, future, repeat], today);
    assert.deepEqual(items.map(i => i.task.id).sort(), ["a", "b", "d"]);
    assert.equal(items.find(i => i.task.id === "a")!.overdue, true);
});

test("tasks: 即将、全部、已完成与分组", () => {
    const today = "2026-01-10";
    const tomorrow = makeTask({ id: "a", startDate: "2026-01-11" });
    const nextWeek = makeTask({ id: "b", startDate: "2026-01-16" });
    const later = makeTask({ id: "c", startDate: "2026-02-01" });
    const undated = makeTask({ id: "d", startDate: null });
    const done = makeTask({ id: "e", startDate: "2026-01-09", completedAt: Date.now() });
    const upcoming = collectUpcoming([tomorrow, nextWeek, later, undated, done], today);
    assert.deepEqual(upcoming.map(i => i.task.id), ["a", "b"]);

    const all = collectAll([tomorrow, nextWeek, later, undated, done], today);
    assert.deepEqual(all.map(i => i.task.id).sort(), ["a", "b", "c", "d"]);

    const groups = groupItems(all, today);
    const keys = groups.map(g => g.key);
    assert.ok(keys.includes("tomorrow"));
    assert.ok(keys.includes("week"));
    assert.ok(keys.includes("later"));
    assert.ok(keys.includes("none"));

    const completed = collectCompleted([done], today);
    assert.equal(completed.length, 1);
    assert.equal(completed[0].task.id, "e");
});

test("tasks: 无日期事项不进入今日/即将", () => {
    const undated = makeTask({ startDate: null });
    assert.equal(collectToday([undated], "2026-01-10").length, 0);
    assert.equal(collectUpcoming([undated], "2026-01-10").length, 0);
    assert.equal(collectAll([undated], "2026-01-10").length, 1);
});

test("reminder: 到点、补发窗口、已完成与去重", async () => {
    const { collectDueEvents } = await import("../src/domain/reminder");
    const now = new Date(2026, 0, 10, 9, 5, 0);
    const settings = { defaultReminderTime: "08:00", dayStartTime: "03:00" };
    const dueNow = makeTask({ id: "a", startDate: "2026-01-10", startTime: "09:00" });
    const tooEarly = makeTask({ id: "b", startDate: "2026-01-10", startTime: "09:30" });
    const done = makeTask({ id: "c", startDate: "2026-01-10", startTime: "09:00", completedAt: Date.now() });
    const notified = makeTask({
        id: "d",
        startDate: "2026-01-10",
        startTime: "09:00",
        notified: { "d#2026-01-10#09:00": Date.now() },
    });
    const allDay = makeTask({ id: "e", startDate: "2026-01-10" }); // 默认 08:00，已过 65 分钟，超出补发窗口
    const events = collectDueEvents([dueNow, tooEarly, done, notified, allDay], settings, now, 10 * 60_000);
    assert.deepEqual(events.map(e => e.task.id), ["a"]);
});

test("reminder: 全天事项在默认时间提醒", async () => {
    const { collectDueEvents } = await import("../src/domain/reminder");
    const now = new Date(2026, 0, 10, 8, 3, 0);
    const settings = { defaultReminderTime: "08:00", dayStartTime: "03:00" };
    const allDay = makeTask({ id: "a", startDate: "2026-01-10" });
    const events = collectDueEvents([allDay], settings, now, 10 * 60_000);
    assert.equal(events.length, 1);
    assert.equal(events[0].key, "a#2026-01-10#08:00");
});

test("tasks: 今天列表可选择显示今天完成的事项，并排在已完成分组", () => {
    const today = "2026-01-10";
    const pending = makeTask({ id: "a", startDate: "2026-01-10" });
    const doneToday = makeTask({ id: "b", startDate: "2026-01-10", completedAt: new Date(2026, 0, 10, 9, 0).getTime() });
    const doneOld = makeTask({ id: "c", startDate: "2026-01-09", completedAt: new Date(2026, 0, 9, 9, 0).getTime() });
    assert.deepEqual(collectToday([pending, doneToday, doneOld], today, false).map(i => i.task.id), ["a"]);
    const withDone = collectToday([pending, doneToday, doneOld], today, true);
    assert.deepEqual(withDone.map(i => i.task.id).sort(), ["a", "b"]);
    const groups = groupItems(withDone, today);
    assert.equal(groups[groups.length - 1].key, "done");
    assert.deepEqual(groups[groups.length - 1].items.map(i => i.task.id), ["b"]);
});

test("projects: 分类分组与状态", async () => {
    const { groupProjects, projectStatus } = await import("../src/domain/projects");
    const base = { color: "#3b82f6", note: "", archived: false, createdAt: 0, updatedAt: 0, sort: 0 };
    const projects = [
        { ...base, id: "1", name: "论文", category: "科研", sort: 2 },
        { ...base, id: "2", name: "读书", category: "学习", sort: 1 },
        { ...base, id: "3", name: "杂事", category: "", sort: 3 },
        { ...base, id: "4", name: "已归档", category: "学习", archived: true },
        { ...base, id: "5", name: "实验", category: "科研", sort: 1 },
    ] as any[];
    const groups = groupProjects(projects);
    assert.deepEqual(groups.map(g => g.category), ["科研", "学习", ""]);
    assert.deepEqual(groups.find(g => g.category === "科研")!.projects.map(p => p.name), ["实验", "论文"]);

    const p = { ...base, id: "p", name: "p", category: "", startDate: "2026-02-01", endDate: "2026-02-28" } as any;
    assert.equal(projectStatus(p, "2026-01-20"), "upcoming");
    assert.equal(projectStatus(p, "2026-02-10"), "active");
    assert.equal(projectStatus(p, "2026-03-01"), "ended");
    assert.equal(projectStatus({ ...p, startDate: null, endDate: null }, "2026-02-10"), "none");
});

test("projects: 已开始天数与日期范围", async () => {
    const { projectStartedDays, projectDateRange } = await import("../src/domain/projects");
    const base = { color: "#000", note: "", archived: false, createdAt: 0, updatedAt: 0, sort: 0 } as any;
    const p = { ...base, id: "p", name: "p", category: "", startDate: "2026-01-01", endDate: null };
    assert.equal(projectStartedDays(p, "2026-01-01"), 1);
    assert.equal(projectStartedDays(p, "2026-01-10"), 10);
    assert.equal(projectStartedDays(p, "2025-12-31"), null);
    assert.equal(projectStartedDays({ ...p, startDate: null }, "2026-01-01"), null);
    assert.equal(projectDateRange(p), "2026-01-01");
    assert.equal(projectDateRange({ ...p, endDate: "2026-02-01" }), "2026-01-01 → 2026-02-01");
});

test("tasks: 已放弃事项不出现在列表与提醒中", async () => {
    const today = "2026-01-10";
    const abandoned = makeTask({ id: "x", startDate: "2026-01-10", status: "abandoned" });
    const active = makeTask({ id: "y", startDate: "2026-01-10" });
    assert.deepEqual(collectToday([abandoned, active], today).map(i => i.task.id), ["y"]);
    assert.deepEqual(collectUpcoming([abandoned, active], today).map(i => i.task.id), []);
    assert.deepEqual(collectAll([abandoned, active], today).map(i => i.task.id), ["y"]);
    const { collectDueEvents } = await import("../src/domain/reminder");
    const events = collectDueEvents(
        [makeTask({ id: "z", startDate: today, startTime: "09:00", status: "abandoned" })],
        { defaultReminderTime: "08:00", dayStartTime: "03:00" },
        new Date(2026, 0, 10, 9, 2)
    );
    assert.equal(events.length, 0);
});

test("date: 从标题识别日期", async () => {
    const { parseDateFromText } = await import("../src/domain/date");
    assert.equal(parseDateFromText("2026-11-16"), "2026-11-16");
    assert.equal(parseDateFromText("## 2026-11-16 周一"), "2026-11-16");
    assert.equal(parseDateFromText("2026/1/5"), "2026-01-05");
    assert.equal(parseDateFromText("2026.11.16"), "2026-11-16");
    assert.equal(parseDateFromText("2026年11月16日"), "2026-11-16");
    assert.equal(parseDateFromText("20261116"), "2026-11-16");
    assert.equal(parseDateFromText("11月16日", "2026-01-01"), "2026-11-16");
    assert.equal(parseDateFromText("2026-02-30"), null);
    assert.equal(parseDateFromText("去宁波；"), null);
    assert.equal(parseDateFromText("T11 2026-11-16 的任务"), "2026-11-16");
});

test("projects: 根据文档查找关联项目", async () => {
    const { findProjectIdByDoc } = await import("../src/domain/projects");
    const base = { color: "#000", note: "", category: "", startDate: null, endDate: null, archived: false, createdAt: 0, updatedAt: 0 } as any;
    const projects = [
        { ...base, id: "a", name: "A", docId: null, sort: 1 },
        { ...base, id: "b", name: "B", docId: "doc-1", sort: 2 },
        { ...base, id: "c", name: "C", docId: "doc-1", sort: 1 },
        { ...base, id: "d", name: "D", docId: "doc-2", sort: 0, archived: true },
    ];
    assert.equal(findProjectIdByDoc(projects, "doc-1"), "c");
    assert.equal(findProjectIdByDoc(projects, "doc-2"), null);
    assert.equal(findProjectIdByDoc(projects, null), null);
    assert.equal(findProjectIdByDoc(projects, "missing"), null);
});
