import type { Project, Settings, Task } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { Persistence, type StorageHost } from "./storage";
import { toDateStr } from "./domain/date";
import { toggleDone } from "./domain/tasks";

const TASKS_FILE = "tasks.json";
const PROJECTS_FILE = "projects.json";
const SETTINGS_FILE = "settings.json";

export interface NewTaskInput {
    title: string;
    startDate?: string | null;
    startTime?: string | null;
    endDate?: string | null;
    endTime?: string | null;
    reminderOffset?: number;
    projectId?: string | null;
    priority?: Task["priority"];
    status?: Task["status"];
    note?: string;
    blockId?: string | null;
    docId?: string | null;
    parentId?: string | null;
    repeat?: Task["repeat"];
}

function uid(): string {
    try {
        return crypto.randomUUID();
    } catch {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }
}

function normalizeTasks(raw: any): Task[] {
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.tasks) ? raw.tasks : [];
    return list
        .filter((t: any) => t && typeof t.id === "string" && typeof t.title === "string")
        .map((t: any) => ({
            ...t,
            note: t.note || "",
            instances: t.instances && typeof t.instances === "object" ? t.instances : {},
            notified: t.notified && typeof t.notified === "object" ? t.notified : {},
            repeat: t.repeat || null,
            projectId: t.projectId || null,
            blockId: t.blockId || null,
            docId: t.docId || null,
            parentId: t.parentId || null,
            startDate: t.startDate || null,
            startTime: t.startTime || null,
            endDate: t.endDate || null,
            endTime: t.endTime || null,
            reminderOffset: typeof t.reminderOffset === "number" && t.reminderOffset >= 0 ? t.reminderOffset : 0,
            completedAt: typeof t.completedAt === "number" ? t.completedAt : null,
            pomodoroCount: typeof t.pomodoroCount === "number" ? t.pomodoroCount : 0,
            pomodoroMinutes: typeof t.pomodoroMinutes === "number" ? t.pomodoroMinutes : 0,
            pomodoroHistory: t.pomodoroHistory && typeof t.pomodoroHistory === "object" ? t.pomodoroHistory : {},
            createdAt: t.createdAt || Date.now(),
            updatedAt: t.updatedAt || t.createdAt || Date.now(),
            sort: typeof t.sort === "number" ? t.sort : 0,
            status: ["doing", "done", "abandoned"].includes(t.status) ? t.status : "todo",
            priority: ["low", "medium", "high"].includes(t.priority) ? t.priority : "none",
        }));
}

function normalizeProjects(raw: any): Project[] {
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.projects) ? raw.projects : [];
    return list
        .filter((p: any) => p && typeof p.id === "string" && typeof p.name === "string")
        .map((p: any) => ({
            ...p,
            color: p.color || "#3b82f6",
            note: p.note || "",
            category: typeof p.category === "string" ? p.category : "",
            emoji: typeof p.emoji === "string" ? p.emoji : "",
            docId: p.docId || null,
            startDate: p.startDate || null,
            endDate: p.endDate || null,
            archived: !!p.archived,
            sort: typeof p.sort === "number" ? p.sort : 0,
            createdAt: p.createdAt || Date.now(),
            updatedAt: p.updatedAt || Date.now(),
        }));
}

function normalizeSettings(raw: any): Settings {
    const base = { ...DEFAULT_SETTINGS };
    if (!raw || typeof raw !== "object") return base;
    return {
        ...base,
        ...raw,
        version: 1,
        dayStartTime: /^\d{2}:\d{2}$/.test(raw.dayStartTime) ? raw.dayStartTime : base.dayStartTime,
        defaultReminderTime: /^\d{2}:\d{2}$/.test(raw.defaultReminderTime)
            ? raw.defaultReminderTime
            : base.defaultReminderTime,
        weekStart: raw.weekStart === 0 ? 0 : 1,
        dateHeadingLevel: [1, 2, 3, 4, 5, 6].includes(raw.dateHeadingLevel) ? raw.dateHeadingLevel : 3,
        autoTaskFromList: raw.autoTaskFromList !== false,
        autoTaskHeadingLevel: ["h5", "h6", "both"].includes(raw.autoTaskHeadingLevel)
            ? raw.autoTaskHeadingLevel
            : "off",
        calendarColorMode: raw.calendarColorMode === "vivid" ? "vivid" : "muted",
        privacyMode: !!raw.privacyMode,
    };
}

