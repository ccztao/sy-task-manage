import { confirm, showMessage } from "siyuan";
import type STMPlugin from "../index";
import type { Task, TaskStatus } from "../types";
import { PRIORITY_WEIGHT } from "../types";
import { formatDateHuman, logicalToday } from "../domain/date";
import { groupProjects } from "../domain/projects";
import { maskText } from "../ui/privacy";
import { h } from "../ui/dom";
import { icon } from "../ui/icons";
import { deleteTaskWithCleanup } from "../integration/blockBinding";

const STATUSES: Array<{ value: TaskStatus | "all"; key: string }> = [
    { value: "all", key: "tableAllStatus" },
    { value: "todo", key: "status_todo" },
    { value: "doing", key: "status_doing" },
    { value: "done", key: "status_done" },
    { value: "abandoned", key: "status_abandoned" },
];

export class TableView {
    private root: HTMLElement;
    private bodyEl: HTMLElement | null = null;
    private bulkEl: HTMLElement | null = null;
    private selected = new Set<string>();
    private query = "";
    private projectId: string | null = null;
    private status: TaskStatus | "all" = "all";
    private unsub: (() => void) | null = null;

    constructor(el: HTMLElement, private plugin: STMPlugin) {
        this.root = el;
    }

    mount(): void {
        const t = this.plugin.t;
        this.root.classList.add("stm-table-root");
        this.root.innerHTML = "";

        const search = h("div", { class: "stm-search stm-table-search" }, [
            h("span", { class: "stm-search-icon", html: icon("search", 14) }),
            h("input", { class: "b3-text-field stm-search-input", attrs: { placeholder: t("searchPlaceholder") } }),
        ]);
        const searchInput = search.querySelector("input") as HTMLInputElement;
        searchInput.addEventListener("input", () => {
            this.query = searchInput.value.trim().toLowerCase();
            this.render();
        });

        const project = h("select", { class: "b3-select stm-table-filter" }) as HTMLSelectElement;
        project.append(new Option(t("allProjects"), ""));
        for (const group of groupProjects(this.plugin.store.projects)) {
            const label = group.category || t("uncategorized");
            project.append(new Option(`▸ ${label}`, `cat:${encodeURIComponent(group.category || "__none__")}`));
            for (const p of group.projects) project.append(new Option(`${p.emoji ? p.emoji + " " : ""}${p.name}`, p.id));
        }
        project.addEventListener("change", () => {
            const value = project.value;
            if (value.startsWith("cat:")) this.projectId = `cat:${decodeURIComponent(value.slice(4))}`;
            else this.projectId = value || null;
            this.render();
        });

        const status = h("select", { class: "b3-select stm-table-filter" }) as HTMLSelectElement;
        for (const item of STATUSES) status.append(new Option(t(item.key), item.value));
        status.addEventListener("change", () => {
            this.status = status.value as TaskStatus | "all";
            this.render();
        });

        const add = h("button", { class: "b3-button b3-button--text stm-btn", html: `${icon("plus", 14)}<span>${t("newTask")}</span>` });
        add.addEventListener("click", () => this.plugin.openTaskDialog({ date: logicalToday(this.plugin.store.settings.dayStartTime) }));

        const header = h("div", { class: "stm-table-header" }, [
            h("div", { class: "stm-kanban-title", text: t("tableTitle") }),
            search,
            h("div", { class: "fn__flex-1" }),
            project,
            status,
            add,
        ]);

        this.bulkEl = h("div", { class: "stm-table-bulk" });
        this.bulkEl.hidden = true;
        this.bodyEl = h("div", { class: "stm-table-scroll" });
        this.root.append(header, this.bulkEl, this.bodyEl);
        this.unsub = this.plugin.store.onChange(() => this.render());
        this.render();
    }

    destroy(): void {
        this.unsub?.();
        this.unsub = null;
        this.root.innerHTML = "";
    }

