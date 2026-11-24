import { confirm, showMessage } from "siyuan";
import type STMPlugin from "../index";
import type { Project, Task, TaskItem } from "../types";
import type { Filter } from "../domain/tasks";
import { collectAll, collectCompleted, collectToday, collectUpcoming, countFor, groupItems } from "../domain/tasks";
import { formatDateHuman, formatRelativeTime, logicalToday } from "../domain/date";
import { categoryColor, groupProjects, projectDateRange, projectStartedDays, projectStatus } from "../domain/projects";
import { h } from "../ui/dom";
import { icon } from "../ui/icons";
import { showMenu, menuItem } from "../ui/menu";
import { openBoundBlock } from "../api";
import { deleteTaskWithCleanup } from "../integration/blockBinding";

type PanelView = "tasks" | "projects";

export class TaskPanel {
    private root: HTMLElement;
    private listEl!: HTMLElement;
    private filtersEl!: HTMLElement;
    private searchWrap!: HTMLElement;
    private searchInput!: HTMLInputElement;
    private addBtn!: HTMLButtonElement;
    private viewButtons = new Map<PanelView, HTMLElement>();
    private filter: Filter = "today";
    private view: PanelView = "tasks";
    private query = "";
    private today = "";
    private unsub: (() => void) | null = null;
    private timer: number | null = null;

    constructor(private el: HTMLElement, private plugin: STMPlugin) {
        this.root = el;
    }

    mount(): void {
        this.today = logicalToday(this.plugin.store.settings.dayStartTime);
        this.build();
        this.unsub = this.plugin.store.onChange(() => this.render());
        this.timer = window.setInterval(() => {
            const next = logicalToday(this.plugin.store.settings.dayStartTime);
            if (next !== this.today) {
                this.today = next;
                this.render();
            }
        }, 60_000);
        this.render();
    }

    destroy(): void {
        this.unsub?.();
        this.unsub = null;
        if (this.timer !== null) window.clearInterval(this.timer);
        this.timer = null;
        this.root.innerHTML = "";
    }

    private build(): void {
        const t = this.plugin.t;
        this.root.innerHTML = "";
        this.root.classList.add("stm-panel");

        const switchEl = h("div", { class: "stm-view-switch" });
        const tasksBtn = h("button", {
            class: "stm-view-btn is-active",
            dataset: { view: "tasks" },
            text: t("viewTasks"),
        });
        const projectsBtn = h("button", {
            class: "stm-view-btn",
            dataset: { view: "projects" },
            text: t("viewProjects"),
        });
        tasksBtn.addEventListener("click", () => this.setView("tasks"));
        projectsBtn.addEventListener("click", () => this.setView("projects"));
        this.viewButtons.set("tasks", tasksBtn);
        this.viewButtons.set("projects", projectsBtn);
        switchEl.append(tasksBtn, projectsBtn);

        this.addBtn = h("button", { class: "stm-icon-btn", title: t("newTask"), html: icon("plus", 18) });
        this.addBtn.addEventListener("click", () => this.onAdd());
        const moreBtn = h("button", { class: "stm-icon-btn", title: t("more"), html: icon("more", 18) });
        moreBtn.addEventListener("click", ev => {
            ev.stopPropagation();
            const rect = moreBtn.getBoundingClientRect();
            showMenu(
                [
                    menuItem(t("statistics"), "iconChart", () => this.plugin.openStatistics()),
                    menuItem(t("importData"), "iconDownload", () => this.plugin.openImportDialog()),
                    menuItem(t("importLegacy"), "iconDownload", () => void this.plugin.openLegacyImport()),
                    menuItem(t("exportData"), "iconUpload", () => this.plugin.exportData()),
                    menuItem(t("settings"), "iconSettings", () => this.plugin.openSettings()),
                ],
                { x: rect.right, y: rect.bottom }
            );
        });

        const statsBtn = h("button", {
            class: "stm-stats-entry",
            title: t("statistics"),
            html: `${icon("stats", 15)}<span>${t("statistics")}</span>`,
        });
        statsBtn.addEventListener("click", () => this.plugin.openStatistics());
        const header = h("div", { class: "stm-header" }, [
            statsBtn,
            switchEl,
            h("div", { class: "stm-header-actions" }, [this.addBtn, moreBtn]),
        ]);

        this.filtersEl = h("div", { class: "stm-filters" });
        const filters: Array<{ key: Filter; label: string }> = [
            { key: "today", label: t("filterToday") },
            { key: "upcoming", label: t("filterUpcoming") },
            { key: "all", label: t("filterAll") },
            { key: "done", label: t("filterDone") },
        ];
        for (const f of filters) {
            const btn = h("button", { class: "stm-filter", dataset: { filter: f.key } }, [
                h("span", { text: f.label }),
                h("span", { class: "stm-filter-count" }),
            ]);
            btn.addEventListener("click", () => {
                this.filter = f.key;
                this.render();
            });
            this.filtersEl.append(btn);
        }

        this.searchWrap = h("div", { class: "stm-search" }, [
            h("span", { class: "stm-search-icon", html: icon("search", 14) }),
            h("input", { class: "b3-text-field stm-search-input", attrs: { placeholder: t("searchPlaceholder") } }),
        ]);
        this.searchInput = this.searchWrap.querySelector("input") as HTMLInputElement;
        this.searchInput.addEventListener("input", () => {
            this.query = this.searchInput.value.trim().toLowerCase();
            this.render();
        });

        this.listEl = h("div", { class: "stm-body" });

        const settingsBtn = h("button", { class: "stm-footer-settings", html: icon("settings", 16), title: t("settings") });
        settingsBtn.addEventListener("click", () => this.plugin.openSettings());
        const footer = h("div", { class: "stm-footer" }, [
            settingsBtn,
            h("button", { class: "stm-footer-btn", html: `${icon("board", 15)}<span>${t("kanban")}</span>` }),
            h("button", { class: "stm-footer-btn", html: `${icon("calendar", 15)}<span>${t("calendar")}</span>` }),
            h("button", { class: "stm-footer-btn", html: `${icon("gantt", 15)}<span>${t("gantt")}</span>` }),
        ]);
        footer.children[1].addEventListener("click", () => this.plugin.openKanban());
        footer.children[2].addEventListener("click", () => this.plugin.openCalendar());
        footer.children[3].addEventListener("click", () => this.plugin.openGantt());

        this.root.append(header, this.filtersEl, this.searchWrap, this.listEl, footer);
        this.applyView();
    }