export class Store {
    tasks: Task[] = [];
    projects: Project[] = [];
    settings: Settings = { ...DEFAULT_SETTINGS };

    private persistence: Persistence;
    private listeners = new Set<() => void>();
    private saveTimer: number | null = null;
    private dirty = { tasks: false, projects: false, settings: false };

    constructor(host: StorageHost) {
        this.persistence = new Persistence(host);
    }

    async load(): Promise<void> {
        const [tasks, projects, settings] = await Promise.all([
            this.persistence.loadArray<Task>(TASKS_FILE, normalizeTasks),
            this.persistence.loadArray<Project>(PROJECTS_FILE, normalizeProjects),
            this.persistence.loadObject<Settings>(SETTINGS_FILE, { ...DEFAULT_SETTINGS }, normalizeSettings),
        ]);
        this.tasks = tasks;
        this.projects = projects.sort((a, b) => a.sort - b.sort);
        this.settings = settings;
        this.pruneNotified();
    }

    onChange(fn: () => void): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    emit(): void {
        for (const fn of this.listeners) {
            try {
                fn();
            } catch (err) {
                console.error("[stm] listener error", err);
            }
        }
    }

    getProject(id: string | null): Project | undefined {
        return id ? this.projects.find(p => p.id === id) : undefined;
    }

    getTask(id: string): Task | undefined {
        return this.tasks.find(t => t.id === id);
    }

    createTask(input: NewTaskInput): Task {
        const now = Date.now();
        const maxSort = this.tasks.reduce((m, t) => Math.max(m, t.sort || 0), 0);
        const task: Task = {
            id: uid(),
            title: input.title.trim() || "未命名事项",
            note: input.note || "",
            projectId: input.projectId || null,
            status: input.status || "todo",
            priority: input.priority || "none",
            startDate: input.startDate || null,
            startTime: input.startTime || null,
            endDate: input.endDate || null,
            endTime: input.endTime || null,
            reminderOffset: typeof input.reminderOffset === "number" && input.reminderOffset >= 0 ? input.reminderOffset : 0,
            blockId: input.blockId || null,
            docId: input.docId || null,
            parentId: input.parentId || null,
            subtaskListId: null,
            sort: maxSort + 1,
            repeat: input.repeat || null,
            completedAt: null,
            pomodoroCount: 0,
            pomodoroMinutes: 0,
            pomodoroHistory: {},
            instances: {},
            notified: {},
            createdAt: now,
            updatedAt: now,
        };
        this.tasks.push(task);
        this.markDirty("tasks");
        this.emit();
        return task;
    }

    updateTask(id: string, patch: Partial<Task>): Task | undefined {
        const idx = this.tasks.findIndex(t => t.id === id);
        if (idx < 0) return undefined;
        const next = { ...this.tasks[idx], ...patch, id, updatedAt: Date.now() };
        this.tasks[idx] = next;
        this.markDirty("tasks");
        this.emit();
        return next;
    }

    deleteTask(id: string): Task | undefined {
        const idx = this.tasks.findIndex(t => t.id === id);
        if (idx < 0) return undefined;
        const [removed] = this.tasks.splice(idx, 1);
        this.markDirty("tasks");
        this.emit();
        return removed;
    }

    setDone(id: string, date: string | null): Task | undefined {
        const task = this.getTask(id);
        if (!task) return undefined;
        const next = toggleDone(task, date);
        const idx = this.tasks.findIndex(t => t.id === id);
        this.tasks[idx] = next;
        this.markDirty("tasks");
        this.emit();
        return next;
    }

    markNotified(taskId: string, key: string): void {
        const task = this.getTask(taskId);
        if (!task) return;
        task.notified = { ...(task.notified || {}), [key]: Date.now() };
        this.markDirty("tasks");
    }

