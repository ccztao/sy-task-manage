import { showMessage } from "siyuan";
import type STMPlugin from "../index";
import { sendReminderNotification } from "../api";
import { h } from "../ui/dom";
import { icon } from "../ui/icons";

type Phase = "focus" | "short" | "long";

const FOCUS_MS = 25 * 60 * 1000;
const SHORT_MS = 5 * 60 * 1000;
const LONG_MS = 15 * 60 * 1000;

interface PomodoroState {
    taskId: string;
    phase: Phase;
    duration: number;
    remaining: number;
    running: boolean;
    endAt: number | null;
}

function formatClock(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** 单个全局番茄钟；随插件加载，切换页签不中断 */
export class PomodoroService {
    private state: PomodoroState | null = null;
    private tickTimer: number | null = null;
    private widget: HTMLElement | null = null;

    constructor(private plugin: STMPlugin) {}

    start(taskId: string): void {
        const task = this.plugin.store.getTask(taskId);
        if (!task) return;
        this.stop();
        this.state = {
            taskId,
            phase: "focus",
            duration: FOCUS_MS,
            remaining: FOCUS_MS,
            running: true,
            endAt: Date.now() + FOCUS_MS,
        };
        this.ensureWidget();
        this.startTicking();
        this.render();
        showMessage(this.plugin.t("pomodoroStarted", task.title), 2200, "info");
    }

    stop(): void {
        if (this.tickTimer !== null) window.clearInterval(this.tickTimer);
        this.tickTimer = null;
        this.state = null;
        this.widget?.remove();
        this.widget = null;
    }

    startTicking(): void {
        if (this.tickTimer !== null) window.clearInterval(this.tickTimer);
        this.tickTimer = window.setInterval(() => this.tick(), 500);
    }

    private tick(): void {
        if (!this.state) return;
        if (!this.state.running || !this.state.endAt) return;
        this.state.remaining = Math.max(0, this.state.endAt - Date.now());
        if (this.state.remaining <= 0) {
            this.complete();
            return;
        }
        this.render();
    }

    private togglePause(): void {
        if (!this.state) return;
        if (this.state.running) {
            this.state.remaining = Math.max(0, (this.state.endAt || Date.now()) - Date.now());
            this.state.running = false;
            this.state.endAt = null;
        } else {
            this.state.running = true;
            this.state.endAt = Date.now() + this.state.remaining;
        }
        this.render();
    }

    private complete(): void {
        if (!this.state) return;
        const task = this.plugin.store.getTask(this.state.taskId);
        if (!task) {
            this.stop();
            return;
        }
        if (this.state.phase === "focus") {
            const nextCount = (task.pomodoroCount || 0) + 1;
            this.plugin.store.updateTask(task.id, {
                pomodoroCount: nextCount,
                pomodoroMinutes: (task.pomodoroMinutes || 0) + 25,
            });
            const long = nextCount % 4 === 0;
            const duration = long ? LONG_MS : SHORT_MS;
            this.state = {
                taskId: task.id,
                phase: long ? "long" : "short",
                duration,
                remaining: duration,
                running: true,
                endAt: Date.now() + duration,
            };
            void sendReminderNotification(this.plugin.t("pomodoro"), this.plugin.t("pomodoroFocusDone", task.title));
            showMessage(this.plugin.t("pomodoroFocusDone", task.title), 4000, "info");
            this.render();
            return;
        }
        void sendReminderNotification(this.plugin.t("pomodoro"), this.plugin.t("pomodoroBreakDone", task.title));
        this.stop();
        showMessage(this.plugin.t("pomodoroBreakDone", task.title), 4000, "info");
    }

    private ensureWidget(): void {
        if (this.widget) return;
        this.widget = h("div", { class: "stm-pomodoro-widget" });
        document.body.append(this.widget);
    }

    private render(): void {
        if (!this.state || !this.widget) return;
        const task = this.plugin.store.getTask(this.state.taskId);
        if (!task) {
            this.stop();
            return;
        }
        const t = this.plugin.t;
        const phase = this.state.phase === "focus" ? t("pomodoroFocus") : this.state.phase === "long" ? t("pomodoroLongBreak") : t("pomodoroShortBreak");
        const elapsed = Math.min(this.state.duration, this.state.duration - this.state.remaining);
        const percent = this.state.duration ? Math.round((elapsed / this.state.duration) * 100) : 0;
        this.widget.innerHTML = "";
        this.widget.append(
            h("div", { class: "stm-pomodoro-head" }, [
                h("span", { class: "stm-pomodoro-mark", text: "🍅" }),
                h("span", { class: "stm-pomodoro-title", text: t("pomodoro") }),
                h("button", { class: "stm-icon-btn stm-pomodoro-close", html: icon("close", 14), title: t("close") }),
            ]),
            h("button", { class: "stm-pomodoro-task", text: task.title }),
            h("div", { class: "stm-pomodoro-phase", text: `${phase} · ${t("pomodoroSessions", task.pomodoroCount || 0)}` }),
            h("div", { class: "stm-pomodoro-time", text: formatClock(this.state.remaining) }),
            h("div", { class: "stm-pomodoro-track" }, [h("div", { class: "stm-pomodoro-fill", style: { width: `${percent}%` } })]),
            h("div", { class: "stm-pomodoro-actions" }, [
                h("button", { class: "b3-button b3-button--small stm-pomodoro-primary", text: this.state.running ? t("pomodoroPause") : t("pomodoroResume") }),
                h("button", { class: "b3-button b3-button--small b3-button--cancel", text: t("pomodoroSkip") }),
            ])
        );
        this.widget.querySelector(".stm-pomodoro-task")?.addEventListener("click", () => {
            if (this.state) this.plugin.openTaskDialog({ task: this.plugin.store.getTask(this.state.taskId) });
        });
        this.widget.querySelector(".stm-pomodoro-close")?.addEventListener("click", () => this.stop());
        this.widget.querySelector(".stm-pomodoro-primary")?.addEventListener("click", () => this.togglePause());
        this.widget.querySelector(".stm-pomodoro-actions .b3-button--cancel")?.addEventListener("click", () => this.stop());
    }
}