    private setView(view: PanelView): void {
        if (this.view === view) return;
        this.view = view;
        this.applyView();
        this.render();
    }

    private applyView(): void {
        const t = this.plugin.t;
        for (const [key, btn] of this.viewButtons) {
            btn.classList.toggle("is-active", key === this.view);
        }
        this.filtersEl.hidden = this.view !== "tasks";
        this.searchWrap.hidden = this.view !== "tasks";
        this.addBtn.title = this.view === "projects" ? t("newProject") : t("newTask");
    }

    private onAdd(): void {
        if (this.view === "projects") this.plugin.openProjectDialog();
        else this.plugin.openTaskDialog({ date: this.today });
    }

    private render(): void {
        if (!this.listEl) return;
        this.today = logicalToday(this.plugin.store.settings.dayStartTime);
        if (this.view === "projects") {
            this.renderProjects();
            return;
        }
        this.renderTasks();
    }

    private renderTasks(): void {
        const t = this.plugin.t;
        const store = this.plugin.store;
        const all = store.tasks;

        for (const btn of Array.from(this.filtersEl.querySelectorAll<HTMLElement>(".stm-filter"))) {
            const key = btn.dataset.filter as Filter;
            btn.classList.toggle("is-active", key === this.filter);
            const countEl = btn.querySelector(".stm-filter-count");
            const count = countFor(all, key, this.today);
            if (countEl) countEl.textContent = count > 0 ? String(count) : "";
        }

        this.listEl.innerHTML = "";
        const match = (item: TaskItem) => !this.query || item.task.title.toLowerCase().includes(this.query);

        if (this.filter === "done") {
            const items = collectCompleted(all, this.today).filter(i => match({ task: i.task } as TaskItem));
            if (!items.length) {
                this.renderEmpty(t("emptyDone"));
                return;
            }
            const section = h("div", { class: "stm-group stm-done-group" });
            section.append(
                h("div", { class: "stm-group-head" }, [
                    h("span", { class: "stm-group-label stm-done-label", text: t("completedBadge") }),
                    h("span", { class: "stm-group-count", text: String(items.length) }),
                ])
            );
            const list = h("div", { class: "stm-group-items" });
            for (const entry of items) {
                list.append(this.renderCompletedRow(entry.task, entry.date, entry.completedAt));
            }
            section.append(list);
            this.listEl.append(section);
            return;
        }

        let items: TaskItem[];
        if (this.filter === "today") items = collectToday(all, this.today, store.settings.showCompleted);
        else if (this.filter === "upcoming") items = collectUpcoming(all, this.today);
        else items = collectAll(all, this.today);

        items = items.filter(match);
        if (!store.settings.showCompleted) {
            items = items.filter(i => !i.done);
        }

        const groups = groupItems(items, this.today);
        if (!groups.length) {
            this.renderEmpty(this.query ? t("emptySearch") : t("emptyToday"));
            return;
        }

        for (const group of groups) {
            const section = h("div", { class: "stm-group" });
            const head = h("div", { class: "stm-group-head" }, [
                h("span", { class: "stm-group-label", text: this.groupLabel(group.key, group.label) }),
                h("span", { class: "stm-group-count", text: String(group.items.length) }),
            ]);
            const body = h("div", { class: "stm-group-items" });
            for (const item of group.items) body.append(this.renderRow(item));
            section.append(head, body);
            this.listEl.append(section);
        }
    }