    createProject(input: {
        name: string;
        color: string;
        note?: string;
        category?: string;
        emoji?: string;
        docId?: string | null;
        startDate?: string | null;
        endDate?: string | null;
    }): Project {
        const now = Date.now();
        const maxSort = this.projects.reduce((m, p) => Math.max(m, p.sort || 0), 0);
        const project: Project = {
            id: uid(),
            name: input.name.trim() || "未命名项目",
            color: input.color || "#3b82f6",
            note: input.note || "",
            category: input.category || "",
            emoji: input.emoji || "",
            docId: input.docId || null,
            startDate: input.startDate || null,
            endDate: input.endDate || null,
            archived: false,
            sort: maxSort + 1,
            createdAt: now,
            updatedAt: now,
        };
        this.projects.push(project);
        this.markDirty("projects");
        this.emit();
        return project;
    }

    updateProject(id: string, patch: Partial<Project>): Project | undefined {
        const idx = this.projects.findIndex(p => p.id === id);
        if (idx < 0) return undefined;
        const next = { ...this.projects[idx], ...patch, id, updatedAt: Date.now() };
        this.projects[idx] = next;
        this.markDirty("projects");
        this.emit();
        return next;
    }

    deleteProject(id: string): void {
        this.projects = this.projects.filter(p => p.id !== id);
        for (const task of this.tasks) {
            if (task.projectId === id) task.projectId = null;
        }
        this.markDirty("projects");
        this.markDirty("tasks");
        this.emit();
    }

    updateSettings(patch: Partial<Settings>): void {
        this.settings = { ...this.settings, ...patch, version: 1 };
        this.markDirty("settings");
        this.emit();
    }

    private pruneNotified(): void {
        const cutoff = Date.now() - 30 * 86400_000;
        let changed = false;
        for (const task of this.tasks) {
            for (const [key, ts] of Object.entries(task.notified || {})) {
                if (!ts || ts < cutoff) {
                    delete task.notified[key];
                    changed = true;
                }
            }
        }
        if (changed) this.markDirty("tasks");
    }

    private markDirty(kind: "tasks" | "projects" | "settings"): void {
        this.dirty[kind] = true;
        if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
        this.saveTimer = window.setTimeout(() => {
            this.saveTimer = null;
            void this.flush();
        }, 350);
    }

