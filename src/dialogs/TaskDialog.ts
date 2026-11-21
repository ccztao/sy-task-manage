import { Dialog, confirm, showMessage } from "siyuan";
import type STMPlugin from "../index";
import type { Priority, Task, TaskStatus } from "../types";
import { dialogWidth, escapeHtml } from "../ui/dom";
import { bindTaskToBlock, deleteTaskWithCleanup, syncBlockTitle, unbindBlock } from "../integration/blockBinding";
import { openBoundBlock } from "../api";
import { moveBlockUnderDate } from "../integration/dateHeadings";
import { contactMentions } from "../integration/contactMentions";
import { todayStr } from "../domain/date";
import { loadContacts } from "../integration/contacts";
import { attachMention } from "../ui/mention";
import { attachTimePicker } from "../ui/timePicker";

export interface TaskDialogOptions {
    task?: Task;
    blockId?: string;
    docId?: string;
    title?: string;
    date?: string | null;
    endDate?: string | null;
    time?: string | null;
    status?: TaskStatus;
    projectId?: string | null;
    /** 从日历/看板直接新建时，保存后自动插入项目关联文档 */
    source?: "calendar" | "kanban";
}

const PRIORITIES: Priority[] = ["none", "low", "medium", "high"];
const REMINDER_OFFSETS = [0, 5, 10, 15, 30, 60, 120] as const;

function reminderLabel(t: (key: string, ...args: Array<string | number>) => string, minutes: number): string {
    if (minutes === 0) return t("reminderOnTime");
    if (minutes === 60) return t("reminder1h");
    if (minutes === 120) return t("reminder2h");
    return t("reminderBeforeMinutes", minutes);
}

export class TaskDialog {
    private dialog: Dialog | null = null;
    private el: HTMLElement | null = null;
    private task: Task | null;
    private mentionCleanups: Array<() => void> = [];
    private timePickerCleanups: Array<() => void> = [];

    constructor(private plugin: STMPlugin, private options: TaskDialogOptions = {}) {
        this.task = options.task || null;
    }

