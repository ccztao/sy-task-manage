import type STMPlugin from "../index";
import type { Project, Task } from "../types";
import { addDays, diffDays, logicalToday, todayStr } from "../domain/date";
import { groupProjects } from "../domain/projects";
import { h } from "../ui/dom";
import { icon } from "../ui/icons";
import { moveBlockUnderDate } from "../integration/dateHeadings";

const LABEL_WIDTH = 220;
const DAY_WIDTHS = { compact: 20, normal: 28, wide: 40 } as const;
type Zoom = keyof typeof DAY_WIDTHS;

const STATUS_COLOR: Record<string, string> = {
    todo: "#d9a441",
    doing: "#4a7cf0",
    done: "#9aa0a6",
    abandoned: "#b0b4b8",
};

function readableText(hex: string): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return "#fff";
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.64 ? "#1f2328" : "#fff";
}

export class GanttView {
    private root: HTMLElement;
    private body: HTMLElement | null = null;
    private projectId: string | null = null;
    private category: string | null = null;
    private selectEl: HTMLSelectElement | null = null;
    private statusEl: HTMLSelectElement | null = null;
    private sortEl: HTMLSelectElement | null = null;
    private doneEl: HTMLSelectElement | null = null;
    private query = "";
    private status = "all";
    private sort: "date" | "project" = "date";
    private doneRange: "all" | "week" | "month" | "open" = "week";
    private zoom: Zoom = "normal";
    private scrollEl: HTMLElement | null = null;
    private unsub: (() => void) | null = null;

    constructor(private el: HTMLElement, private plugin: STMPlugin) {
        this.root = el;
    }