    async flush(): Promise<void> {
        if (this.saveTimer !== null) {
            window.clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        if (this.dirty.tasks) {
            this.dirty.tasks = false;
            const payload = this.tasks.map(t => ({ ...t }));
            await this.persistence.save(TASKS_FILE, payload);
        }
        if (this.dirty.projects) {
            this.dirty.projects = false;
            await this.persistence.save(PROJECTS_FILE, this.projects.map(p => ({ ...p })));
        }
        if (this.dirty.settings) {
            this.dirty.settings = false;
            await this.persistence.save(SETTINGS_FILE, { ...this.settings });
        }
    }

    /** 从旧「任务笔记管理」插件的 reminder.json / project.json / categories.json 合并导入 */
    async importLegacy(files: Record<string, any>): Promise<number> {
        const parseTime = (value: any): number | null => {
            if (typeof value === "number" && Number.isFinite(value)) return value;
            if (typeof value !== "string" || !value.trim()) return null;
            const ms = Date.parse(value.includes("T") ? value : value.replace(" ", "T"));
            return Number.isFinite(ms) ? ms : null;
        };
        const categories = Array.isArray(files.categories) ? files.categories : [];
        const catMap = new Map<string, any>(categories.map((c: any) => [String(c.id), c]));
        const oldProjects = Object.values(files.project && typeof files.project === "object" ? files.project : {}).filter(
            (p: any) => p && typeof p === "object" && typeof p.id === "string" && typeof p.title === "string"
        ) as any[];
        const projectIds = new Set(oldProjects.map(p => p.id));
        const projects: any[] = oldProjects.map(p => {
            const cat = catMap.get(String(p.categoryId));
            return {
                id: p.id,
                name: p.title,
                color: p.color || cat?.color || "#3b82f6",
                note: p.note || "",
                category: cat?.name || "",
                emoji: "",
                docId: null,
                startDate: p.startDate || null,
                endDate: p.endDate || null,
                archived: !!p.archived,
                sort: typeof p.sort === "number" ? p.sort : 0,
                createdAt: parseTime(p.createdTime) || Date.now(),
                updatedAt: parseTime(p.updatedTime) || Date.now(),
            };
        });
        const oldReminders = Object.values(files.reminder && typeof files.reminder === "object" ? files.reminder : {}).filter(
            (r: any) => r && typeof r === "object" && typeof r.id === "string" && typeof r.title === "string"
        ) as any[];
        const tasks: any[] = [];
        for (const r of oldReminders) {
            const completed = !!r.completed;
            const kanban = String(r.kanbanStatus || "").toLowerCase();
            const status = completed ? "done" : kanban === "doing" ? "doing" : kanban === "abandoned" || kanban === "cancelled" ? "abandoned" : "todo";
            const projectId = typeof r.projectId === "string" && projectIds.has(r.projectId) ? r.projectId : null;
            const priority = ["low", "medium", "high"].includes(r.priority) ? r.priority : "none";
            const startDate = r.date || r.availableStartDate || null;
            const endDate = r.endDate || null;
            const completedAt = completed ? parseTime(r.completedAt) || parseTime(r.completedTime) : null;
            tasks.push({
                id: r.id,
                title: r.title,
                note: r.note || "",
                projectId,
                priority,
                status,
                startDate,
                startTime: r.time || null,
                endDate,
                endTime: r.endTime || null,
                blockId: r.blockId || null,
                docId: r.docId || null,
                parentId: r.parentId || null,
                completedAt,
                repeat: null,
                sort: typeof r.sort === "number" ? r.sort : 0,
                createdAt: parseTime(r.createdAt) || parseTime(r.createdTime) || Date.now(),
                updatedAt: parseTime(r.updatedAt) || parseTime(r.createdAt) || Date.now(),
            });
        }
        this.importSnapshot({ tasks, projects }, "merge");
        return tasks.length;
    }

    /** 导入事项/项目/设置；merge 按 id 覆盖，replace 整体替换已有数据 */
    importSnapshot(raw: any, mode: "merge" | "replace" = "merge"): { tasks: number; projects: number } {
        if (!raw || typeof raw !== "object") throw new Error("invalid snapshot");
        const hasTasks = Array.isArray(raw) || Array.isArray(raw.tasks);
        const hasProjects = Array.isArray(raw.projects);
        if (!hasTasks && !hasProjects) throw new Error("no tasks or projects");
        const tasks = hasTasks ? normalizeTasks(raw) : [];
        const projects = hasProjects ? normalizeProjects(raw) : [];
        if (mode === "replace") {
            if (hasTasks) this.tasks = tasks;
            if (hasProjects) this.projects = projects;
        } else {
            if (hasTasks) {
                const map = new Map(this.tasks.map(t => [t.id, t]));
                for (const task of tasks) map.set(task.id, task);
                this.tasks = [...map.values()];
            }
            if (hasProjects) {
                const map = new Map(this.projects.map(p => [p.id, p]));
                for (const project of projects) map.set(project.id, project);
                this.projects = [...map.values()];
            }
        }
        if (raw.settings && typeof raw.settings === "object") {
            this.settings =
                mode === "replace"
                    ? normalizeSettings(raw.settings)
                    : normalizeSettings({ ...this.settings, ...raw.settings });
        }
        this.markDirty("tasks");
        this.markDirty("projects");
        this.markDirty("settings");
        this.emit();
        return { tasks: tasks.length, projects: projects.length };
    }

    exportSnapshot(): string {
        return JSON.stringify(
            { version: 1, exportedAt: new Date().toISOString(), tasks: this.tasks, projects: this.projects, settings: this.settings },
            null,
            2
        );
    }

    todayKey(dayStart: string): string {
        return toDateStr(new Date());
    }
}
