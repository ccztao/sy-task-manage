import { Calendar, type EventContentArg, type EventInput } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import zhCnLocale from "@fullcalendar/core/locales/zh-cn";
import { Lunar } from "lunar-typescript";
import { showMessage } from "siyuan";
import type STMPlugin from "../index";
import type { Task } from "../types";
import { addDays, logicalToday, pad, toDateStr, toMs } from "../domain/date";
import { expandOccurrences, isDoneOn } from "../domain/repeat";
import { h } from "../ui/dom";
import { icon } from "../ui/icons";
import { showMenu, menuItem } from "../ui/menu";
import { groupProjects } from "../domain/projects";
import { moveBlockUnderDate } from "../integration/dateHeadings";
import { deleteTaskWithCleanup } from "../integration/blockBinding";
import { openBoundBlock } from "../api";
import { maskText } from "../ui/privacy";

const DEFAULT_COLOR = "#5b8def";

function hexToHsl(hex: string): { h: number; s: number; l: number } {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return { h: 220, s: 60, l: 50 };
    const n = parseInt(m[1], 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
    }
    return { h, s: s * 100, l: l * 100 };
}

function hsl(h: number, s: number, l: number): string {
    return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;
}

/** 苹果日历式淡显：浅色底 + 同色系深色文字 */
function mutedEventColor(hex: string): { bg: string; fg: string; border: string } {
    const { h, s } = hexToHsl(hex);
    const sat = Math.min(62, Math.max(18, s * 0.7));
    return {
        bg: hsl(h, sat, 87),
        fg: hsl(h, Math.min(70, sat + 6), 32),
        border: hsl(h, sat, 79),
    };
}

function readableTextColor(hex: string): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return "#ffffff";
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.62 ? "#1f2328" : "#ffffff";
}