    private visibleTasks(): Task[] {
        const store = this.plugin.store;
        let tasks = store.tasks.filter(x => !x.parentId);
        if (this.status !== "all") tasks = tasks.filter(x => x.status === this.status);
        if (this.projectId) {
            if (this.projectId.startsWith("cat:")) {
                const category = this.projectId.slice(4) === "__none__" ? "" : this.projectId.slice(4);
                tasks = tasks.filter(x => (store.getProject(x.projectId)?.category || "") === category);
            } else {
                tasks = tasks.filter(x => x.projectId === this.projectId);
            }
        }
        if (this.query) tasks = tasks.filter(x => x.title.toLowerCase().includes(this.query) || x.note.toLowerCase().includes(this.query));
        return tasks.sort((a, b) => {
            const pa = PRIORITY_WEIGHT[a.priority] || 0;
            const pb = PRIORITY_WEIGHT[b.priority] || 0;
            if (pa !== pb) return pb - pa;
            return (a.startDate || "9999-99-99").localeCompare(b.startDate || "9999-99-99");
        });
    }

    private render(): void {
        if (!this.bodyEl || !this.bulkEl) return;
        const t = this.plugin.t;
        const store = this.plugin.store;
        const today = logicalToday(store.settings.dayStartTime);
        const tasks = this.visibleTasks();
        const visibleIds = new Set(tasks.map(x => x.id));
        for (const id of [...this.selected]) if (!visibleIds.has(id)) this.selected.delete(id);

        this.bodyEl.innerHTML = "";
        if (!tasks.length) {
            this.bodyEl.append(h("div", { class: "stm-table-empty", text: t("tableEmpty") }));
            this.renderBulk();
            return;
        }

        const table = h("table", { class: "stm-table" });
        const thead = h("thead");
        const headRow = h("tr");
        const allCheck = h("input", { class: "b3-checkbox", attrs: { type: "checkbox" } }) as HTMLInputElement;
        allCheck.checked = tasks.length > 0 && tasks.every(x => this.selected.has(x.id));
        allCheck.addEventListener("change", () => {
            this.selected.clear();
            if (allCheck.checked) tasks.forEach(x => this.selected.add(x.id));
            this.render();
        });
        headRow.append(
            h("th", { class: "stm-table-check" }, [allCheck]),
            h("th", { text: t("tableTask") }),
            h("th", { text: t("tableDate") }),
            h("th", { text: t("project") }),
            h("th", { text: t("status") }),
            h("th", { text: t("priority") }),
            h("th", { text: t("tableDoneAt") })
        );
        thead.append(headRow);
        table.append(thead);

        const tbody = h("tbody");
        const privacy = !!store.settings.privacyMode;
        for (const task of tasks) {
            const project = store.getProject(task.projectId);
            const doneAt = task.completedAt ? new Date(task.completedAt) : null;
            const row = h("tr", {
                class: `stm-table-row${task.completedAt ? " is-done" : ""}${task.status === "abandoned" ? " is-abandoned" : ""}`,
                dataset: { id: task.id },
            });
            const cb = h("input", { class: "b3-checkbox", attrs: { type: "checkbox" } }) as HTMLInputElement;
            cb.checked = this.selected.has(task.id);
            cb.addEventListener("click", ev => ev.stopPropagation());
            cb.addEventListener("change", () => {
                if (cb.checked) this.selected.add(task.id); else this.selected.delete(task.id);
                this.render();
            });
            const title = h("td", { class: "stm-table-title", text: privacy ? maskText(task.title) : task.title });
            const children = store.tasks.filter(x => x.parentId === task.id);
            if (children.length) {
                const doneChildren = children.filter(x => !!x.completedAt).length;
                const percent = Math.round((doneChildren / children.length) * 100);
                const badge = h("span", { class: "stm-table-progress" }, [
                    h("span", { class: "stm-subtask-ring" }),
                    h("span", { text: `${doneChildren}/${children.length}` }),
                ]);
                badge.style.setProperty("--stm-subtask-progress", `${percent}%`);
                title.append(badge);
            }
            if (task.blockId) title.append(h("span", { class: "stm-table-link", html: icon("link", 11) }));
            const date = h("td", { class: "stm-table-date", text: task.startDate ? `${formatDateHuman(task.startDate, today)}${task.startTime ? ` ${task.startTime}` : ""}` : "—" });
            const projectCell = h("td");
            if (project) {
                projectCell.append(h("span", { class: "stm-table-project" }, [
                    h("span", { class: "stm-dot", style: { background: project.color } }),
                    h("span", { text: privacy ? maskText(project.name) : project.name }),
                ]));
            } else projectCell.textContent = t("noProject");
            const statusCell = h("td", {}, [h("span", { class: `stm-status-pill stm-status-${task.status}`, text: t(`status_${task.status}`) })]);
            const priorityCell = h("td", { class: "stm-table-priority", text: task.priority === "none" ? "—" : t(`priority_${task.priority}`) });
            const doneCell = h("td", { class: "stm-table-date", text: doneAt ? `${doneAt.getFullYear()}-${String(doneAt.getMonth() + 1).padStart(2, "0")}-${String(doneAt.getDate()).padStart(2, "0")} ${String(doneAt.getHours()).padStart(2, "0")}:${String(doneAt.getMinutes()).padStart(2, "0")}` : "—" });
            row.append(h("td", { class: "stm-table-check" }, [cb]), title, date, projectCell, statusCell, priorityCell, doneCell);
            row.addEventListener("click", ev => {
                if ((ev.target as HTMLElement).closest("input,button,a")) return;
                this.plugin.openTaskDialog({ task });
            });
            tbody.append(row);
        }
        table.append(tbody);
        this.bodyEl.append(table);
        this.renderBulk();
    }