    private renderProjects(): void {
        const t = this.plugin.t;
        const store = this.plugin.store;
        this.listEl.innerHTML = "";
        const groups = groupProjects(store.projects);
        if (!groups.length) {
            this.renderProjectsEmpty();
            return;
        }
        for (const group of groups) {
            const section = h("div", { class: "stm-group" });
            const head = h("div", { class: "stm-group-head" }, [
                h("span", { class: "stm-category-dot", style: { background: categoryColor(group.category) } }),
                h("span", { class: "stm-group-label", text: group.category || t("uncategorized") }),
                h("span", { class: "stm-group-count", text: String(group.projects.length) }),
            ]);
            section.append(head);
            const body = h("div", { class: "stm-group-items" });
            for (const project of group.projects) body.append(this.renderProjectRow(project));
            section.append(body);
            this.listEl.append(section);
        }
    }

    private renderProjectRow(project: Project): HTMLElement {
        const t = this.plugin.t;
        const store = this.plugin.store;
        const tasks = store.tasks.filter(x => x.projectId === project.id && x.status !== "abandoned");
        const total = tasks.length;
        const done = tasks.filter(x => !!x.completedAt).length;
        const percent = total > 0 ? Math.round((done / total) * 100) : 0;
        const status = projectStatus(project, this.today);
        const statusKey =
            status === "upcoming"
                ? "projectStatusUpcoming"
                : status === "ended"
                  ? "projectStatusEnded"
                  : "projectStatusActive";
        const started = projectStartedDays(project, this.today);
        const range = projectDateRange(project);
        const emoji = (project.emoji || "📁").trim() || "📁";

        const card = h("div", {
            class: "stm-project-card",
            title: project.note || t("editProject"),
        });
        card.style.setProperty("--stm-project-color", project.color);

        const statusPill = statusKey
            ? h("span", { class: `stm-project-status stm-status-${status}`, text: t(statusKey) })
            : null;
        const top = h("div", { class: "stm-project-card-top" }, [
            h("span", { class: "stm-project-emoji", text: emoji }),
            h("span", { class: "stm-project-card-name", text: project.name }),
            statusPill,
        ]);

        const badges = h("div", { class: "stm-project-badges" });
        if (started !== null) {
            badges.append(h("span", { class: "stm-started-badge", text: t("projectStartedDays", started) }));
        } else if (project.startDate) {
            badges.append(h("span", { class: "stm-upcoming-badge", text: t("projectStatusUpcoming") }));
        }
        if (project.category) {
            const pill = h("span", { class: "stm-category-pill", text: project.category });
            pill.style.setProperty("--stm-category-color", categoryColor(project.category));
            badges.append(pill);
        }
        if (range) {
            badges.append(h("span", { class: "stm-project-date", text: `📅 ${range}` }));
        }

        const progress = h("div", { class: "stm-project-progress" }, [
            h("div", { class: "stm-project-progress-track" }, [
                h("div", { class: "stm-project-progress-fill", style: { width: `${percent}%` } }),
            ]),
            h("span", { class: "stm-project-progress-text", text: `${percent}%` }),
        ]);

        card.append(top, badges);
        if (total > 0) card.append(progress);
        card.addEventListener("click", () => this.plugin.openProjectDialog(project));
        return card;
    }

