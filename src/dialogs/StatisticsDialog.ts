import { Dialog } from "siyuan";
import type STMPlugin from "../index";
import { dialogWidth } from "../ui/dom";
import { groupProjects, categoryColor } from "../domain/projects";
import { logicalToday } from "../domain/date";

type StatsTab = "tasks" | "projects" | "pomodoro";

export class StatisticsDialog {
    private dialog: Dialog | null = null;
    private body: HTMLElement | null = null;
    private tab: StatsTab = "tasks";
    private taskHeatRange = 365;
    private pomoHeatRange = 365;
    private taskHeatProject: string | null = null;
    private pomoHeatProject: string | null = null;
    private unsub: (() => void) | null = null;

    constructor(private plugin: STMPlugin) {}

    open(): void {
        const t = this.plugin.t;
        this.dialog = new Dialog({
            title: t("statistics"),
            width: dialogWidth(680),
            content: `
<div class="b3-dialog__content stm-dialog stm-stats-dialog">
  <div class="stm-stats-tabs">
    <button class="stm-stats-tab is-active" data-tab="tasks">${t("statsTasks")}</button>
    <button class="stm-stats-tab" data-tab="projects">${t("statsProjects")}</button>
    <button class="stm-stats-tab" data-tab="pomodoro">${t("statsPomodoro")}</button>
  </div>
  <div class="stm-stats-body"></div>
</div>`,
            destroyCallback: () => {
                this.unsub?.();
                this.unsub = null;
                this.dialog = null;
                this.body = null;
            },
        });
        const el = this.dialog.element;
        this.body = el.querySelector(".stm-stats-body");
        el.querySelectorAll<HTMLElement>("[data-tab]").forEach(btn => {
            btn.addEventListener("click", () => {
                this.tab = btn.dataset.tab as StatsTab;
                el.querySelectorAll<HTMLElement>("[data-tab]").forEach(x => x.classList.toggle("is-active", x === btn));
                this.render();
            });
        });
        this.unsub = this.plugin.store.onChange(() => this.render());
        this.render();
    }

    private card(label: string, value: string, tone = ""): string {
        return `<div class="stm-stat-card ${tone}"><div class="stm-stat-label">${label}</div><div class="stm-stat-value">${value}</div></div>`;
    }