    mount(): void {
        const t = this.plugin.t;
        this.root.classList.add("stm-gantt-root");
        this.root.innerHTML = "";

        const select = h("select", { class: "b3-select stm-project-select" }) as HTMLSelectElement;
        this.selectEl = select;
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
            this.render();
        });

        const zoom = h("select", { class: "b3-select stm-gantt-zoom" }) as HTMLSelectElement;
        zoom.innerHTML = `<option value="compact">${t("ganttCompact")}</option><option value="normal">${t("ganttNormal")}</option><option value="wide">${t("ganttWide")}</option>`;
        zoom.value = this.zoom;
        zoom.addEventListener("change", () => {
            this.zoom = zoom.value as Zoom;
            this.render();
        });

        const today = h("button", { class: "b3-button b3-button--text stm-btn", text: t("today") });
        today.addEventListener("click", () => this.scrollToToday());

        const searchWrap = h("div", { class: "stm-search stm-gantt-search" }, [
            h("span", { class: "stm-search-icon", html: icon("search", 14) }),
            h("input", { class: "b3-text-field stm-search-input", attrs: { placeholder: t("ganttSearchPlaceholder") } }),
        ]);
        const searchInput = searchWrap.querySelector("input") as HTMLInputElement;
        searchInput.addEventListener("input", () => {
            this.query = searchInput.value.trim().toLowerCase();
            this.render();
        });

        const sort = h("select", { class: "b3-select stm-gantt-filter" }) as HTMLSelectElement;
        this.sortEl = sort;
        sort.innerHTML = `<option value="date">${t("ganttSortDate")}</option><option value="project">${t("ganttSortProject")}</option>`;
        sort.addEventListener("change", () => {
            this.sort = sort.value as "date" | "project";
            this.render();
        });

        const status = h("select", { class: "b3-select stm-gantt-filter" }) as HTMLSelectElement;
        this.statusEl = status;
        status.innerHTML = `<option value="all">${t("ganttAllStatus")}</option><option value="todo">${t("status_todo")}</option><option value="doing">${t("status_doing")}</option><option value="done">${t("status_done")}</option><option value="abandoned">${t("status_abandoned")}</option>`;
        status.addEventListener("change", () => {
            this.status = status.value;
            this.render();
        });

        const done = h("select", { class: "b3-select stm-gantt-filter" }) as HTMLSelectElement;
        this.doneEl = done;
        done.innerHTML = `<option value="week">${t("ganttDoneWeek")}</option><option value="month">${t("ganttDoneMonth")}</option><option value="all">${t("ganttDoneAll")}</option><option value="open">${t("ganttDoneOpen")}</option>`;
        done.addEventListener("change", () => {
            this.doneRange = done.value as "all" | "week" | "month" | "open";
            this.render();
        });

        const controls = h("div", { class: "stm-gantt-controls" }, [sort, select, status, done, zoom, today]);
        const header = h("div", { class: "stm-gantt-header" }, [
            h("div", { class: "stm-kanban-title", text: t("ganttTitle") }),
            searchWrap,
            controls,
        ]);
        this.body = h("div", { class: "stm-gantt-body" });
        this.root.append(header, this.body);
        this.unsub = this.plugin.store.onChange(() => this.render());
        this.render();
    }

    resize(): void {
        this.render();
    }

    destroy(): void {
        this.unsub?.();
        this.unsub = null;
        this.root.innerHTML = "";
    }

    private scrollToToday(): void {
        if (!this.scrollEl) return;
        const target = this.scrollEl.querySelector(".stm-gantt-today") as HTMLElement | null;
        if (target) {
            const left = target.offsetLeft - this.scrollEl.clientWidth / 2;
            this.scrollEl.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
        }
    }

    private renderProjectOptions(): void {
        if (!this.selectEl) return;
        const t = this.plugin.t;
        const current = this.category !== null
            ? `cat:${encodeURIComponent(this.category || "__none__")}`
            : this.projectId || "";
        this.selectEl.innerHTML = "";
        this.selectEl.append(new Option(t("allProjects"), ""));
        for (const group of groupProjects(this.plugin.store.projects)) {
            const category = group.category || "";
            const label = category || t("uncategorized");
            this.selectEl.append(new Option(`▸ ${label}（全部）`, `cat:${encodeURIComponent(category || "__none__")}`));
            for (const project of group.projects) {
                this.selectEl.append(
                    new Option(`　${project.emoji ? project.emoji + " " : ""}${project.name}`, project.id)
                );
            }
        }
        this.selectEl.value = current;
    }

    private render(): void {
        this.renderProjectOptions();
        if (this.sortEl) this.sortEl.value = this.sort;
        if (this.statusEl) this.statusEl.value = this.status;
        if (this.doneEl) this.doneEl.value = this.doneRange;
        if (!this.body) return;
        const t = this.plugin.t;
        const store = this.plugin.store;
        const today = logicalToday(store.settings.dayStartTime);
        const projects = new Map(store.projects.map(p => [p.id, p]));
        let tasks = store.tasks.filter(task => {
            if (!task.startDate && !task.endDate) return false;
            if (this.query && !task.title.toLowerCase().includes(this.query)) return false;
            if (this.status !== "all" && task.status !== this.status) return false;
            if (this.doneRange === "open" && (task.status === "done" || task.status === "abandoned")) return false;
            if ((this.doneRange === "week" || this.doneRange === "month") && task.status === "done" && task.completedAt) {
                const days = this.doneRange === "week" ? 7 : 30;
                if (Date.now() - task.completedAt > days * 24 * 60 * 60 * 1000) return false;
            }
            const project = store.getProject(task.projectId);
            if (this.category !== null && (project?.category || "") !== this.category) return false;
            if (this.projectId && task.projectId !== this.projectId) return false;
            return true;
        });
        tasks = tasks.sort((a, b) => {
            if (this.sort === "project") {
                const aP = store.getProject(a.projectId);
                const bP = store.getProject(b.projectId);
                const aK = `${aP?.category || ""}/${aP?.name || ""}`;
                const bK = `${bP?.category || ""}/${bP?.name || ""}`;
                if (aK !== bK) return aK.localeCompare(bK, "zh-Hans-CN");
            }
            const aS = a.startDate || a.endDate || "9999";
            const bS = b.startDate || b.endDate || "9999";
            return aS < bS ? -1 : aS > bS ? 1 : 0;
        });
        this.body.innerHTML = "";
        if (!tasks.length) {
            this.body.append(h("div", { class: "stm-empty" }, [
                h("div", { class: "stm-empty-icon", html: icon("calendar", 28) }),
                h("div", { class: "stm-empty-text", text: t("ganttNoTasks") }),
            ]));
            return;
        }
        const allDates: string[] = [today, todayStr()];
        for (const task of tasks) {
            if (task.startDate) allDates.push(task.startDate);
            if (task.endDate) allDates.push(task.endDate);
        }
        let min = allDates.reduce((a, b) => (a < b ? a : b));
        let max = allDates.reduce((a, b) => (a > b ? a : b));
        min = addDays(min, -7);
        max = addDays(max, 7);
        if (diffDays(min, max) < 34) max = addDays(min, 34);
        const days = diffDays(min, max) + 1;
        const dayW = DAY_WIDTHS[this.zoom];
        const width = days * dayW;

        const scroll = h("div", { class: "stm-gantt-scroll" });
        this.scrollEl = scroll;
        const inner = h("div", { class: "stm-gantt-inner", style: { width: `${LABEL_WIDTH + width}px` } });
        inner.style.setProperty("--gantt-day", `${dayW}px`);

        const head = h("div", { class: "stm-gantt-head" }, [
            h("div", { class: "stm-gantt-corner", text: t("ganttTaskColumn") }),
            h("div", { class: "stm-gantt-timeline", style: { width: `${width}px` } }, [
                this.buildMonths(min, days, dayW),
                this.buildDays(min, days, dayW, today),
            ]),
        ]);
        inner.append(head);

        for (const task of tasks) {
            const start = task.startDate || task.endDate!;
            const end = task.endDate && task.endDate >= start ? task.endDate : start;
            const project = task.projectId ? projects.get(task.projectId) : null;
            const color = task.status === "done" ? STATUS_COLOR.done : task.status === "abandoned" ? STATUS_COLOR.abandoned : (project?.color || STATUS_COLOR[task.status] || STATUS_COLOR.todo);
            const left = diffDays(min, start) * dayW + 3;
            const barWidth = Math.max(dayW - 6, (diffDays(start, end) + 1) * dayW - 6);
            const label = h("div", { class: "stm-gantt-label", title: task.title }, [
                h("span", { class: "stm-gantt-dot", style: { background: project?.color || "#9aa0a6" } }),
                h("span", { class: "stm-gantt-name", text: task.title }),
                h("span", { class: "stm-gantt-range", text: task.startDate ? `${start}${task.endDate ? " → " + end : ""}` : end }),
            ]);
            label.addEventListener("click", () => this.plugin.openTaskDialog({ task }));
            const bar = h("div", {
                class: `stm-gantt-bar is-${task.status}`,
                title: `${task.title}\n${start}${task.endDate ? " → " + end : ""}`,
                style: { left: `${left}px`, width: `${barWidth}px`, background: color, color: readableText(color) },
            }, [h("span", { class: "stm-gantt-bar-text", text: task.title })]);
            if (barWidth < 54) bar.classList.add("stm-gantt-bar--tiny");
            this.attachDrag(bar, task, dayW, min);
            const track = h("div", { class: "stm-gantt-track", style: { width: `${width}px` } }, [
                this.todayLine(min, today, dayW),
                bar,
            ]);
            const row = h("div", { class: `stm-gantt-row${task.status === "done" ? " is-done" : ""}` }, [label, track]);
            inner.append(row);
        }
        scroll.append(inner);
        this.body.append(scroll);
        scroll.scrollLeft = 0;
    }

    private buildMonths(start: string, days: number, dayW: number): HTMLElement {
        const row = h("div", { class: "stm-gantt-months" });
        let cursor = 0;
        while (cursor < days) {
            const date = addDays(start, cursor);
            const [y, m] = date.split("-").map(Number);
            const monthEnd = `${y}-${String(m).padStart(2, "0")}-${new Date(Date.UTC(y, m, 0)).getUTCDate()}`;
            const span = Math.min(days - cursor, diffDays(date, monthEnd) + 1);
            const cell = h("div", { class: "stm-gantt-month", style: { width: `${span * dayW}px` }, text: `${y}年${m}月` });
            row.append(cell);
            cursor += span;
        }
        return row;
    }

    private buildDays(start: string, days: number, dayW: number, today: string): HTMLElement {
        const row = h("div", { class: "stm-gantt-days" });
        const names = ["日", "一", "二", "三", "四", "五", "六"];
        for (let i = 0; i < days; i++) {
            const date = addDays(start, i);
            const wd = new Date(`${date}T00:00:00`).getDay();
            const cell = h("div", {
                class: `stm-gantt-day${wd === 0 || wd === 6 ? " is-weekend" : ""}${date === today ? " is-today" : ""}`,
                style: { width: `${dayW}px` },
                title: date,
            }, [
                h("span", { class: "stm-gantt-day-num", text: String(Number(date.slice(8))) }),
                h("span", { class: "stm-gantt-day-wd", text: names[wd] }),
            ]);
            row.append(cell);
        }
        return row;
    }

    private todayLine(start: string, today: string, dayW: number): HTMLElement {
        const offset = diffDays(start, today);
        return h("div", { class: "stm-gantt-today", style: { left: `${offset * dayW + dayW / 2}px` } });
    }

    private attachDrag(bar: HTMLElement, task: Task, dayW: number, rangeStart: string): void {
        bar.addEventListener("pointerdown", ev => {
            if (ev.button !== 0) return;
            ev.preventDefault();
            ev.stopPropagation();
            const startX = ev.clientX;
            const startDate = task.startDate || task.endDate!;
            const endDate = task.endDate;
            let delta = 0;
            let moved = false;
            const onMove = (e: PointerEvent) => {
                delta = Math.round((e.clientX - startX) / dayW);
                if (delta !== 0) moved = true;
                bar.style.transform = `translateX(${delta * dayW}px)`;
            };
            const cleanup = () => {
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
                bar.style.transform = "";
            };
            const onUp = () => {
                cleanup();
                if (!moved) {
                    this.plugin.openTaskDialog({ task });
                    return;
                }
                const nextStart = addDays(startDate, delta);
                const nextEnd = endDate ? addDays(endDate, delta) : null;
                this.plugin.store.updateTask(task.id, { startDate: nextStart, endDate: nextEnd });
                if (task.blockId) void moveBlockUnderDate(task.blockId, nextStart, this.plugin.store.settings.dateHeadingLevel);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp, { once: true });
        });
    }
}