    open(): void {
        const t = this.plugin.t;
        // 同一个块只允许绑定一个事项，重复从菜单进入时直接编辑已有事项
        if (!this.task && this.options.blockId) {
            const existing = this.plugin.store.tasks.find(x => x.blockId === this.options.blockId);
            if (existing) this.task = existing;
        }
        const task = this.task;
        const defaults = {
            title: this.options.title || task?.title || "",
            date: task ? task.startDate || "" : this.options.date ?? todayStr(),
            endDate: task?.endDate || this.options.endDate || "",
            time: task?.startTime || this.options.time || "",
            endTime: task?.endTime || "",
            reminderOffset: task?.reminderOffset ?? 0,
            projectId: task?.projectId || this.options.projectId || "",
            priority: task?.priority || "none",
            status: task?.status || this.options.status || "todo",
            note: task?.note || "",
            freq: task?.repeat?.freq || "none",
            interval: task?.repeat?.interval || 1,
            until: task?.repeat?.until || "",
        };
        const projectOptions = [
            `<option value="">${t("noProject")}</option>`,
            ...this.plugin.store.projects.map(
                p => `<option value="${p.id}" ${p.id === defaults.projectId ? "selected" : ""}>${escapeHtml(p.name)}</option>`
            ),
        ].join("");

        const content = `
<div class="b3-dialog__content stm-dialog">
  <input class="b3-text-field stm-dialog-title" placeholder="${t("taskTitlePlaceholder")}" value="${escapeHtml(defaults.title)}" spellcheck="false">
  <div class="stm-form-section">
    <div class="stm-form-section-title">${t("timeAndReminder")}</div>
    <div class="stm-form-grid">
      <label class="stm-field">
        <span>${t("startDate")}</span>
        <input class="b3-text-field" type="date" data-field="date" value="${defaults.date || ""}">
      </label>
      <label class="stm-field">
        <span>${t("startTime")}</span>
        <input class="b3-text-field" type="text" inputmode="numeric" maxlength="5" placeholder="--:--" data-field="time" data-time-picker value="${defaults.time}">
      </label>
      <label class="stm-field">
        <span>${t("endDate")}</span>
        <input class="b3-text-field" type="date" data-field="endDate" value="${defaults.endDate || ""}">
      </label>
      <label class="stm-field">
        <span>${t("endTime")}</span>
        <input class="b3-text-field" type="text" inputmode="numeric" maxlength="5" placeholder="--:--" data-field="endTime" data-time-picker value="${defaults.endTime}">
      </label>
      <div class="stm-field stm-field-full">
        <span>${t("reminder")}</span>
        <div class="stm-reminder-picker">
          <input type="hidden" data-field="reminderOffset" value="${Number(defaults.reminderOffset) || 0}">
          ${[0, 5, 10, 15].map(minutes => `<button type="button" class="stm-reminder-quick${Number(defaults.reminderOffset) === minutes ? " is-active" : ""}" data-reminder-offset="${minutes}">${reminderLabel(t, minutes)}</button>`).join("")}
          <select class="b3-select stm-reminder-more" data-reminder-more>
            <option value="">${t("reminderMore")}</option>
            ${[30, 60, 120].map(minutes => `<option value="${minutes}" ${Number(defaults.reminderOffset) === minutes ? "selected" : ""}>${reminderLabel(t, minutes)}</option>`).join("")}
          </select>
        </div>
      </div>
    </div>
  </div>
  <div class="stm-form-section">
    <div class="stm-form-section-title">${t("detailsSection")}</div>
    <div class="stm-form-grid">
      <label class="stm-field">
        <span>${t("project")}</span>
        <select class="b3-select" data-field="project">${projectOptions}</select>
      </label>
      <label class="stm-field">
        <span>${t("priority")}</span>
        <select class="b3-select" data-field="priority">
          ${PRIORITIES.map(p => `<option value="${p}" ${p === defaults.priority ? "selected" : ""}>${t("priority_" + p)}</option>`).join("")}
        </select>
      </label>
      <label class="stm-field">
        <span>${t("status")}</span>
        <select class="b3-select" data-field="status">
          <option value="todo" ${defaults.status === "todo" ? "selected" : ""}>${t("status_todo")}</option>
          <option value="doing" ${defaults.status === "doing" ? "selected" : ""}>${t("status_doing")}</option>
          <option value="done" ${defaults.status === "done" ? "selected" : ""}>${t("status_done")}</option>
          <option value="abandoned" ${defaults.status === "abandoned" ? "selected" : ""}>${t("status_abandoned")}</option>
        </select>
      </label>
      <label class="stm-field">
        <span>${t("repeat")}</span>
        <select class="b3-select" data-field="freq">
          <option value="none" ${defaults.freq === "none" ? "selected" : ""}>${t("repeatNone")}</option>
          <option value="daily" ${defaults.freq === "daily" ? "selected" : ""}>${t("repeatDaily")}</option>
          <option value="weekly" ${defaults.freq === "weekly" ? "selected" : ""}>${t("repeatWeekly")}</option>
          <option value="monthly" ${defaults.freq === "monthly" ? "selected" : ""}>${t("repeatMonthly")}</option>
          <option value="yearly" ${defaults.freq === "yearly" ? "selected" : ""}>${t("repeatYearly")}</option>
        </select>
      </label>
    </div>
    <div class="stm-form-grid stm-repeat-extra" ${defaults.freq === "none" ? "hidden" : ""}>
      <label class="stm-field">
        <span>${t("repeatInterval")}</span>
        <input class="b3-text-field" type="number" min="1" max="99" data-field="interval" value="${defaults.interval}">
      </label>
      <label class="stm-field">
        <span>${t("repeatUntil")}</span>
        <input class="b3-text-field" type="date" data-field="until" value="${defaults.until}">
      </label>
    </div>
    <label class="stm-field stm-field-full">
      <span>${t("note")}</span>
      <textarea class="b3-text-field fn__block" rows="1" data-field="note" placeholder="${t("notePlaceholder")}">${escapeHtml(defaults.note)}</textarea>
      <span class="stm-mention-hint">${t("mentionHint")}</span>
    </label>
  </div>
  ${
      task?.blockId
          ? `<div class="stm-bind-row"><span class="stm-bind-label">${t("boundBlock")}</span><code>${task.blockId}</code>
             <button class="b3-button b3-button--outline b3-button--small" data-act="open-block">${t("open")}</button>
             <button class="b3-button b3-button--outline b3-button--small" data-act="unbind">${t("unbind")}</button></div>`
          : this.options.blockId
            ? `<div class="stm-bind-row"><span class="stm-bind-label">${t("willBindBlock")}</span><code>${this.options.blockId}</code></div>`
            : ""
  }
</div>
<div class="b3-dialog__action">
  ${task ? `<button class="b3-button b3-button--cancel" data-act="pomodoro">🍅 ${t("pomodoro")}</button>` : ""}
  ${task ? `<button class="b3-button b3-button--cancel" data-act="delete">${t("delete")}</button>` : ""}
  <div class="fn__flex-1"></div>
  <button class="b3-button b3-button--cancel" data-act="cancel">${t("cancel")}</button>
  <button class="b3-button b3-button--text" data-act="save">${t("save")}</button>
</div>`;

        this.dialog = new Dialog({
            title: task ? t("editTask") : t("newTask"),
            content,
            width: dialogWidth(520),
            destroyCallback: () => {
                this.destroyMentions();
                for (const cleanup of this.timePickerCleanups.splice(0)) cleanup();
                this.el = null;
                this.dialog = null;
            },
        });
        this.el = this.dialog.element;
        this.bind();
        this.setupMentions();
        for (const input of Array.from(this.el.querySelectorAll<HTMLInputElement>("[data-time-picker]"))) {
            this.timePickerCleanups.push(attachTimePicker(input));
        }
        const titleInput = this.el.querySelector<HTMLInputElement>(".stm-dialog-title");
        if (titleInput) {
            titleInput.focus();
            titleInput.select();
            this.dialog.bindInput(titleInput, () => this.save());
        }
    }

