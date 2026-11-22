import { showMessage } from "siyuan";
import type { Store } from "../store";
import type { T } from "../i18n";
import { formatDateHuman, logicalToday } from "../domain/date";
import { collectDueEvents } from "../domain/reminder";
import { sendReminderNotification } from "../api";

const LEADER_KEY = "stm.reminder.leader";
const LEASE_MS = 60_000;
const TICK_MS = 20_000;
const CATCH_UP_MS = 10 * 60_000;

export interface ReminderContext {
    store: Store;
    t: T;
    app: any;
}

export class ReminderService {
    private timer: number | null = null;
    private started = false;
    private owner = Math.random().toString(36).slice(2);
    private checking = false;

    constructor(private ctx: ReminderContext) {}

    start(): void {
        if (this.started) return;
        this.started = true;
        this.timer = window.setInterval(() => this.check(), TICK_MS);
        window.setTimeout(() => this.check(), 3000);
        window.addEventListener("focus", this.onWake);
        document.addEventListener("visibilitychange", this.onVisibility);
    }

    stop(): void {
        this.started = false;
        if (this.timer !== null) window.clearInterval(this.timer);
        this.timer = null;
        window.removeEventListener("focus", this.onWake);
        document.removeEventListener("visibilitychange", this.onVisibility);
    }

    private onWake = () => this.check();
    private onVisibility = () => {
        if (document.visibilityState === "visible") this.check();
    };

    /** 多窗口时只允许一个窗口发系统通知，避免重复 */
    private isLeader(): boolean {
        try {
            const raw = localStorage.getItem(LEADER_KEY);
            const now = Date.now();
            if (!raw) {
                localStorage.setItem(LEADER_KEY, JSON.stringify({ id: this.owner, until: now + LEASE_MS }));
                return true;
            }
            const lease = JSON.parse(raw) as { id: string; until: number };
            if (lease.id === this.owner || !lease.until || lease.until < now) {
                localStorage.setItem(LEADER_KEY, JSON.stringify({ id: this.owner, until: now + LEASE_MS }));
                return true;
            }
            return false;
        } catch {
            return true;
        }
    }

    private async check(): Promise<void> {
        if (!this.started || this.checking) return;
        const { store, t } = this.ctx;
        if (!store.settings.notifications) return;
        if (!this.isLeader()) return;
        this.checking = true;
        try {
            const now = new Date();
            const today = logicalToday(store.settings.dayStartTime, now);
            const events = collectDueEvents(store.tasks, store.settings, now, CATCH_UP_MS);
            for (const event of events) {
                const project = store.getProject(event.task.projectId);
                const body = [project?.name, formatDateHuman(event.date, today) + (event.task.startTime ? ` ${event.task.startTime}` : "")]
                    .filter(Boolean)
                    .join(" · ");
                store.markNotified(event.task.id, event.key);
                const message = `${event.task.title}${body ? `\n${body}` : ""}`;
                await sendReminderNotification(t("notifyTitle"), message);
                // 系统通知可能被系统设置静默，保留一个应用内反馈
                showMessage(`${t("notifyTitle")} · ${event.task.title}`, 7000, "info");
            }
            void this.ctx.app;
        } catch (err) {
            console.error("[stm] reminder check failed", err);
        } finally {
            this.checking = false;
        }
    }
}
