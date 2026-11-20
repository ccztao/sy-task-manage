import type { Task, TaskItem } from "../types";
import { PRIORITY_WEIGHT } from "../types";
import { addDays, diffDays, toDateStr } from "./date";
import { expandOccurrences, isDoneOn, nextOccurrence } from "./repeat";

export type Filter = "today" | "upcoming" | "all" | "done";

export interface Group {
    key: string;
    label: string;
    items: TaskItem[];
}

function makeItem(task: Task, date: string | null, today: string): TaskItem {
    return {
        task,
        date,
        key: `${task.id}${date ? `#${date}` : ""}`,
        done: isDoneOn(task, date),
        overdue: !task.repeat && !!date && date < today && !isDoneOn(task, date),
        isRepeat: !!task.repeat,
    };
}

function compareItems(a: TaskItem, b: TaskItem): number {
    const ad = a.date || "9999-99-99";
    const bd = b.date || "9999-99-99";
    if (ad !== bd) return ad < bd ? -1 : 1;
    const at = a.task.startTime || "99:99";
    const bt = b.task.startTime || "99:99";
    if (at !== bt) return at < bt ? -1 : 1;
    const ap = PRIORITY_WEIGHT[a.task.priority] || 0;
    const bp = PRIORITY_WEIGHT[b.task.priority] || 0;
    if (ap !== bp) return bp - ap;
    return (a.task.sort || 0) - (b.task.sort || 0);
}

export function collectToday(tasks: Task[], today: string, includeCompleted = false): TaskItem[] {
    const items: TaskItem[] = [];
    for (const task of tasks) {
        if (task.status === "abandoned") continue;
        if (task.repeat) {
            if (!task.startDate) continue;
            const dates = expandOccurrences(task, today, today, 1);
            if (dates.length) items.push(makeItem(task, today, today));
            // 重复事项不累计逾期，只显示当天的 occurrence
            continue;
        }
        if (task.completedAt) {
            // 今天完成的事项可以展示在“已完成”分组里
            if (includeCompleted && toDateStr(new Date(task.completedAt)) === today) {
                items.push(makeItem(task, task.startDate, today));
            }
            continue;
        }
        if (!task.startDate) continue;
        if (task.startDate <= today) {
            items.push(makeItem(task, task.startDate, today));
        }
    }
    return items.sort(compareItems);
}

export function collectUpcoming(tasks: Task[], today: string, days = 7): TaskItem[] {
    const end = addDays(today, days);
    const items: TaskItem[] = [];
    for (const task of tasks) {
        if (task.status === "abandoned") continue;
        if (task.repeat) {
            if (!task.startDate) continue;
            const dates = expandOccurrences(task, addDays(today, 1), end, 40);
            for (const d of dates) {
                if (isDoneOn(task, d)) continue;
                items.push(makeItem(task, d, today));
            }
            continue;
        }
        if (task.completedAt) continue;
        if (task.startDate && task.startDate > today && task.startDate <= end) {
            items.push(makeItem(task, task.startDate, today));
        }
    }
    return items.sort(compareItems);
}

export function collectAll(tasks: Task[], today: string): TaskItem[] {
    const items: TaskItem[] = [];
    for (const task of tasks) {
        if (task.status === "abandoned") continue;
        if (!task.repeat && task.completedAt) continue;
        const next = nextOccurrence(task, today);
        // 已完成的历史 occurrence 不进入“全部”列表
        items.push(makeItem(task, next, today));
    }
    return items.sort(compareItems);
}

export interface CompletedItem {
    task: Task;
    date: string | null;
    completedAt: number;
}

export function collectCompleted(tasks: Task[], today: string, days = 30): CompletedItem[] {
    const from = Date.now() - days * 86400000;
    const out: CompletedItem[] = [];
    for (const task of tasks) {
        if (task.status === "abandoned") continue;
        if (task.completedAt && task.completedAt >= from && !task.repeat) {
            out.push({ task, date: task.startDate, completedAt: task.completedAt });
        }
        if (task.repeat) {
            for (const [date, inst] of Object.entries(task.instances || {})) {
                if (inst.completedAt && inst.completedAt >= from) {
                    out.push({ task, date, completedAt: inst.completedAt });
                }
            }
        }
    }
    return out.sort((a, b) => b.completedAt - a.completedAt);
}

export function groupItems(items: TaskItem[], today: string): Group[] {
    const groups: Group[] = [
        { key: "overdue", label: "逾期", items: [] },
        { key: "today", label: "今天", items: [] },
        { key: "tomorrow", label: "明天", items: [] },
        { key: "week", label: "本周", items: [] },
        { key: "later", label: "以后", items: [] },
        { key: "none", label: "无日期", items: [] },
    ];
    const map = new Map(groups.map(g => [g.key, g]));
    const doneItems: TaskItem[] = [];
    for (const item of items) {
        if (item.done) {
            doneItems.push(item);
            continue;
        }
        let key: string;
        if (!item.date) key = "none";
        else if (item.overdue) key = "overdue";
        else {
            const delta = diffDays(today, item.date);
            if (delta === 0) key = "today";
            else if (delta === 1) key = "tomorrow";
            else if (delta > 1 && delta < 7) key = "week";
            else key = "later";
        }
        map.get(key)!.items.push(item);
    }
    if (doneItems.length) groups.push({ key: "done", label: "已完成", items: doneItems });
    return groups.filter(g => g.items.length > 0);
}

export function toggleDone(task: Task, date: string | null): Task {
    if (task.repeat && date) {
        const inst = task.instances?.[date] || {};
        const instances = { ...(task.instances || {}) };
        if (inst.completedAt) {
            delete instances[date];
        } else {
            instances[date] = { ...inst, completedAt: Date.now() };
        }
        return { ...task, instances, updatedAt: Date.now() };
    }
    const done = task.completedAt !== null;
    return {
        ...task,
        completedAt: done ? null : Date.now(),
        status: done ? "todo" : "done",
        updatedAt: Date.now(),
    };
}

export function countFor(tasks: Task[], filter: Filter, today: string): number {
    if (filter === "today") return collectToday(tasks, today).filter(i => !i.done).length;
    if (filter === "upcoming") return collectUpcoming(tasks, today).length;
    if (filter === "done") return collectCompleted(tasks, today).length;
    return collectAll(tasks, today).length;
}