    private q<T extends HTMLElement>(sel: string): T | null {
        return this.el?.querySelector<T>(sel) || null;
    }

    private bind(): void {
        const el = this.el;
        if (!el) return;
        const freq = this.q<HTMLSelectElement>('[data-field="freq"]');
        const extra = this.q<HTMLElement>(".stm-repeat-extra");
        freq?.addEventListener("change", () => {
            const show = freq.value !== "none";
            if (extra) extra.hidden = !show;
            if (show) {
                const date = this.q<HTMLInputElement>('[data-field="date"]');
                if (date && !date.value) date.value = todayStr();
            }
        });

        const reminderHidden = this.q<HTMLInputElement>('[data-field="reminderOffset"]');
        const reminderButtons = Array.from(el.querySelectorAll<HTMLButtonElement>("[data-reminder-offset]"));
        const reminderMore = this.q<HTMLSelectElement>("[data-reminder-more]");
        const setReminder = (value: number) => {
            if (reminderHidden) reminderHidden.value = String(value);
            for (const button of reminderButtons) {
                button.classList.toggle("is-active", Number(button.dataset.reminderOffset) === value);
            }
            if (reminderMore) {
                const moreValues = [30, 60, 120];
                reminderMore.value = moreValues.includes(value) ? String(value) : "";
            }
        };
        for (const button of reminderButtons) {
            button.addEventListener("click", () => setReminder(Number(button.dataset.reminderOffset) || 0));
        }
        reminderMore?.addEventListener("change", () => {
            setReminder(Number(reminderMore.value) || 0);
        });

        el.querySelector('[data-act="cancel"]')?.addEventListener("click", () => this.close());
        el.querySelector('[data-act="save"]')?.addEventListener("click", () => this.save());
        el.querySelector('[data-act="delete"]')?.addEventListener("click", () => this.deleteTask());
        el.querySelector('[data-act="open-block"]')?.addEventListener("click", () => {
            if (this.task?.blockId) openBoundBlock(this.plugin.app, this.task.blockId);
        });
        el.querySelector('[data-act="unbind"]')?.addEventListener("click", () => this.unbind());
        el.querySelector('[data-act="pomodoro"]')?.addEventListener("click", () => {
            if (!this.task) return;
            this.plugin.startPomodoro(this.task.id);
            this.close();
        });
    }

    private setupMentions(): void {
        const title = this.q<HTMLInputElement>(".stm-dialog-title");
        const note = this.q<HTMLTextAreaElement>('[data-field="note"]');
        void loadContacts(true).then(contacts => {
            if (!this.el || !contacts.length) return;
            const options = { noMatchText: this.plugin.t("mentionNoMatch") };
            if (title) this.mentionCleanups.push(attachMention(title, contacts, options));
            if (note) this.mentionCleanups.push(attachMention(note, contacts, options));
        });
    }

    private destroyMentions(): void {
        for (const cleanup of this.mentionCleanups.splice(0)) {
            try {
                cleanup();
            } catch (err) {
                console.warn("[stm] cleanup mention failed", err);
            }
        }
    }

    private async unbind(): Promise<void> {
        if (!this.task) return;
        const task = this.task;
        if (task.blockId) await unbindBlock(task.blockId);
        this.plugin.store.updateTask(task.id, { blockId: null, docId: null });
        const row = this.q<HTMLElement>(".stm-bind-row");
        if (row) row.remove();
        this.task = this.plugin.store.getTask(task.id) || task;
    }

