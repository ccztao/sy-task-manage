import { confirm, showMessage } from "siyuan";
import type STMPlugin from "../index";
import type { Task, TaskStatus } from "../types";
import { PRIORITY_WEIGHT } from "../types";
import { formatDateHuman, logicalToday } from "../domain/date";
import { h } from "../ui/dom";
import { icon } from "../ui/icons";
import { showMenu, menuItem } from "../ui/menu";
import { ProjectManagerDialog } from "../dialogs/ProjectManagerDialog";
import { openBoundBlock } from "../api";
import { maskText } from "../ui/privacy";
import { groupProjects } from "../domain/projects";
import { deleteTaskWithCleanup } from "../integration/blockBinding";
import { expandOccurrences } from "../domain/repeat";

const COLUMNS: Array<{ key: TaskStatus; labelKey: string }> = [
    { key: "todo", labelKey: "status_todo" },
    { key: "doing", labelKey: "status_doing" },
    { key: "done", labelKey: "status_done" },
    { key: "abandoned", labelKey: "status_abandoned" },
];

export class KanbanView {
    private root: HTMLElement;
    private boardEl: HTMLElement | null = null;
    private selectEl: HTMLSelectElement | null = null;
    private privacyBtn: HTMLButtonElement | null = null;
    private projectId: string | null = null;
    private category: string | null = null;
    private unsub: (() => void) | null = null;

    constructor(el: HTMLElement, private plugin: STMPlugin) {
        this.root = el;
    }

