import { Dialog, showMessage } from "siyuan";
import type STMPlugin from "../index";
import { dialogWidth } from "../ui/dom";
import { groupProjects } from "../domain/projects";
import { parseQuickAdd } from "../domain/quickAdd";

export class QuickAddDialog {
    private dialog: Dialog | null = null;

    constructor(private plugin: STMPlugin, private projectId: string | null = null) {}

    open(): void {
        const t = this.plugin.t;
        const projects = groupProjects(this.plugin.store.projects).flatMap(g => g.projects);
        const options = projects
            .map(p => `<option value="${p.id}" ${this.projectId === p.id ? "selected" : ""}>${p.emoji ? p.emoji + " " : ""}${p.name}</option>`)
            .join("");
        this.dialog = new Dialog({
            title: t("quickAddTitle"),
            width: dialogWidth(460),
            content: `<div class="b3-dialog__content stm-dialog stm-quick-dialog">
  <input class="b3-text-field stm-quick-input" placeholder="${t("quickAddPlaceholder")}" spellcheck="false" autofocus>
  <div class="stm-quick-row">
    <select class="b3-select stm-quick-project"><option value="">${t("noProject")}</option>${options}</select>
    <span class="stm-quick-hint">${t("quickAddHint")}</span>
  </div>
</div>
<div class="b3-dialog__action">
  <button class="b3-button b3-button--cancel" data-act="cancel">${t("cancel")}</button>
  <button class="b3-button b3-button--text" data-act="save">${t("save")}</button>
</div>`,
        });
        const el = this.dialog.element;
        const input = el.querySelector<HTMLInputElement>(".stm-quick-input");
        const project = el.querySelector<HTMLSelectElement>(".stm-quick-project");
        const submit = () => {
            const value = input?.value.trim();
            if (!value) return;
            const parsed = parseQuickAdd(value, this.plugin.today());
            const task = this.plugin.store.createTask({
                title: parsed.title,
                startDate: parsed.date,
                startTime: parsed.time,
                projectId: project?.value || null,
            });
            void this.plugin.store.flush();
            showMessage(t("quickAddCreated", task.title), 3000, "info");
            this.dialog?.destroy();
        };
        input?.addEventListener("keydown", ev => {
            if (ev.key === "Enter") {
                ev.preventDefault();
                submit();
            }
        });
        el.querySelector('[data-act="save"]')?.addEventListener("click", submit);
        el.querySelector('[data-act="cancel"]')?.addEventListener("click", () => this.dialog?.destroy());
        input?.focus();
    }
}
