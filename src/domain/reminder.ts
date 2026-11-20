import type { Settings, Task } from "../types";
import { addDays, logicalToday, toMs } from "./date";
import { expandOccurrences, isDoneOn } from "./repeat";

export interface DueEvent {
    task: Task;
    date: string;
    time: string;
    key: string;
    dueMs: number;
}

/**
 * 计算当前应该提醒的事件。
 * - 只回看最近一天，避免重启后把很久以前的事件一次性补发；
 * - 已勾选完成、已提醒过的事件跳过；
 * - 未设置具体时间的事项使用「默认提醒时间」。
 */
export function collectDueEvents(
    tasks: Task[],
    settings: Pick<Settings, "defaultReminderTime" | "dayStartTime">,
    now: Date = new Date(),
    catchUpMs = 10 * 60_000
): DueEvent[] {
    const nowMs = now.getTime();
    const today = logicalToday(settings.dayStartTime, now);
    const from = addDays(today, -1);
    const out: DueEvent[] = [];

    for (const task of tasks) {
        if (task.status === "abandoned") continue;
        if (!task.startDate) continue;
        const dates = expandOccurrences(task, from, today, 8);
        for (const date of dates) {
            if (isDoneOn(task, date)) continue;
            const time = task.startTime || settings.defaultReminderTime;
            const dueMs = toMs(date, time);
            const key = `${task.id}#${date}#${time}`;
            if (task.notified?.[key]) continue;
            if (nowMs < dueMs || nowMs - dueMs > catchUpMs) continue;
            out.push({ task, date, time, key, dueMs });
        }
    }
    return out.sort((a, b) => a.dueMs - b.dueMs);
}
