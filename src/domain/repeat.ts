import type { Task } from "../types";
import { addDays, addMonths, diffDays, toDateStr } from "./date";

/** 重复事项的 occurrence 日期展开。最多向前看两年，避免无限循环。 */
export function expandOccurrences(task: Task, from: string, to: string, max = 400): string[] {
    if (!task.startDate) return [];
    if (!task.repeat) {
        return task.startDate >= from && task.startDate <= to ? [task.startDate] : [];
    }
    const until = task.repeat.until;
    const count = task.repeat.count && task.repeat.count > 0 ? task.repeat.count : null;
    const interval = Math.max(1, Math.floor(task.repeat.interval || 1));
    const anchor = task.startDate;
    const out: string[] = [];
    let guard = 0;

    while (guard++ < 5000) {
        const k = guard - 1;
        if (count !== null && k >= count) break;
        let d: string;
        switch (task.repeat.freq) {
            case "daily":
                d = addDays(anchor, k * interval);
                break;
            case "weekly":
                d = addDays(anchor, 7 * k * interval);
                break;
            case "monthly":
                d = addMonths(anchor, k * interval);
                break;
            case "yearly":
                d = addMonths(anchor, 12 * k * interval);
                break;
            default:
                return [];
        }
        if (until && d > until) break;
        if (d > to) break;
        if (d >= from && !task.instances?.[d]?.skipped) {
            out.push(d);
            if (out.length >= max) break;
        }
    }
    return out;
}

export function isDoneOn(task: Task, date: string | null): boolean {
    if (task.repeat && date) return !!task.instances?.[date]?.completedAt;
    return task.completedAt !== null && task.completedAt !== undefined;
}

/** 下一个未完成（或最近）的 occurrence，找不到返回 null */
export function nextOccurrence(task: Task, from: string): string | null {
    if (!task.startDate) return null;
    if (!task.repeat) return task.startDate;
    const horizon = addYears(from, 2);
    const dates = expandOccurrences(task, from, horizon, 500);
    if (dates.length) return dates[0];
    // 越过窗口后检查是否仍有未来的 occurrence（例如每周一次，两年内必然出现）
    return null;
}

export function addYears(dateStr: string, years: number): string {
    return addMonths(dateStr, 12 * years);
}

/** 当前周期内是否有未完成事项；用于列表/看板的“逾期”判断 */
export function isOverdue(task: Task, today: string): boolean {
    if (!task.startDate) return false;
    if (task.repeat) return false; // 重复事项不累计逾期，只显示当天
    return task.startDate < today && !isDoneOn(task, task.startDate);
}

export function repeatLabel(task: Task, t: (key: string, ...args: any[]) => string): string {
    if (!task.repeat) return "";
    const { freq, interval } = task.repeat;
    const base = {
        daily: t("repeatDaily"),
        weekly: t("repeatWeekly"),
        monthly: t("repeatMonthly"),
        yearly: t("repeatYearly"),
    }[freq];
    return interval > 1 ? `${base} · ${t("everyN", interval)}` : base;
}

export function nextDateLabel(task: Task, today: string, fmt: (d: string) => string): string {
    const next = nextOccurrence(task, today);
    if (!next) return "";
    const delta = diffDays(today, next);
    return delta >= 0 ? fmt(next) : "";
}

export function localDateOf(ms: number): string {
    return toDateStr(new Date(ms));
}
