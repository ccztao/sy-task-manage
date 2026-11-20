import { Dialog, confirm, getActiveEditor, getAllEditor, showMessage } from "siyuan";
import type STMPlugin from "../index";
import type { Project } from "../types";
import { escapeHtml } from "../ui/dom";
import { getBlockTitle } from "../integration/blockBinding";
import { openEmojiPicker } from "../ui/emojiPicker";

export const PROJECT_EMOJIS = ["📁", "🏠", "💼", "🎯", "📚", "🧪", "💡", "🏃", "❤️", "🌱", "💰", "✈️", "🎨", "🎵", "⚙️", "📌"];

export const PROJECT_COLORS = [
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
    "#ef4444",
    "#f59e0b",
    "#10b981",
    "#14b8a6",
    "#64748b",
];

export class ProjectDialog {
    private dialog: Dialog | null = null;
    private el: HTMLElement | null = null;
    private emojiPickerClose: (() => void) | null = null;

    constructor(private plugin: STMPlugin, private project: Project | null = null) {}

    open(): void {
        const t = this.plugin.t;
        const project = this.project;
        const color = project?.color || PROJECT_COLORS[0];
        const listId = `stm-project-categories-${Date.now()}`;
        const categories = [...new Set(this.plugin.store.projects.map(p => (p.category || "").trim()).filter(Boolean))];
        const content = `
<div class="b3-dialog__content stm-dialog">
  <label class="stm-field stm-field-full">
    <span>${t("projectName")}</span>
    <input class="b3-text-field stm-project-name" value="${escapeHtml(project?.name || "")}" placeholder="${t("projectNamePlaceholder")}">
  </label>
  <div class="stm-field stm-field-full">
    <span>${t("projectEmoji")}</span>
    <div class="stm-emoji-row">
      <input class="b3-text-field stm-project-emoji" maxlength="4" value="${escapeHtml(project?.emoji || "")}" placeholder="📁">
      <div class="stm-emoji-presets">
        ${PROJECT_EMOJIS.map(e => `<button type="button" class="stm-emoji-btn" data-emoji="${e}">${e}</button>`).join("")}
        <button type="button" class="stm-emoji-more" data-act="more-emoji">${t("moreEmojis")}</button>
      </div>
    </div>
  </div>
  <div class="stm-field stm-field-full">
    <span>${t("projectDoc")}</span>
    <div class="stm-doc-row">
      <input class="b3-text-field stm-project-doc" value="${escapeHtml(project?.docId || "")}" placeholder="${t("projectDocPlaceholder")}">
      <button type="button" class="b3-button b3-button--outline b3-button--small" data-act="use-doc">${t("useCurrentDoc")}</button>
      <button type="button" class="b3-button b3-button--outline b3-button--small" data-act="clear-doc">${t("clear")}</button>
    </div>
    <span class="stm-doc-name"></span>
  </div>
  <div class="stm-form-grid">
    <label class="stm-field">
      <span>${t("projectCategory")}</span>
      <input class="b3-text-field stm-project-category" list="${listId}" value="${escapeHtml(project?.category || "")}" placeholder="${t("projectCategoryPlaceholder")}">
      <datalist id="${listId}">${categories.map(c => `<option value="${escapeHtml(c)}"></option>`).join("")}</datalist>
    </label>
    <label class="stm-field">
      <span>${t("projectStartDate")}</span>
      <input class="b3-text-field" type="date" data-field="start" value="${project?.startDate || ""}">
    </label>
    <label class="stm-field">
      <span>${t("projectEndDate")}</span>
      <input class="b3-text-field" type="date" data-field="end" value="${project?.endDate || ""}">
    </label>
  </div>
  <div class="stm-field stm-field-full">
    <span>${t("projectColor")}</span>
    <div class="stm-color-row">
      ${PROJECT_COLORS.map(
          c => `<button class="stm-color ${c === color ? "is-active" : ""}" data-color="${c}" style="--stm-color:${c}" aria-label="${c}"></button>`
      ).join("")}
      <label class="stm-color-custom" title="${t("customColor")}" style="--stm-custom-color:${color}">
        <input type="color" class="stm-color-picker" value="${color}" aria-label="${t("customColor")}">
      </label>
    </div>
  </div>
  <label class="stm-field stm-field-full">
    <span>${t("note")}</span>
    <textarea class="b3-text-field fn__block" rows="3" placeholder="${t("projectNotePlaceholder")}">${escapeHtml(project?.note || "")}</textarea>
  </label>
</div>
<div class="b3-dialog__action">
  ${project ? `<button class="b3-button b3-button--cancel" data-act="delete">${t("deleteProject")}</button>` : ""}
  <div class="fn__flex-1"></div>
  <button class="b3-button b3-button--cancel" data-act="cancel">${t("cancel")}</button>
  <button class="b3-button b3-button--text" data-act="save">${t("save")}</button>
</div>`;
        this.dialog = new Dialog({
            title: project ? t("editProject") : t("newProject"),
            content,
            width: "500px",
            destroyCallback: () => {
                this.emojiPickerClose?.();
                this.emojiPickerClose = null;
                this.dialog = null;
                this.el = null;
            },
        });
        this.el = this.dialog.element;
        let selected = color;
        const picker = this.el.querySelector<HTMLInputElement>(".stm-color-picker");
        const customLabel = this.el.querySelector<HTMLElement>(".stm-color-custom");
        const setCustomColor = (value: string) => customLabel?.style.setProperty("--stm-custom-color", value);
        this.el.querySelectorAll<HTMLElement>(".stm-color").forEach(btn => {
            btn.addEventListener("click", () => {
                selected = btn.dataset.color || color;
                if (picker) picker.value = selected;
                setCustomColor(selected);
                this.el?.querySelectorAll(".stm-color").forEach(b => b.classList.toggle("is-active", b === btn));
            });
        });
        picker?.addEventListener("input", () => {
            selected = picker.value;
            setCustomColor(selected);
            this.el?.querySelectorAll(".stm-color").forEach(b => b.classList.remove("is-active"));
        });
        this.el.querySelector('[data-act="cancel"]')?.addEventListener("click", () => this.dialog?.destroy());
        this.el.querySelector('[data-act="save"]')?.addEventListener("click", () => this.save(selected));
        this.el.querySelector('[data-act="delete"]')?.addEventListener("click", () => void this.remove());
        const emojiInput = this.el.querySelector<HTMLInputElement>(".stm-project-emoji");
        this.el.querySelectorAll<HTMLElement>(".stm-emoji-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                if (emojiInput) emojiInput.value = btn.dataset.emoji || "";
            });
        });
        const moreEmojiBtn = this.el.querySelector<HTMLElement>('[data-act="more-emoji"]');
        moreEmojiBtn?.addEventListener("click", ev => {
            ev.preventDefault();
            this.emojiPickerClose?.();
            this.emojiPickerClose = openEmojiPicker(moreEmojiBtn, emoji => {
                if (emojiInput) emojiInput.value = emoji;
                this.emojiPickerClose = null;
            });
        });
        const docInput = this.el.querySelector<HTMLInputElement>(".stm-project-doc");
        const docName = this.el.querySelector<HTMLElement>(".stm-doc-name");
        const refreshDocName = async () => {
            if (!docName) return;
            const id = (docInput?.value || "").trim();
            if (!id) {
                docName.textContent = t("docNotLinked");
                return;
            }
            const title = await getBlockTitle(id);
            docName.textContent = title ? `${t("docLinked")}：${title}` : `${t("docLinked")}：${id}`;
        };
        void refreshDocName();
        docInput?.addEventListener("change", () => void refreshDocName());
        this.el.querySelector('[data-act="use-doc"]')?.addEventListener("click", async () => {
            let rootId = "";
            try {
                const editor = getActiveEditor();
                rootId = (editor as any)?.protyle?.block?.rootID || (editor as any)?.block?.rootID || "";
                if (!rootId) {
                    const editors = getAllEditor();
                    const last = editors[editors.length - 1];
                    rootId = (last as any)?.protyle?.block?.rootID || (last as any)?.block?.rootID || "";
                }
            } catch {
                rootId = "";
            }
            if (!rootId) {
                showMessage(t("noActiveDoc"), 3000, "info");
                return;
            }
            if (docInput) docInput.value = rootId;
            await refreshDocName();
        });
        this.el.querySelector('[data-act="clear-doc"]')?.addEventListener("click", async () => {
            if (docInput) docInput.value = "";
            await refreshDocName();
        });
        const nameInput = this.el.querySelector<HTMLInputElement>(".stm-project-name");
        nameInput?.focus();
        this.dialog.bindInput(nameInput!, () => this.save(selected));
    }

    private save(color: string): void {
        const t = this.plugin.t;
        const name = (this.el?.querySelector<HTMLInputElement>(".stm-project-name")?.value || "").trim();
        const category = (this.el?.querySelector<HTMLInputElement>(".stm-project-category")?.value || "").trim();
        const startDate = this.el?.querySelector<HTMLInputElement>('[data-field="start"]')?.value || null;
        const endDate = this.el?.querySelector<HTMLInputElement>('[data-field="end"]')?.value || null;
        const note = this.el?.querySelector<HTMLTextAreaElement>("textarea")?.value || "";
        const docId = (this.el?.querySelector<HTMLInputElement>(".stm-project-doc")?.value || "").trim() || null;
        const emoji = (this.el?.querySelector<HTMLInputElement>(".stm-project-emoji")?.value || "").trim();
        if (!name) {
            showMessage(t("projectNameRequired"), 3000, "error");
            return;
        }
        if (startDate && endDate && endDate < startDate) {
            showMessage(t("projectDateInvalid"), 3000, "error");
            return;
        }
        if (this.project) {
            this.plugin.store.updateProject(this.project.id, { name, color, note, category, emoji, docId, startDate, endDate });
        } else {
            this.plugin.store.createProject({ name, color, note, category, emoji, docId, startDate, endDate });
        }
        this.dialog?.destroy();
    }

    private remove(): void {
        if (!this.project) return;
        confirm(this.plugin.t("deleteProject"), this.plugin.t("confirmDeleteProject"), () => {
            if (!this.project) return;
            this.plugin.store.deleteProject(this.project.id);
            this.dialog?.destroy();
        });
    }
}