function localIso(ms: number): string {
    const d = new Date(ms);
    return `${toDateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

export class CalendarView {
    private root: HTMLElement;
    private calendar: Calendar | null = null;
    private projectSelect: HTMLSelectElement | null = null;
    private privacyBtn: HTMLButtonElement | null = null;
    private projectId: string | null = null;
    private category: string | null = null;
    private unsub: (() => void) | null = null;
    private container: HTMLElement | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private renderAttempts = 0;
    private rendered = false;

    constructor(el: HTMLElement, private plugin: STMPlugin) {
        this.root = el;
    }

    mount(): void {
        const t = this.plugin.t;
        this.root.classList.add("stm-calendar-root");
        this.root.innerHTML = "";

        const select = h("select", { class: "b3-select stm-project-select" }) as HTMLSelectElement;
        select.addEventListener("change", () => {
            const value = select.value;
            if (value.startsWith("cat:")) {
                const key = decodeURIComponent(value.slice(4));
                this.category = key === "__none__" ? "" : key;
                this.projectId = null;
            } else {
                this.category = null;
                this.projectId = value || null;
            }
            this.calendar?.refetchEvents();
        });
        this.projectSelect = select;

        const newBtn = h("button", { class: "b3-button b3-button--text stm-btn", html: `${icon("plus", 14)}<span>${t("newTask")}</span>` });
        newBtn.addEventListener("click", () =>
            this.plugin.openTaskDialog({ date: logicalToday(this.plugin.store.settings.dayStartTime), projectId: this.projectId, source: "calendar" })
        );
        const privacyBtn = h("button", { class: "stm-icon-btn stm-privacy-btn" }) as HTMLButtonElement;
        privacyBtn.addEventListener("click", () => this.plugin.togglePrivacy());
        this.privacyBtn = privacyBtn;

        const header = h("div", { class: "stm-calendar-header" }, [
            h("div", { class: "stm-kanban-title", text: t("calendarTitle") }),
            h("div", { class: "fn__flex-1" }),
            select,
            privacyBtn,
            newBtn,
        ]);

        this.container = h("div", { class: "stm-calendar" });
        this.root.append(header, this.container);

        const settings = this.plugin.store.settings;
        this.calendar = new Calendar(this.container, {
            plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
            locale: zhCnLocale,
            firstDay: settings.weekStart,
            initialView: "dayGridMonth",
            headerToolbar: {
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek,listWeek",
            },
            buttonText: { listWeek: this.plugin.t("listView") },
            height: "100%",
            expandRows: true,
            eventDisplay: "block",
            dayMaxEvents: false,
            navLinks: false,
            editable: true,
            selectable: true,
            selectMirror: true,
            nowIndicator: true,
            eventTimeFormat: { hour: "2-digit", minute: "2-digit", hour12: false },
            slotLabelFormat: { hour: "2-digit", minute: "2-digit", hour12: false },
            events: (info, success) => success(this.buildEvents(info.start, info.end)),
            eventContent: arg => this.renderEventContent(arg),
            dayCellContent: arg => this.renderDayCell(arg),
            dayHeaderContent: arg => this.renderDayHeader(arg),
            eventClick: info => {
                const task = this.plugin.store.getTask(info.event.extendedProps.taskId);
                if (task) this.plugin.openTaskDialog({ task });
            },
            eventDidMount: info => {
                const task = this.plugin.store.getTask(info.event.extendedProps.taskId) as Task | undefined;
                if (!task) return;
                if (!this.plugin.store.settings.privacyMode && task.note) info.el.title = task.note;
                else info.el.removeAttribute("title");
                info.el.addEventListener("contextmenu", ev => {
                    ev.preventDefault();
                    const rect = info.el.getBoundingClientRect();
                    this.showEventMenu(task, { x: rect.left, y: rect.bottom });
                });
            },
            eventDrop: info => this.onEventChange(info),
            eventResize: info => this.onEventChange(info),
            select: info => {
                const date = toDateStr(info.start);
                const endDate = toDateStr(new Date(info.end.getTime() - 86400_000));
                const time = info.allDay ? null : `${pad(info.start.getHours())}:${pad(info.start.getMinutes())}`;
                this.plugin.openTaskDialog({
                    date,
                    endDate: endDate !== date ? endDate : null,
                    time,
                    projectId: this.projectId,
                    source: "calendar",
                });
            },
        });
        this.observeSize();
        this.renderWhenVisible();
        this.renderProjectOptions();
        this.syncPrivacyButton();
        this.unsub = this.plugin.store.onChange(() => {
            this.renderProjectOptions();
            this.syncPrivacyButton();
            this.preserveScroll(() => this.calendar?.refetchEvents());
        });
    }

    /** refetchEvents 会重建日历 DOM，保留当前滚动位置，避免完成/取消完成时页面跳动 */
    private preserveScroll(action: () => void): void {
        const targets = new Map<HTMLElement, number>();
        const remember = (el: HTMLElement | null | undefined) => {
            if (!el || targets.has(el)) return;
            targets.set(el, el.scrollTop);
        };
        remember(this.container);
        this.container?.querySelectorAll<HTMLElement>(".fc-scroller").forEach(el => remember(el));
        let parent = this.container?.parentElement || null;
        for (let i = 0; i < 6 && parent; i++, parent = parent.parentElement) {
            if (parent.scrollHeight > parent.clientHeight + 10) remember(parent);
        }
        remember(document.scrollingElement as HTMLElement | null);
        const before = targets;
        action();
        const restore = () => {
            for (const [el, top] of before) {
                if (top > 0) el.scrollTop = top;
            }
        };
        requestAnimationFrame(restore);
        window.setTimeout(restore, 30);
        window.setTimeout(restore, 120);
    }

    /** 页签可能是在隐藏状态下恢复的，等容器有尺寸后再渲染，避免日历被压成 0 宽 */
    private renderWhenVisible(): void {
        if (!this.calendar || !this.container) return;
        if (this.container.clientWidth > 0 && this.container.clientHeight > 0) {
            this.renderCalendar();
            return;
        }
        if (this.renderAttempts++ < 180) {
            requestAnimationFrame(() => this.renderWhenVisible());
        } else {
            this.renderCalendar();
        }
    }

    private renderCalendar(): void {
        if (!this.calendar || this.rendered) return;
        this.rendered = true;
        this.calendar.render();
        this.calendar.updateSize();
        // 隐藏页签恢复、窗口尺寸变化时再兜底刷新几次
        for (const delay of [120, 400, 1200]) {
            window.setTimeout(() => {
                if (this.calendar) this.calendar.updateSize();
            }, delay);
        }
    }

    private observeSize(): void {
        if (!this.container || typeof ResizeObserver === "undefined") return;
        this.resizeObserver = new ResizeObserver(() => {
            if (this.container && this.container.clientWidth > 0 && this.calendar) {
                if (!this.rendered) this.renderCalendar();
                else this.calendar.updateSize();
            }
        });
        this.resizeObserver.observe(this.container);
    }

    resize(): void {
        this.calendar?.updateSize();
    }

    destroy(): void {
        this.unsub?.();
        this.unsub = null;
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.calendar?.destroy();
        this.calendar = null;
        this.root.innerHTML = "";
    }

    private syncPrivacyButton(): void {
        if (!this.privacyBtn) return;
        const on = !!this.plugin.store.settings.privacyMode;
        this.privacyBtn.innerHTML = icon(on ? "eyeOff" : "eye", 16);
        this.privacyBtn.title = on ? this.plugin.t("privacyModeExit") : this.plugin.t("privacyMode");
        this.privacyBtn.classList.toggle("is-active", on);
    }

    private renderProjectOptions(): void {
        if (!this.projectSelect) return;
        const t = this.plugin.t;
        const current = this.category !== null
            ? `cat:${encodeURIComponent(this.category || "__none__")}`
            : this.projectId || "";
        this.projectSelect.innerHTML = "";
        this.projectSelect.append(new Option(t("allProjects"), ""));
        for (const group of groupProjects(this.plugin.store.projects)) {
            const category = group.category || "";
            const label = category || t("uncategorized");
            const key = category || "__none__";
            this.projectSelect.append(new Option(`▸ ${label}（全部）`, `cat:${encodeURIComponent(key)}`));
            for (const project of group.projects) {
                this.projectSelect.append(
                    new Option(`　${project.emoji ? project.emoji + " " : ""}${project.name}`, project.id)
                );
            }
        }
        this.projectSelect.value = current;
    }

    private buildEvents(start: Date, end: Date): EventInput[] {
        const store = this.plugin.store;
        const today = logicalToday(store.settings.dayStartTime);
        const from = toDateStr(start);
        const to = toDateStr(new Date(end.getTime() - 1));
        const events: EventInput[] = [];
        const privacy = !!store.settings.privacyMode;
        const colorMode = store.settings.calendarColorMode || "muted";
        const paint = (hex: string) => {
            if (colorMode === "vivid") return { bg: hex, fg: readableTextColor(hex), border: hex };
            const muted = mutedEventColor(hex);
            return { bg: muted.bg, fg: muted.fg, border: muted.border };
        };
        for (const task of store.tasks) {
            if (task.status === "abandoned") continue;
            const project = store.getProject(task.projectId);
            if (this.category !== null && (project?.category || "") !== this.category) continue;
            if (this.projectId && task.projectId !== this.projectId) continue;
            const color = project?.color || DEFAULT_COLOR;
            const painted = paint(color);
            const multiDay = !task.repeat && !!task.startDate && !!task.endDate && task.endDate > task.startDate;
            if (multiDay) {
                if (task.startDate! > to || task.endDate! < from) continue;
                const startDate = task.startDate!;
                const endDate = task.endDate!;
                const done = isDoneOn(task, startDate);
                const hasTime = !!task.startTime;
                const startValue = hasTime ? `${startDate}T${task.startTime}:00` : startDate;
                const endValue = hasTime
                    ? `${endDate}T${task.endTime || "23:59"}:00`
                    : addDays(endDate, 1);
                events.push({
                    id: `${task.id}#${task.startDate}`,
                    title: privacy ? maskText(task.title) : task.title,
                    start: startValue,
                    end: endValue || undefined,
                    allDay: !hasTime,
                    backgroundColor: painted.bg,
                    borderColor: painted.border,
                    textColor: painted.fg,
                    classNames: done ? ["stm-event-done"] : [],
                    extendedProps: { taskId: task.id, date: task.startDate, done, today },
                });
                continue;
            }
            const dates = expandOccurrences(task, from, to, 200);
            if (!dates.length) continue;
            for (const date of dates) {
                if (task.instances?.[date]?.skipped) continue;
                const done = isDoneOn(task, date);
                const hasTime = !!task.startTime;
                const startValue = hasTime ? `${date}T${task.startTime}:00` : date;
                let endValue: string | undefined;
                if (hasTime) {
                    const startMs = toMs(date, task.startTime);
                    let endMs = startMs + 30 * 60_000;
                    if (task.endTime) {
                        const sameDayEnd = toMs(date, task.endTime);
                        endMs = sameDayEnd > startMs ? sameDayEnd : sameDayEnd + 86400_000;
                    }
                    endValue = localIso(endMs);
                }
                events.push({
                    id: `${task.id}#${date}`,
                    title: privacy ? maskText(task.title) : task.title,
                    start: startValue,
                    end: endValue || undefined,
                    allDay: !hasTime,
                    backgroundColor: painted.bg,
                    borderColor: painted.border,
                    textColor: painted.fg,
                    classNames: done ? ["stm-event-done"] : [],
                    extendedProps: { taskId: task.id, date, done, today },
                });
            }
        }
        return events;
    }

    private lunarLabel(date: Date): { text: string; special: boolean } | null {
        try {
            const lunar = Lunar.fromDate(date);
            const day = lunar.getDayInChinese();
            const month = lunar.getMonthInChinese();
            const festival = lunar.getFestivals()[0] || lunar.getJieQi();
            if (festival) return { text: festival, special: true };
            return { text: day === "初一" ? `${month}月` : day, special: false };
        } catch {
            return null;
        }
    }

    private renderDayCell(arg: any): any {
        if (arg.view.type !== "dayGridMonth") return true;
        const wrap = document.createElement("div");
        wrap.className = "stm-fc-day";
        const num = document.createElement("span");
        num.className = "stm-fc-daynum";
        num.textContent = String(arg.date.getDate());
        wrap.append(num);
        const lunar = this.lunarLabel(arg.date);
        if (lunar) {
            const label = document.createElement("span");
            label.className = `stm-fc-lunar${lunar.special ? " is-special" : ""}`;
            label.textContent = lunar.text;
            wrap.append(label);
        }
        return { domNodes: [wrap] };
    }

    private renderDayHeader(arg: any): any {
        if (arg.view.type !== "timeGridWeek" && arg.view.type !== "timeGridDay") return true;
        const lunar = this.lunarLabel(arg.date);
        if (!lunar) return true;
        const wrap = document.createElement("div");
        wrap.className = "stm-fc-dayhead";
        const main = document.createElement("span");
        main.className = "stm-fc-dayhead-main";
        main.textContent = arg.text;
        const sub = document.createElement("span");
        sub.className = `stm-fc-dayhead-lunar${lunar.special ? " is-special" : ""}`;
        sub.textContent = lunar.text;
        wrap.append(main, sub);
        return { domNodes: [wrap] };
    }

    /** 日历事件内嵌完成勾选框 */
    private renderEventContent(arg: EventContentArg): { domNodes: Node[] } {
        const t = this.plugin.t;
        const taskId = arg.event.extendedProps.taskId as string;
        const date = arg.event.extendedProps.date as string;
        const done = !!arg.event.extendedProps.done;
        const wrap = document.createElement("div");
        wrap.className = "stm-fc-event";
        const check = document.createElement("button");
        check.type = "button";
        check.className = `stm-fc-check${done ? " is-checked" : ""}`;
        check.innerHTML = icon("check", 10);
        check.title = t("toggleDone");
        const stop = (ev: Event) => ev.stopPropagation();
        check.addEventListener("pointerdown", stop);
        check.addEventListener("mousedown", stop);
        check.addEventListener("click", ev => {
            ev.preventDefault();
            ev.stopPropagation();
            check.blur();
            this.toggleOccurrence(taskId, date);
        });
        wrap.append(check);
        if (arg.timeText) {
            const time = document.createElement("span");
            time.className = "stm-fc-time";
            time.textContent = arg.timeText;
            wrap.append(time);
        }
        const title = document.createElement("span");
        title.className = "stm-fc-title";
        title.textContent = arg.event.title;
        wrap.append(title);
        return { domNodes: [wrap] };
    }

    private toggleOccurrence(taskId: string, date: string): void {
        const task = this.plugin.store.getTask(taskId);
        if (!task) return;
        this.plugin.store.setDone(taskId, task.repeat ? date : null);
    }

    private onEventChange(info: any): void {
        const t = this.plugin.t;
        const task = this.plugin.store.getTask(info.event.extendedProps.taskId);
        if (!task) {
            info.revert();
            return;
        }
        if (task.repeat) {
            info.revert();
            showMessage(t("repeatDragHint"), 3000, "info");
            return;
        }
        const start: Date | null = info.event.start;
        if (!start) {
            info.revert();
            return;
        }
        const date = toDateStr(start);
        const time = info.event.allDay ? null : `${pad(start.getHours())}:${pad(start.getMinutes())}`;
        const end = info.event.end as Date | null;
        let endDate: string | null = null;
        if (end) {
            const inclusive = info.event.allDay ? toDateStr(new Date(end.getTime() - 86400_000)) : toDateStr(end);
            endDate = inclusive > date ? inclusive : null;
        }
        this.plugin.store.updateTask(task.id, { startDate: date, startTime: time, endDate });
        if (task.blockId) void moveBlockUnderDate(task.blockId, date, this.plugin.store.settings.dateHeadingLevel);
    }

    private showEventMenu(task: Task, pos: { x: number; y: number }): void {
        const t = this.plugin.t;
        const project = task.projectId ? this.plugin.store.getProject(task.projectId) : null;
        const target = task.blockId || task.docId || project?.docId || null;
        const items = [];
        if (target) {
            items.push(menuItem(t("openDocument"), "iconOpen", () => openBoundBlock(this.plugin.app, target)));
        }
        items.push(
            menuItem(t("pomodoroStart"), "iconClock", () => this.plugin.startPomodoro(task.id)),
            menuItem(t("edit"), "iconEdit", () => this.plugin.openTaskDialog({ task })),
            menuItem(t("markDone"), "iconCheck", () =>
                this.plugin.store.setDone(task.id, task.repeat ? toDateStr(new Date()) : null)
            ),
            menuItem(t("delete"), "iconTrashcan", () => void deleteTaskWithCleanup(this.plugin.store, task.id))
        );
        showMenu(items, pos);
    }
}
