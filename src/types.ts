/** 事项管理 - 核心数据类型 */

export type TaskStatus = "todo" | "doing" | "done" | "abandoned";
export type Priority = "none" | "low" | "medium" | "high";
export type RepeatFreq = "daily" | "weekly" | "monthly" | "yearly";

export interface RepeatRule {
    freq: RepeatFreq;
    interval: number;
    /** 截止日期 YYYY-MM-DD */
    until: string | null;
    /** 总共重复次数（包含首次） */
    count: number | null;
}

export interface TaskInstance {
    completedAt?: number;
    skipped?: boolean;
}

export interface Task {
    id: string;
    title: string;
    note: string;
    projectId: string | null;
    status: TaskStatus;
    priority: Priority;
    /** 开始/提醒日期 YYYY-MM-DD */
    startDate: string | null;
    /** 开始/提醒时间 HH:mm */
    startTime: string | null;
    endDate: string | null;
    endTime: string | null;
    /** 提前提醒分钟数；0 表示准时 */
    reminderOffset: number;
    /** 绑定的思源块或文档 ID */
    blockId: string | null;
    docId: string | null;
    parentId: string | null;
    sort: number;
    repeat: RepeatRule | null;
    /** 非重复事项的完成时间 */
    completedAt: number | null;
    /** 完成的番茄钟专注次数 */
    pomodoroCount: number;
    /** 累计番茄钟专注分钟数 */
    pomodoroMinutes: number;
    /** 每日番茄次数：YYYY-MM-DD -> count */
    pomodoroHistory: Record<string, number>;
    /** 重复事项按“ occurrences 日期 ”记录完成状态 */
    instances: Record<string, TaskInstance>;
    /** 已发送提醒记录：key -> 时间戳 */
    notified: Record<string, number>;
    createdAt: number;
    updatedAt: number;
}

export interface Project {
    id: string;
    name: string;
    color: string;
    note: string;
    /** 项目分类，空字符串表示未分类 */
    category: string;
    /** 项目图标（emoji），空字符串使用默认图标 */
    emoji: string;
    /** 关联的文档 ID，用于在该文档下创建事项时自动归入本项目 */
    docId: string | null;
    startDate: string | null;
    endDate: string | null;
    archived: boolean;
    sort: number;
    createdAt: number;
    updatedAt: number;
}

export type AutoTaskHeadingLevel = "off" | "h5" | "h6" | "both";

export interface Settings {
    version: number;
    dockEnabled: boolean;
    notifications: boolean;
    defaultReminderTime: string;
    dayStartTime: string;
    showCompleted: boolean;
    dateHeadingLevel: number;
    autoTaskFromList: boolean;
    autoTaskHeadingLevel: AutoTaskHeadingLevel;
    calendarColorMode: "muted" | "vivid";
    privacyMode: boolean;
    weekStart: 0 | 1;
    confirmDelete: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
    version: 1,
    dockEnabled: true,
    notifications: true,
    defaultReminderTime: "08:00",
    dayStartTime: "03:00",
    showCompleted: true,
    dateHeadingLevel: 3,
    autoTaskFromList: true,
    autoTaskHeadingLevel: "off",
    calendarColorMode: "muted",
    privacyMode: false,
    weekStart: 1,
    confirmDelete: true,
};

export interface TaskItem {
    task: Task;
    /** 本次 occurrence 的日期；无日期事项为 null */
    date: string | null;
    key: string;
    done: boolean;
    overdue: boolean;
    isRepeat: boolean;
}

export const PRIORITY_WEIGHT: Record<Priority, number> = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3,
};

export const PRIORITY_COLORS: Record<Priority, string> = {
    none: "var(--b3-border-color)",
    low: "var(--b3-theme-primary-lightest)",
    medium: "var(--b3-theme-secondary)",
    high: "var(--b3-theme-error)",
};
