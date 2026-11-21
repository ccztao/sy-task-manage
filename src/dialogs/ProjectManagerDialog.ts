import { Dialog } from "siyuan";
import type STMPlugin from "../index";
import type { Project } from "../types";
import { h, dialogWidth } from "../ui/dom";
import { ProjectDialog } from "./ProjectDialog";
import { categoryColor, groupProjects, projectDateRange, projectStartedDays, projectStatus, type ProjectStatus } from "../domain/projects";
import { logicalToday } from "../domain/date";

const STATUS_KEY: Record<ProjectStatus, string> = {
    none: "projectStatusActive",
    upcoming: "projectStatusUpcoming",
    active: "projectStatusActive",
    ended: "projectStatusEnded",
};

export class ProjectManagerDialog {
    private dialog: Dialog | null = null;
    private listEl: HTMLElement | null = null;

    constructor(private plugin: STMPlugin) {}

    open(): void {
        const t = this.plugin.t;
        this.dialog = new Dialog({
            title: t("manageProjects"),
            content: `
<div class="b3-dialog__content stm-dialog stm-project-manager">
  <div class="stm-project-list"></div>
</div>
<div class="b3-dialog__action">
  <button class="b3-button b3-button--outline" data-act="new">${t("newProject")}</button>
  <div class="fn__flex-1"></div>
  <button class="b3-button b3-button--cancel" data-act="close">${t("close")}</button>
</div>`,
            width: dialogWidth(520),
            destroyCallback: () => {
                this.dialog = null;
                this.listEl = null;
            },
        });
        this.listEl = this.dialog.element.querySelector(".stm-project-list");
        this.dialog.element.querySelector('[data-act="close"]')?.addEventListener("click", () => this.dialog?.destroy());
        this.dialog.element.querySelector('[data-act="new"]')?.addEventListener("click", () => {
            new ProjectDialog(this.plugin).open();
            window.setTimeout(() => this.render(), 50);
        });
        this.render();
    }

    private render(): void {
        const el = this.listEl;
        if (!el) return;
        const t = this.plugin.t;
        const store = this.plugin.store;
        const today = logicalToday(store.settings.dayStartTime);
        el.innerHTML = "";
        if (!store.projects.length) {
            el.append(h("div", { class: "stm-empty-inline", text: t("emptyProjects") }));
            return;
        }
        for (const group of groupProjects(store.projects)) {
            el.append(
                h("div", { class: "stm-category-head" }, [
                    h("span", { class: "stm-category-name", text: group.category || t("uncategorized") }),
                    h("span", { class: "stm-category-count", text: String(group.projects.length) }),
                ])
            );
            for (const project of group.projects) el.append(this.renderRow(project, today));
        }
    }

    private renderRow(project: Project, today: string): HTMLElement {
        const t = this.plugin.t;
        const status = projectStatus(project, today);
        const range = projectDateRange(project);
        const count = this.plugin.store.tasks.filter(x => x.projectId === project.id && x.status !== "abandoned").length;
        const started = projectStartedDays(project, today);
        const metaParts = [
            range,
            started !== null ? t("projectStartedDays", started) : "",
            t(STATUS_KEY[status]),
            t("taskCount", count),
        ].filter(Boolean);

        const row = h("div", { class: "stm-project-row" }, [
            h("span", { class: "stm-project-dot", style: { background: project.color } }),
            h("div", { class: "stm-project-row-main" }, [
                h("div", { class: "stm-project-row-title" }, [
                    h("span", { class: "stm-project-row-name", text: `${project.emoji || "📁"} ${project.name}` }),
                    (() => {
                        const badge = h("span", { class: "stm-category-badge", text: project.category || t("uncategorized") });
                        badge.style.setProperty("--stm-category-color", categoryColor(project.category));
                        return badge;
                    })(),
                ]),
                h("div", { class: "stm-project-row-meta", text: metaParts.join(" · ") }),
            ]),
            h("button", {
                class: "b3-button b3-button--text b3-button--small",
                text: t("edit"),
                on: {
                    click: ev => {
                        ev.stopPropagation();
                        new ProjectDialog(this.plugin, project).open();
                        window.setTimeout(() => this.render(), 50);
                    },
                },
            }),
        ]);
        row.title = project.note || "";
        row.addEventListener("click", () => {
            new ProjectDialog(this.plugin, project).open();
            window.setTimeout(() => this.render(), 50);
        });
        return row;
    }
}