    private renderBulk(): void {
        if (!this.bulkEl) return;
        const t = this.plugin.t;
        const store = this.plugin.store;
        const count = this.selected.size;
        this.bulkEl.hidden = count === 0;
        this.bulkEl.innerHTML = "";
        if (!count) return;
        const projects = groupProjects(store.projects).flatMap(g => g.projects);
        const projectSelect = h("select", { class: "b3-select stm-bulk-select" }) as HTMLSelectElement;
        projectSelect.append(new Option(t("bulkMoveProject"), ""));
        for (const p of projects) projectSelect.append(new Option(`${p.emoji ? p.emoji + " " : ""}${p.name}`, p.id));
        projectSelect.addEventListener("change", () => {
            if (!projectSelect.value) return;
            for (const id of this.selected) store.updateTask(id, { projectId: projectSelect.value });
            void store.flush();
        });
        const dateInput = h("input", { class: "b3-text-field stm-bulk-date", attrs: { type: "date", title: t("bulkMoveDate") } }) as HTMLInputElement;
        dateInput.addEventListener("change", () => {
            if (!dateInput.value) return;
            for (const id of this.selected) store.updateTask(id, { startDate: dateInput.value });
            void store.flush();
        });
        const doneBtn = h("button", { class: "b3-button b3-button--outline", text: t("bulkDone") });
        doneBtn.addEventListener("click", () => {
            for (const id of this.selected) {
                const task = store.getTask(id);
                if (task && !task.completedAt) store.setDone(id, null);
            }
            void store.flush();
        });
        const reopenBtn = h("button", { class: "b3-button b3-button--outline", text: t("bulkReopen") });
        reopenBtn.addEventListener("click", () => {
            for (const id of this.selected) store.updateTask(id, { status: "todo", completedAt: null });
            void store.flush();
        });
        const deleteBtn = h("button", { class: "b3-button b3-button--cancel stm-bulk-delete", text: t("bulkDelete") });
        deleteBtn.addEventListener("click", () => {
            const doDelete = () => {
                void (async () => {
                    for (const id of [...this.selected]) await deleteTaskWithCleanup(store, id);
                    this.selected.clear();
                    await store.flush();
                    this.render();
                })();
            };
            if (store.settings.confirmDelete) confirm(t("deleteTaskTitle"), t("confirmDelete"), doDelete);
            else doDelete();
        });
        this.bulkEl.append(
            h("span", { class: "stm-bulk-count", text: t("bulkSelected", count) }),
            projectSelect,
            dateInput,
            doneBtn,
            reopenBtn,
            h("div", { class: "fn__flex-1" }),
            deleteBtn
        );
    }
}