    private renderProjectsEmpty(): void {
        const t = this.plugin.t;
        const wrap = h("div", { class: "stm-empty" }, [
            h("div", { class: "stm-empty-icon", html: icon("folderPlus", 28) }),
            h("div", { class: "stm-empty-text", text: t("emptyProjects") }),
            h("button", { class: "b3-button b3-button--outline b3-button--small", text: t("newProject") }),
        ]);
        wrap.querySelector("button")?.addEventListener("click", () => this.plugin.openProjectDialog());
        this.listEl.append(wrap);
    }

    private groupLabel(key: string, fallback: string): string {
        const t = this.plugin.t;
        switch (key) {
            case "overdue":
                return t("groupOverdue");
            case "today":
                return t("groupToday");
            case "tomorrow":
                return t("groupTomorrow");
            case "week":
                return t("groupWeek");
            case "later":
                return t("groupLater");
            case "none":
                return t("groupNone");
            case "done":
                return t("completedBadge");
            default:
                return fallback;
        }
    }

    private renderRow(item: TaskItem): HTMLElement {
        const t = this.plugin.t;
        const task = item.task;
        const project = this.plugin.store.getProject(task.projectId);
        const row = h("div", {
            class: `stm-item${item.done ? " is-done" : ""}${item.overdue ? " is-overdue" : ""}`,
            dataset: { id: task.id, date: item.date || "" },
        });

        const check = h("button", {
            class: `stm-check${item.done ? " is-checked" : ""}`,
            attrs: { "aria-label": t("toggleDone") },
            html: icon("check", 12),
        });
        check.addEventListener("click", ev => {
            ev.stopPropagation();
            this.plugin.store.setDone(task.id, item.date);
        });

        const meta: HTMLElement[] = [];
        if (item.done) meta.push(h("span", { class: "stm-done-badge", text: t("completedBadge") }));
        if (project) {
            meta.push(
                h("span", { class: "stm-meta-project" }, [
                    h("span", { class: "stm-dot", style: { background: project.color } }),
                    h("span", { text: project.name }),
                ])
            );
        }
        if (item.date) {
            meta.push(
                h("span", {
                    class: "stm-meta-time",
                    text: `${formatDateHuman(item.date, this.today)}${task.startTime ? ` ${task.startTime}` : ""}`,
                })
            );
        }
        if (task.blockId) {
            const link = h("span", { class: "stm-meta-link", html: icon("link", 12), title: t("boundTask") });
            link.addEventListener("click", ev => {
                ev.stopPropagation();
                openBoundBlock(this.plugin.app, task.blockId!);
            });
            meta.push(link);
        }
        if (task.repeat) meta.push(h("span", { class: "stm-meta-repeat", html: icon("repeat", 12) }));
        if (task.priority !== "none") {
            meta.push(h("span", { class: `stm-priority stm-priority-${task.priority}`, title: t("priority_" + task.priority) }));
        }
        if (task.pomodoroCount > 0) {
            meta.push(h("span", { class: "stm-meta-pomodoro", text: `🍅 ${task.pomodoroCount}`, title: t("pomodoroSessions", task.pomodoroCount) }));
        }

        const title = h("div", { class: "stm-item-title", text: task.title });
        title.title = task.blockId ? t("openDocHint") : t("editTask");
        title.addEventListener("click", ev => {
            ev.stopPropagation();
            if (task.blockId) openBoundBlock(this.plugin.app, task.blockId);
            else this.plugin.openTaskDialog({ task });
        });

        const main = h("div", { class: "stm-item-main" }, [
            title,
            meta.length ? h("div", { class: "stm-item-meta" }, meta) : null,
        ]);

        const timerBtn = h("button", { class: "stm-icon-btn stm-row-timer", html: icon("clock", 14), title: t("pomodoroStart") });
        timerBtn.addEventListener("click", ev => {
            ev.stopPropagation();
            this.plugin.startPomodoro(task.id);
        });

        const more = h("button", { class: "stm-more", html: icon("more", 14), title: t("more") });
        more.addEventListener("click", ev => {
            ev.stopPropagation();
            const rect = more.getBoundingClientRect();
            this.showItemMenu(task, item, { x: rect.left, y: rect.bottom });
        });

        row.addEventListener("click", ev => {
            const target = ev.target as HTMLElement;
            if (target.closest(".stm-check") || target.closest(".stm-more") || target.closest(".stm-row-timer") || target.closest(".stm-item-title")) return;
            this.plugin.openTaskDialog({ task });
        });
        row.addEventListener("contextmenu", ev => {
            ev.preventDefault();
            this.showItemMenu(task, item, { x: ev.clientX, y: ev.clientY });
        });

        row.append(check, main, timerBtn, more);
        return row;
    }