    mount(): void {
        const t = this.plugin.t;
        this.root.classList.add("stm-kanban-root");
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
            this.render();
        });
        this.selectEl = select;

        const newBtn = h("button", { class: "b3-button b3-button--text stm-btn", html: `${icon("plus", 14)}<span>${t("newTask")}</span>` });
        newBtn.addEventListener("click", () => this.plugin.openTaskDialog({ date: logicalToday(this.plugin.store.settings.dayStartTime), projectId: this.projectId, source: "kanban" }));
        const projectBtn = h("button", { class: "b3-button b3-button--outline stm-btn", html: `${icon("board", 14)}<span>${t("manageProjects")}</span>` });
        projectBtn.addEventListener("click", () => new ProjectManagerDialog(this.plugin).open());
        const privacyBtn = h("button", { class: "stm-icon-btn stm-privacy-btn" }) as HTMLButtonElement;
        privacyBtn.addEventListener("click", () => this.plugin.togglePrivacy());
        this.privacyBtn = privacyBtn;

        const header = h("div", { class: "stm-kanban-header" }, [
            h("div", { class: "stm-kanban-title", text: t("kanbanTitle") }),
            h("div", { class: "fn__flex-1" }),
            select,
            privacyBtn,
            newBtn,
            projectBtn,
        ]);

        this.boardEl = h("div", { class: "stm-board" });
        this.root.append(header, this.boardEl);
        this.unsub = this.plugin.store.onChange(() => this.render());
        this.render();
    }

    destroy(): void {
        this.unsub?.();
        this.unsub = null;
        this.root.innerHTML = "";
    }

    private render(): void {
        if (!this.boardEl || !this.selectEl) return;
        const t = this.plugin.t;
        const store = this.plugin.store;
        const today = logicalToday(store.settings.dayStartTime);
        if (this.privacyBtn) {
            const on = !!store.settings.privacyMode;
            this.privacyBtn.innerHTML = icon(on ? "eyeOff" : "eye", 16);
            this.privacyBtn.title = on ? t("privacyModeExit") : t("privacyMode");
            this.privacyBtn.classList.toggle("is-active", on);
        }

        // 项目下拉：分类项可直接选，项目项筛选单个项目
        this.selectEl.innerHTML = "";
        this.selectEl.append(new Option(t("allProjects"), ""));
        for (const group of groupProjects(store.projects)) {
            const category = group.category || "";
            const label = category || t("uncategorized");
            this.selectEl.append(new Option(`▸ ${label}（全部）`, `cat:${encodeURIComponent(category || "__none__")}`));
            for (const project of group.projects) {
                this.selectEl.append(
                    new Option(`　${project.emoji ? project.emoji + " " : ""}${project.name}`, project.id)
                );
            }
        }
        this.selectEl.value = this.category !== null
            ? `cat:${encodeURIComponent(this.category || "__none__")}`
            : this.projectId || "";

        this.boardEl.innerHTML = "";
        const tasks = store.tasks.filter(task => {
            if (task.parentId) return false;
            const project = store.getProject(task.projectId);
            if (this.category !== null && (project?.category || "") !== this.category) return false;
            if (this.projectId && task.projectId !== this.projectId) return false;
            if (task.repeat) return true;
            return true;
        });

        for (const col of COLUMNS) {
            const columnTasks = tasks
                .filter(task => this.taskInColumn(task, col.key))
                .sort((a, b) => {
                    const pa = PRIORITY_WEIGHT[a.priority] || 0;
                    const pb = PRIORITY_WEIGHT[b.priority] || 0;
                    if (pa !== pb) return pb - pa;
                    const ad = a.startDate || "9999";
                    const bd = b.startDate || "9999";
                    return ad < bd ? -1 : ad > bd ? 1 : 0;
                });

            const cards = h("div", { class: "stm-cards" });
            for (const task of columnTasks) cards.append(this.renderCard(task, today));

            const column = h("section", {
                class: "stm-column",
                dataset: { status: col.key },
            }, [
                h("header", { class: "stm-column-head" }, [
                    h("span", { class: "stm-column-dot", dataset: { status: col.key } }),
                    h("span", { class: "stm-column-title", text: t(col.labelKey) }),
                    h("span", { class: "stm-column-count", text: String(columnTasks.length) }),
                    h("div", { class: "fn__flex-1" }),
                    h("button", {
                        class: "stm-icon-btn stm-column-add",
                        html: icon("plus", 14),
                        title: t("newTask"),
                    }),
                ]),
                cards,
            ]);
            (column.querySelector(".stm-column-add") as HTMLElement).addEventListener("click", () =>
                this.plugin.openTaskDialog({ date: today, status: col.key, projectId: this.projectId, source: "kanban" })
            );

            column.addEventListener("dragover", ev => {
                ev.preventDefault();
                column.classList.add("is-drop-target");
            });
            column.addEventListener("dragleave", ev => {
                if (!column.contains(ev.relatedTarget as Node)) column.classList.remove("is-drop-target");
            });
            column.addEventListener("drop", ev => {
                ev.preventDefault();
                column.classList.remove("is-drop-target");
                const taskId = ev.dataTransfer?.getData("text/stm-task");
                if (taskId) this.moveTask(taskId, col.key, today);
            });
            this.boardEl!.append(column);
        }
    }

    private taskInColumn(task: Task, status: TaskStatus): boolean {
        if (task.repeat) {
            // 重复事项永远留在进行中的周期里
            return status !== "done" && task.status === status;
        }
        if (status === "done") return !!task.completedAt;
        if (status === "abandoned") return task.status === "abandoned" && !task.completedAt;
        return !task.completedAt && task.status === status;
    }

    private renderCard(task: Task, today: string): HTMLElement {
        const t = this.plugin.t;
        const project = this.plugin.store.getProject(task.projectId);
        const abandoned = task.status === "abandoned";
        const card = h("article", {
            class: `stm-card${task.completedAt ? " is-done" : ""}${abandoned ? " is-abandoned" : ""}`,
            attrs: { draggable: "true" },
            dataset: { id: task.id },
        });

        const privacy = !!this.plugin.store.settings.privacyMode;
        const title = h("div", { class: "stm-card-title", text: privacy ? maskText(task.title) : task.title });
        card.append(title);
        const children = this.plugin.store.tasks.filter(x => x.parentId === task.id);
        if (children.length) {
            const doneCount = children.filter(x => !!x.completedAt).length;
            const percent = Math.round((doneCount / children.length) * 100);
            const badge = h("div", { class: "stm-card-subtasks" }, [
                h("span", { class: "stm-subtask-ring" }),
                h("span", { text: `${doneCount}/${children.length}` }),
            ]);
            badge.style.setProperty("--stm-subtask-progress", `${percent}%`);
            card.append(badge);
        }
        if (task.completedAt) {
            card.append(h("span", { class: "stm-card-done-badge", text: t("completedBadge") }));
        } else if (abandoned) {
            card.append(h("span", { class: "stm-card-abandoned-badge", text: t("status_abandoned") }));
        }

        const meta = h("div", { class: "stm-card-meta" });
        if (project && !this.projectId) {
            meta.append(h("span", { class: "stm-meta-project" }, [
                h("span", { class: "stm-dot", style: { background: project.color } }),
                h("span", { text: privacy ? maskText(project.name) : project.name }),
            ]));
        }
        if (task.startDate) {
            meta.append(h("span", { text: `${formatDateHuman(task.startDate, today)}${task.startTime ? ` ${task.startTime}` : ""}` }));
        } else {
            meta.append(h("span", { class: "stm-meta-muted", text: t("groupNone") }));
        }
        if (task.repeat) meta.append(h("span", { class: "stm-meta-repeat", html: icon("repeat", 12) }));
        if (task.priority !== "none") {
            meta.append(h("span", { class: `stm-priority stm-priority-${task.priority}`, title: t("priority_" + task.priority) }));
        }
        if (meta.childElementCount) card.append(meta);

        card.addEventListener("click", () => this.plugin.openTaskDialog({ task }));
        card.addEventListener("contextmenu", ev => {
            ev.preventDefault();
            this.showCardMenu(task, { x: ev.clientX, y: ev.clientY });
        });
        card.addEventListener("dragstart", ev => {
            ev.dataTransfer?.setData("text/stm-task", task.id);
            if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
            card.classList.add("is-dragging");
        });
        card.addEventListener("dragend", () => card.classList.remove("is-dragging"));
        return card;
    }

    private moveTask(taskId: string, status: TaskStatus, today: string): void {
        const t = this.plugin.t;
        const task = this.plugin.store.getTask(taskId);
        if (!task) return;
        if (task.repeat && status === "done") {
            if (!expandOccurrences(task, today, today, 1).length) {
                showMessage(t("repeatNotToday"), 2500, "info");
                return;
            }
            this.plugin.store.setDone(task.id, today);
            showMessage(t("repeatDoneToday"), 2500, "info");
            return;
        }
        if (status === "done") {
            this.plugin.store.updateTask(task.id, { status: "done", completedAt: Date.now() });
        } else {
            this.plugin.store.updateTask(task.id, { status, completedAt: null });
        }
    }

    private showCardMenu(task: Task, pos: { x: number; y: number }): void {
        const t = this.plugin.t;
        const items = [
            menuItem(t("edit"), "iconEdit", () => this.plugin.openTaskDialog({ task })),
            menuItem(t("status_todo"), "iconCheck", () => this.plugin.store.updateTask(task.id, { status: "todo", completedAt: null })),
            menuItem(t("status_doing"), "iconPlay", () => this.plugin.store.updateTask(task.id, { status: "doing", completedAt: null })),
            menuItem(t("status_done"), "iconCheck", () => this.plugin.store.updateTask(task.id, { status: "done", completedAt: Date.now() })),
        ];
        if (task.blockId) items.push(menuItem(t("openNote"), "iconOpen", () => openBoundBlock(this.plugin.app, task.blockId!)));
        items.push(menuItem(t("pomodoroStart"), "iconClock", () => this.plugin.startPomodoro(task.id)));
        items.push({ label: "-", icon: "", click: () => undefined } as any);
        items.push(
            menuItem(t("delete"), "iconTrashcan", () => {
                const doDelete = () => {
                    void deleteTaskWithCleanup(this.plugin.store, task.id);
                };
                if (this.plugin.store.settings.confirmDelete) {
                    confirm(t("deleteTaskTitle"), t("confirmDelete"), doDelete);
                } else {
                    doDelete();
                }
            })
        );
        showMenu(items, pos);
    }
}