    private render(): void {
        if (!this.body) return;
        const t = this.plugin.t;
        const store = this.plugin.store;
        const today = logicalToday(store.settings.dayStartTime);
        if (this.tab === "tasks") {
            const tasks = store.tasks.filter(x => x.status !== "abandoned");
            const done = tasks.filter(x => !!x.completedAt).length;
            const overdue = tasks.filter(x => !x.completedAt && x.startDate && x.startDate < today).length;
            const doing = tasks.filter(x => !x.completedAt && x.status === "doing").length;
            const todo = tasks.length - done - doing;
            const rate = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
            const days: Array<{ label: string; count: number }> = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                const count = store.tasks.filter(x => x.completedAt && new Date(x.completedAt).toDateString() === d.toDateString()).length;
                days.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, count });
            }
            const max = Math.max(1, ...days.map(x => x.count));
            this.body.innerHTML = `
<div class="stm-stat-cards">
  ${this.card(t("statsTotal"), String(tasks.length))}
  ${this.card(t("statsDone"), String(done), "is-green")}
  ${this.card(t("statsDoing"), String(doing), "is-blue")}
  ${this.card(t("statsOverdue"), String(overdue), "is-red")}
</div>
<div class="stm-stat-panel">
  <div class="stm-stat-panel-head"><span>${t("statsCompletion")}</span><strong>${rate}%</strong></div>
  <div class="stm-stat-progress"><span style="width:${rate}%"></span></div>
  <div class="stm-stat-sub">${t("statsTodo")} ${todo} · ${t("statsDone")} ${done}</div>
</div>
<div class="stm-stat-panel">
  <div class="stm-stat-panel-head"><span>${t("statsLast7")}</span></div>
  <div class="stm-stat-bars">
    ${days.map(day => `<div class="stm-stat-bar"><div class="stm-stat-bar-fill" style="height:${Math.max(4, Math.round(day.count / max * 100))}%"></div><span>${day.label}</span><em>${day.count}</em></div>`).join("")}
  </div>
</div>
${this.heatmapHtml("task", this.taskHeatRange, this.taskCompletionCounts(this.taskHeatProject), t("statsTaskHeatmap"), this.taskHeatProject)}`;
            this.bindHeatmapControls();
            return;
        }
        if (this.tab === "projects") {
            const groups = groupProjects(store.projects);
            const projects = groups.flatMap(g => g.projects);
            const active = projects.filter(p => store.tasks.some(x => x.projectId === p.id && x.status !== "abandoned")).length;
            const rows = projects
                .map(p => {
                    const list = store.tasks.filter(x => x.projectId === p.id && x.status !== "abandoned");
                    const done = list.filter(x => !!x.completedAt).length;
                    return { p, total: list.length, done };
                })
                .sort((a, b) => b.total - a.total);
            const max = Math.max(1, ...rows.map(x => x.total));
            this.body.innerHTML = `
<div class="stm-stat-cards">
  ${this.card(t("statsProjectCount"), String(projects.length))}
  ${this.card(t("statsProjectActive"), String(active), "is-blue")}
  ${this.card(t("statsCategories"), String(groups.length), "is-purple")}
</div>
<div class="stm-stat-panel">
  <div class="stm-stat-panel-head"><span>${t("statsProjectTasks")}</span></div>
  <div class="stm-stat-project-list">
    ${rows.length ? rows.map(({ p, total, done }) => {
        return `<div class="stm-stat-project-row">
          <span class="stm-stat-dot" style="background:${p.color}"></span>
          <span class="stm-stat-project-name">${p.emoji ? p.emoji + " " : ""}${this.escape(p.name)}</span>
          <span class="stm-stat-project-meta">${done}/${total}</span>
          <span class="stm-stat-project-bar"><i style="width:${Math.round(total / max * 100)}%;background:${p.color}"></i></span>
        </div>`;
      }).join("") : `<div class="stm-stat-empty">${t("statsNoProjects")}</div>`}
  </div>
</div>`;
            return;
        }
        const withTomato = store.tasks.filter(x => (x.pomodoroCount || 0) > 0);
        const total = withTomato.reduce((sum, x) => sum + (x.pomodoroCount || 0), 0);
        const minutes = store.tasks.reduce((sum, x) => sum + (x.pomodoroMinutes || 0), 0);
        const top = withTomato.slice().sort((a, b) => (b.pomodoroCount || 0) - (a.pomodoroCount || 0)).slice(0, 8);
        this.body.innerHTML = `
<div class="stm-stat-cards">
  ${this.card(t("statsPomodoroTotal"), String(total), "is-red")}
  ${this.card(t("statsPomodoroMinutes"), String(minutes), "is-blue")}
  ${this.card(t("statsPomodoroTasks"), String(withTomato.length), "is-green")}
</div>
<div class="stm-stat-panel">
  <div class="stm-stat-panel-head"><span>${t("statsPomodoroTop")}</span></div>
  <div class="stm-stat-project-list">
    ${top.length ? top.map(task => `<div class="stm-stat-project-row">
      <span class="stm-stat-dot" style="background:#e2604a"></span>
      <span class="stm-stat-project-name">${this.escape(task.title)}</span>
      <span class="stm-stat-project-meta">🍅 ${task.pomodoroCount || 0}</span>
    </div>`).join("") : `<div class="stm-stat-empty">${t("statsNoPomodoro")}</div>`}
  </div>
</div>
${this.heatmapHtml("pomodoro", this.pomoHeatRange, this.pomodoroCounts(this.pomoHeatProject), t("statsPomodoroHeatmap"), this.pomoHeatProject)}`;
        this.bindHeatmapControls();
    }

    private dateKey(date: Date): string {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }

    private taskCompletionCounts(projectId: string | null): Map<string, number> {
        const counts = new Map<string, number>();
        for (const task of this.plugin.store.tasks) {
            if (!task.completedAt) continue;
            if (projectId && task.projectId !== projectId) continue;
            const key = this.dateKey(new Date(task.completedAt));
            counts.set(key, (counts.get(key) || 0) + 1);
        }
        return counts;
    }

    private pomodoroCounts(projectId: string | null): Map<string, number> {
        const counts = new Map<string, number>();
        for (const task of this.plugin.store.tasks) {
            if (projectId && task.projectId !== projectId) continue;
            for (const [date, value] of Object.entries(task.pomodoroHistory || {})) {
                if (typeof value === "number" && value > 0) counts.set(date, (counts.get(date) || 0) + value);
            }
        }
        return counts;
    }

    private heatmapHtml(kind: "task" | "pomodoro", range: number, counts: Map<string, number>, title: string, projectId: string | null): string {
        const t = this.plugin.t;
        const end = new Date();
        end.setHours(12, 0, 0, 0);
        const start = new Date(end);
        start.setDate(start.getDate() - range + 1);
        const weekStart = this.plugin.store.settings.weekStart;
        const offset = (start.getDay() - weekStart + 7) % 7;
        const first = new Date(start);
        first.setDate(first.getDate() - offset);
        const weeks: Array<Array<{ date: Date; count: number; empty: boolean }>> = [];
        const cursor = new Date(first);
        while (cursor <= end || cursor.getDay() !== weekStart) {
            const week: Array<{ date: Date; count: number; empty: boolean }> = [];
            for (let day = 0; day < 7; day++) {
                const date = new Date(cursor);
                date.setDate(date.getDate() + day);
                const key = this.dateKey(date);
                week.push({ date, count: counts.get(key) || 0, empty: date < start || date > end });
            }
            weeks.push(week);
            cursor.setDate(cursor.getDate() + 7);
            if (weeks.length > 60) break;
        }
        const max = Math.max(1, ...weeks.flat().filter(x => !x.empty).map(x => x.count));
        const cell = (item: { date: Date; count: number; empty: boolean }) => {
            if (item.empty) return `<span class="stm-heatmap-cell is-empty"></span>`;
            const level = item.count <= 0 ? 0 : Math.max(1, Math.ceil(item.count / max * 4));
            return `<span class="stm-heatmap-cell is-level-${level}" title="${this.dateKey(item.date)} · ${item.count}"></span>`;
        };
        const rangeLabels: Record<number, string> = {
            30: t("statsRange30"),
            90: t("statsRange90"),
            180: t("statsRange6m"),
            365: t("statsRange12m"),
        };
        const rangeOptions = [30, 90, 180, 365].map(days => `<option value="${days}" ${range === days ? "selected" : ""}>${rangeLabels[days]}</option>`).join("");
        const projects = groupProjects(this.plugin.store.projects).flatMap(g => g.projects);
        const projectOptions = projects.map(p => `<option value="${p.id}" ${projectId === p.id ? "selected" : ""}>${p.emoji ? p.emoji + " " : ""}${this.escape(p.name)}</option>`).join("");
        let lastMonth = -1;
        let monthStart = 0;
        const monthSpans: Array<{ label: string; start: number; span: number }> = [];
        weeks.forEach((week, index) => {
            const month = week[0].date.getMonth();
            if (month !== lastMonth) {
                if (lastMonth >= 0) monthSpans[monthSpans.length - 1].span = index - monthStart;
                lastMonth = month;
                monthStart = index;
                monthSpans.push({ label: new Intl.DateTimeFormat(undefined, { month: "short" }).format(week[0].date), start: index + 1, span: 1 });
            }
        });
        if (monthSpans.length) monthSpans[monthSpans.length - 1].span = weeks.length - monthStart;
        return `<div class="stm-stat-panel stm-heatmap-panel stm-heatmap-${kind}">
  <div class="stm-stat-panel-head">
    <span>${title}</span>
    <div class="stm-heatmap-controls">
      <select class="b3-select stm-heatmap-project" data-heat-kind="${kind}" data-heat-project>
        <option value="">${t("statsAllProjects")}</option>
        ${projectOptions}
      </select>
      <select class="b3-select stm-heatmap-range" data-heat-kind="${kind}" data-heat-range>${rangeOptions}</select>
    </div>
  </div>
  <div class="stm-heatmap-scroll">
    <div class="stm-heatmap-months" style="grid-template-columns:repeat(${weeks.length}, 11px)">
      ${monthSpans.filter(m => m.span >= 2).map(m => `<span style="grid-column:${m.start} / span ${m.span}">${m.label}</span>`).join("")}
    </div>
    <div class="stm-heatmap-grid">
      ${weeks.map(week => `<div class="stm-heatmap-week">${week.map(cell).join("")}</div>`).join("")}
    </div>
  </div>
  <div class="stm-heatmap-legend"><span>${t("statsHeatmapLess")}</span><i class="is-level-1"></i><i class="is-level-2"></i><i class="is-level-3"></i><i class="is-level-4"></i><span>${t("statsHeatmapMore")}</span></div>
</div>`;
    }

    private bindHeatmapControls(): void {
        if (!this.body) return;
        this.body.querySelectorAll<HTMLSelectElement>("[data-heat-range]").forEach(select => {
            select.addEventListener("change", () => {
                const value = Number(select.value) || 365;
                if (select.dataset.heatKind === "task") this.taskHeatRange = value;
                else this.pomoHeatRange = value;
                this.render();
            });
        });
        this.body.querySelectorAll<HTMLSelectElement>("[data-heat-project]").forEach(select => {
            select.addEventListener("change", () => {
                const value = select.value || null;
                if (select.dataset.heatKind === "task") this.taskHeatProject = value;
                else this.pomoHeatProject = value;
                this.render();
            });
        });
    }

    private escape(value: string): string {
        return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
}