    private renderCompletedRow(task: Task, date: string | null, completedAt: number): HTMLElement {
        const t = this.plugin.t;
        const row = h("div", { class: "stm-item is-done", dataset: { id: task.id, date: date || "" } });
        const check = h("button", { class: "stm-check is-checked", html: icon("check", 12) });
        check.addEventListener("click", ev => {
            ev.stopPropagation();
            this.plugin.store.setDone(task.id, date);
        });
        const title = h("div", { class: "stm-item-title", text: task.title });
        title.title = task.blockId ? t("openDocHint") : t("editTask");
        title.addEventListener("click", ev => {
            ev.stopPropagation();
            if (task.blockId) openBoundBlock(this.plugin.app, task.blockId);
            else this.plugin.openTaskDialog({ task });
        });
        const main = h("div", { class: "stm-item-main" }, [
            title,
            h("div", { class: "stm-item-meta" }, [
                h("span", { class: "stm-done-badge", text: t("completedBadge") }),
                h("span", { text: formatRelativeTime(completedAt) }),
            ]),
        ]);
        const timerBtn = h("button", { class: "stm-icon-btn stm-row-timer", html: icon("clock", 14), title: t("pomodoroStart") });
        timerBtn.addEventListener("click", ev => {
            ev.stopPropagation();
            this.plugin.startPomodoro(task.id);
        });
        const more = h("button", { class: "stm-more", html: icon("more", 14) });
        more.addEventListener("click", ev => {
            ev.stopPropagation();
            const rect = more.getBoundingClientRect();
            this.showItemMenu(task, { task, date, key: task.id, done: true, overdue: false, isRepeat: !!task.repeat }, {
                x: rect.left,
                y: rect.bottom,
            });
        });
        row.addEventListener("click", ev => {
            const target = ev.target as HTMLElement;
            if (target.closest(".stm-check") || target.closest(".stm-more") || target.closest(".stm-row-timer") || target.closest(".stm-item-title")) return;
            this.plugin.openTaskDialog({ task });
        });
        row.append(check, main, timerBtn, more);
        return row;
    }

    private showItemMenu(task: Task, item: TaskItem, pos: { x: number; y: number }): void {
        const t = this.plugin.t;
        const items = [
            menuItem(t("edit"), "iconEdit", () => this.plugin.openTaskDialog({ task })),
            menuItem(item.done ? t("markUndone") : t("markDone"), "iconCheck", () =>
                this.plugin.store.setDone(task.id, item.date)
            ),
        ];
        if (task.blockId) {
            items.push(menuItem(t("openNote"), "iconOpen", () => openBoundBlock(this.plugin.app, task.blockId!)));
        }
        items.push(menuItem(t("pomodoroStart"), "iconClock", () => this.plugin.startPomodoro(task.id)));
        items.push({
            label: "-",
            icon: "",
            click: () => undefined,
        } as any);
        items.push(
            menuItem(t("delete"), "iconTrashcan", () => {
                void this.removeTask(task);
            })
        );
        showMenu(items, pos);
    }

    private removeTask(task: Task): void {
        const doDelete = () => {
            void deleteTaskWithCleanup(this.plugin.store, task.id).then(() => {
                showMessage(this.plugin.t("deleted"), 2000, "info");
            });
        };
        if (this.plugin.store.settings.confirmDelete) {
            confirm(this.plugin.t("deleteTaskTitle"), this.plugin.t("confirmDelete"), doDelete);
        } else {
            doDelete();
        }
    }

    private renderEmpty(text: string): void {
        const t = this.plugin.t;
        const wrap = h("div", { class: "stm-empty" }, [
            h("div", { class: "stm-empty-icon", html: icon("inbox", 28) }),
            h("div", { class: "stm-empty-text", text }),
            h("button", { class: "b3-button b3-button--outline b3-button--small", text: t("newTask") }),
        ]);
        wrap.querySelector("button")?.addEventListener("click", () => this.plugin.openTaskDialog({ date: this.today }));
        this.listEl.append(wrap);
    }
}