    private deleteTask(): void {
        const task = this.task;
        if (!task) return;
        const doDelete = () => {
            void (async () => {
                await deleteTaskWithCleanup(this.plugin.store, task.id);
                this.close();
            })();
        };
        if (this.plugin.store.settings.confirmDelete) {
            confirm(this.plugin.t("deleteTaskTitle"), this.plugin.t("confirmDelete"), doDelete);
        } else {
            doDelete();
        }
    }

    private save(): void {
        const t = this.plugin.t;
        const title = (this.q<HTMLInputElement>(".stm-dialog-title")?.value || "").trim();
        if (!title) {
            showMessage(t("titleRequired"), 3000, "error");
            this.q<HTMLInputElement>(".stm-dialog-title")?.focus();
            return;
        }
        let date = this.q<HTMLInputElement>('[data-field="date"]')?.value || null;
        let endDate = this.q<HTMLInputElement>('[data-field="endDate"]')?.value || null;
        let time = this.q<HTMLInputElement>('[data-field="time"]')?.value || null;
        let endTime = this.q<HTMLInputElement>('[data-field="endTime"]')?.value || null;
        const reminderOffset = Math.max(0, Number(this.q<HTMLInputElement>('[data-field="reminderOffset"]')?.value || 0));
        time = time && /^\d{2}:\d{2}$/.test(time) ? time : null;
        endTime = endTime && /^\d{2}:\d{2}$/.test(endTime) ? endTime : null;
        if (!date) {
            time = null;
            endTime = null;
        }
        if (endDate && !date) date = endDate;
        if (endDate && date && endDate < date) {
            showMessage(t("endDateBeforeStart"), 3000, "error");
            return;
        }
        if (endDate && date && endDate === date) endDate = null;
        const projectId = this.q<HTMLSelectElement>('[data-field="project"]')?.value || null;
        const priority = (this.q<HTMLSelectElement>('[data-field="priority"]')?.value || "none") as Priority;
        const status = (this.q<HTMLSelectElement>('[data-field="status"]')?.value || "todo") as TaskStatus;
        const note = this.q<HTMLTextAreaElement>('[data-field="note"]')?.value || "";
        const freq = this.q<HTMLSelectElement>('[data-field="freq"]')?.value || "none";
        const interval = Math.max(1, Number(this.q<HTMLInputElement>('[data-field="interval"]')?.value || 1));
        const until = this.q<HTMLInputElement>('[data-field="until"]')?.value || null;
        const repeat =
            freq === "none"
                ? null
                : {
                      freq: freq as "daily" | "weekly" | "monthly" | "yearly",
                      interval,
                      until,
                      count: null,
                  };
        if (repeat && !date) date = todayStr();
        // 重复事项用 occurrence 勾选完成，系列本身始终保持待办/进行中
        const effectiveStatus: TaskStatus = repeat && status === "done" ? "todo" : status;

        if (this.task) {
            const previousTitle = this.task.title;
            const previousDate = this.task.startDate;
            const boundBlockId = this.task.blockId;
            const patch: Partial<Task> = {
                title,
                note,
                projectId,
                priority,
                status: effectiveStatus,
                startDate: date,
                endDate,
                startTime: time,
                endTime,
                reminderOffset,
                repeat,
            };
            if (effectiveStatus === "done" && !this.task.completedAt && !this.task.repeat) {
                patch.completedAt = Date.now();
            } else if (effectiveStatus !== "done" && this.task.completedAt) {
                patch.completedAt = null;
            }
            if (effectiveStatus === "abandoned") patch.completedAt = null;
            this.plugin.store.updateTask(this.task.id, patch);
            if (boundBlockId) {
                if (previousTitle !== title) {
                    void syncBlockTitle(boundBlockId, previousTitle, title).then(ok => {
                        if (ok) void contactMentions.linkifyBlock(boundBlockId);
                    });
                }
                if (date && previousDate !== date) {
                    void moveBlockUnderDate(boundBlockId, date, this.plugin.store.settings.dateHeadingLevel);
                }
            }
        } else {
            const task = this.plugin.store.createTask({
                title,
                note,
                startDate: date,
                endDate,
                startTime: time,
                endTime,
                reminderOffset,
                projectId,
                priority,
                status: effectiveStatus,
                blockId: this.options.blockId || null,
                docId: this.options.docId || null,
                repeat,
            });
            if (task.blockId) {
                void bindTaskToBlock(task.id, task.blockId, task.startDate);
            } else if (this.options.source) {
                void this.plugin.insertCreatedTask(task.id);
            }
        }
        this.close();
    }

    private close(): void {
        this.dialog?.destroy();
        this.dialog = null;
        this.el = null;
    }
}
