import { Dialog, Plugin, Setting, confirm, getAllEditor, platformUtils, showMessage, openTab } from "siyuan";
import "./styles.scss";
import { Store } from "./store";
import type { Settings } from "./types";
import { createT, type T } from "./i18n";
import { TaskPanel } from "./views/TaskPanel";
import { KanbanView } from "./views/KanbanView";
import { CalendarView } from "./views/CalendarView";
import { GanttView } from "./views/GanttView";
import { TaskDialog, type TaskDialogOptions } from "./dialogs/TaskDialog";
import { ProjectDialog } from "./dialogs/ProjectDialog";
import { ProjectManagerDialog } from "./dialogs/ProjectManagerDialog";
import { ReminderService } from "./services/reminderService";
import { PomodoroService } from "./services/pomodoroService";
import { STM_SYMBOL } from "./ui/icons";
import { dialogWidth } from "./ui/dom";
import { registerMenus } from "./integration/menus";
import { resolveDateForBlock as resolveBlockDate } from "./integration/blockDate";
import { resolveProjectForBlock as resolveBlockProject } from "./integration/blockProject";
import { installDocumentMention } from "./integration/documentMention";
import { contactMentions } from "./integration/contactMentions";
import { ensureDateHeading, insertTaskBlock, moveBlockUnderDate, pruneEmptyDateHeadings } from "./integration/dateHeadings";
import { bindTaskToBlock, deleteTaskWithCleanup, syncBlockTitle } from "./integration/blockBinding";
import { startBlockSyncPoller, syncTaskFromBlock } from "./integration/blockSync";
import { logicalToday, parseDateFromText } from "./domain/date";

const DOCK_TYPE = "stm-tasks";
const KANBAN_TYPE = "kanban";
const CALENDAR_TYPE = "calendar";
const GANTT_TYPE = "gantt";

function isMobileUi(): boolean {
    try {
        return platformUtils.isInIOS() || platformUtils.isInAndroid() || window.innerWidth <= 720;
    } catch {
        return window.innerWidth <= 720;
    }
}

export default class STMPlugin extends Plugin {
    store!: Store;
    t!: T;

    private panel: TaskPanel | null = null;
    private reminder: ReminderService | null = null;
    private documentMentionCleanup: (() => void) | null = null;
    private menuCleanups: Array<() => void> = [];
    private tabViews = new Map<any, { destroy(): void; resize?(): void }>();
    private onWsMain = (event: any): void => {
        const msg = event?.detail || event;
        if (msg?.cmd !== "transactions") return;
        const txs = Array.isArray(msg.data) ? msg.data : msg.data ? [msg.data] : [];
        for (const tx of txs) {
            for (const op of tx?.doOperations || tx?.operations || []) {
                if (op?.action !== "delete" && op?.action !== "update" && op?.action !== "move") continue;
                const ids = Array.isArray(op.ids) ? op.ids : op.id ? [op.id] : [];
                for (const id of ids) {
                    const task = this.store?.tasks.find(t => t.blockId === id);
                    if (!task) continue;
                    if (op.action === "delete") {
                        this.store.deleteTask(task.id);
                        void contactMentions.removeBlock(id);
                        const roots = new Set<string>();
                        if (task.docId) roots.add(task.docId);
                        try {
                            for (const editor of getAllEditor()) {
                                const rootId = editor?.protyle?.block?.rootID;
                                if (rootId) roots.add(rootId);
                            }
                        } catch {
                            /* ignore */
                        }
                        for (const rootId of roots) void pruneEmptyDateHeadings(rootId);
                    } else {
                        const old = this.blockSyncTimers.get(id);
                        if (old) window.clearTimeout(old);
                        this.blockSyncTimers.set(
                            id,
                            window.setTimeout(() => {
                                this.blockSyncTimers.delete(id);
                                void syncTaskFromBlock(this, id);
                            }, 260)
                        );
                    }
                }
            }
        }
    };

    private blockSyncTimers = new Map<string, number>();
    private blockSyncStop: (() => void) | null = null;
    private pomodoro: PomodoroService | null = null;
    private mobileViewDialog: Dialog | null = null;

    private settingInputs: {
        dock?: HTMLInputElement;
        notifications?: HTMLInputElement;
        reminderTime?: HTMLInputElement;
        dayStart?: HTMLInputElement;
        weekStart?: HTMLSelectElement;
        dateHeadingLevel?: HTMLSelectElement;
        autoTaskFromList?: HTMLInputElement;
        autoTaskHeadingLevel?: HTMLSelectElement;
        calendarColorMode?: HTMLSelectElement;
        privacyMode?: HTMLInputElement;
        showCompleted?: HTMLInputElement;
        confirmDelete?: HTMLInputElement;
    } = {};

    async onload(): Promise<void> {
        this.t = createT(this.i18n);
        this.addIcons(STM_SYMBOL);

        this.store = new Store(this);
        await this.store.load();
        await contactMentions.init(this);
        this.eventBus.on("ws-main", this.onWsMain);

        this.registerDock();
        this.registerTabs();
        this.registerCommands();
        this.menuCleanups = registerMenus(this);
        this.buildSetting();

        this.reminder = new ReminderService({ store: this.store, t: this.t, app: this.app });
        this.reminder.start();
        this.pomodoro = new PomodoroService(this);
        this.blockSyncStop = startBlockSyncPoller(this);
    }

    onLayoutReady(): void {
        this.documentMentionCleanup = installDocumentMention(this);
        if (!this.store.settings.dockEnabled) {
            try {
                this.removeDock(DOCK_TYPE);
            } catch (err) {
                console.warn("[stm] remove dock failed", err);
            }
        }
    }

    async onunload(): Promise<void> {
        this.reminder?.stop();
        this.reminder = null;
        this.documentMentionCleanup?.();
        this.documentMentionCleanup = null;
        this.eventBus.off("ws-main", this.onWsMain);
        for (const timer of this.blockSyncTimers.values()) window.clearTimeout(timer);
        this.blockSyncTimers.clear();
        this.blockSyncStop?.();
        this.blockSyncStop = null;
        this.pomodoro?.stop();
        this.pomodoro = null;
        this.mobileViewDialog?.destroy();
        this.mobileViewDialog = null;
        void contactMentions.stop();
        this.panel?.destroy();
        this.panel = null;
        for (const view of this.tabViews.values()) {
            try {
                view.destroy();
            } catch (err) {
                console.warn("[stm] destroy tab view failed", err);
            }
        }
        this.tabViews.clear();
        for (const cleanup of this.menuCleanups.splice(0)) {
            try {
                cleanup();
            } catch (err) {
                console.warn("[stm] cleanup menu failed", err);
            }
        }
        await this.store?.flush();
    }

    today(): string {
        return logicalToday(this.store.settings.dayStartTime);
    }

    /** 供菜单/命令使用：读取块上下文中的日期标题 */
    async resolveTaskDate(blockId: string): Promise<string | null> {
        return resolveBlockDate(blockId);
    }

    /** 供菜单/命令使用：读取块所属文档关联的项目 */
    async resolveTaskProject(blockId: string): Promise<string | null> {
        return resolveBlockProject(this.store, blockId);
    }

    /** 立即同步联系人改名后的正文引用（也给设置/测试用） */
    async syncContactMentions(): Promise<void> {
        await contactMentions.sync(true);
    }

    /** 确保文档里有某日期的标题（倒序），返回标题块 ID */
    async ensureDateHeading(docId: string, date: string, level?: number): Promise<string | null> {
        return ensureDateHeading(docId, date, level ?? this.store.settings.dateHeadingLevel);
    }

    /** 把任务绑定块移动到对应日期标题下 */
    async moveTaskBlockToDate(taskId: string, date: string): Promise<boolean> {
        const task = this.store.getTask(taskId);
        if (!task?.blockId) return false;
        return moveBlockUnderDate(task.blockId, date, this.store.settings.dateHeadingLevel);
    }

    /** 删除事项并同步清理绑定块（供测试/API 使用） */
    async deleteTask(taskId: string): Promise<void> {
        await deleteTaskWithCleanup(this.store, taskId);
    }

    /** 同步绑定块里的标题文本（保留联系人引用和子块） */
    async syncTaskBlockTitle(taskId: string, oldTitle: string, newTitle: string): Promise<boolean> {
        const task = this.store.getTask(taskId);
        if (!task?.blockId) return false;
        return syncBlockTitle(task.blockId, oldTitle, newTitle);
    }

    /**
     * 日历/看板直接新建事项时：按日期写入项目关联文档，并挂载新块。
     * 没有项目、项目没有关联文档、或事项已有绑定块时不动。
     */
    async insertCreatedTask(taskId: string): Promise<boolean> {
        const task = this.store.getTask(taskId);
        if (!task || task.blockId || !task.startDate) return false;
        const project = task.projectId ? this.store.projects.find(p => p.id === task.projectId) : null;
        const docId = project?.docId;
        if (!docId) return false;
        const blockId = await insertTaskBlock(docId, task.startDate, task.title, this.store.settings.dateHeadingLevel);
        if (!blockId) return false;
        this.store.updateTask(task.id, { blockId });
        await bindTaskToBlock(task.id, blockId, task.startDate);
        return true;
    }

    togglePrivacy(): void {
        this.store.updateSettings({ privacyMode: !this.store.settings.privacyMode });
        void this.store.flush();
    }

    /** 为指定事项启动一个番茄钟 */
    startPomodoro(taskId: string): void {
        this.pomodoro?.start(taskId);
    }

    openSettings(): void {
        try {
            this.setting?.open(this.t("settingsTitle"));
            window.setTimeout(() => {
                const title = this.t("settingsTitle");
                const dialog = Array.from(document.querySelectorAll(".b3-dialog")).find(
                    d => d.querySelector(".b3-dialog__header")?.textContent?.trim() === title
                );
                if (!dialog) return;
                dialog.classList.add("stm-settings-dialog");
                dialog.querySelectorAll<HTMLElement>(".config-item").forEach(item => {
                    item.style.setProperty("flex-direction", "row", "important");
                    item.style.setProperty("align-items", "center", "important");
                    item.style.setProperty("justify-content", "space-between", "important");
                    const grow = item.querySelector<HTMLElement>(".fn__flex-1, .fn__block");
                    if (grow) {
                        grow.style.setProperty("flex", "1 1 0%", "important");
                        grow.style.setProperty("width", "0", "important");
                        grow.style.minWidth = "0";
                    }
                    const space = item.querySelector<HTMLElement>(".fn__space");
                    if (space) space.style.display = "none";
                    const hr = item.querySelector<HTMLElement>(".fn__hr");
                    if (hr) hr.style.display = "none";
                    const control = item.querySelector<HTMLElement>("input, select");
                    if (control) {
                        control.style.marginLeft = "auto";
                        control.style.flex = "0 0 auto";
                    }
                });
            }, 80);
        } catch (err) {
            console.warn("[stm] open settings failed", err);
        }
    }

    openTaskDialog(options: TaskDialogOptions = {}): void {
        if (!options.date && !options.task) options.date = this.today();
        new TaskDialog(this, options).open();
    }

    openProjectDialog(project?: import("./types").Project | null): void {
        new ProjectDialog(this, project || null).open();
    }

    openProjectManager(): void {
        new ProjectManagerDialog(this).open();
    }

    private openMobileView(kind: "kanban" | "calendar" | "gantt"): void {
        this.mobileViewDialog?.destroy();
        const t = this.t;
        const title = kind === "kanban" ? t("kanbanTitle") : kind === "calendar" ? t("calendarTitle") : t("ganttTitle");
        let view: KanbanView | CalendarView | GanttView | null = null;
        const dialog = new Dialog({
            title,
            width: dialogWidth(window.innerWidth),
            content: `<div class="stm-mobile-view"></div>`,
            destroyCallback: () => {
                view?.destroy();
                if (this.mobileViewDialog === dialog) this.mobileViewDialog = null;
            },
        });
        this.mobileViewDialog = dialog;
        dialog.element.classList.add("stm-mobile-view-dialog");
        const host = dialog.element.querySelector(".stm-mobile-view") as HTMLElement;
        view = kind === "kanban" ? new KanbanView(host, this) : kind === "calendar" ? new CalendarView(host, this) : new GanttView(host, this);
        view.mount();
    }

    openKanban(): void {
        if (isMobileUi()) {
            this.openMobileView("kanban");
            return;
        }
        void openTab({
            app: this.app,
            custom: {
                id: this.name + KANBAN_TYPE,
                icon: "iconSTM",
                title: this.t("kanbanTitle"),
                data: {},
            },
        });
    }

    openCalendar(): void {
        if (isMobileUi()) {
            this.openMobileView("calendar");
            return;
        }
        void openTab({
            app: this.app,
            custom: {
                id: this.name + CALENDAR_TYPE,
                icon: "iconSTM",
                title: this.t("calendarTitle"),
                data: {},
            },
        });
    }

    openGantt(): void {
        if (isMobileUi()) {
            this.openMobileView("gantt");
            return;
        }
        void openTab({
            app: this.app,
            custom: {
                id: this.name + GANTT_TYPE,
                icon: "iconSTM",
                title: this.t("ganttTitle"),
                data: {},
            },
        });
    }

    /** 对外导入接口：可传 JSON 字符串或对象；merge 按 id 合并，replace 整体替换 */
    async importData(raw: string | any, mode: "merge" | "replace" = "merge"): Promise<{ tasks: number; projects: number } | null> {
        try {
            const data = typeof raw === "string" ? JSON.parse(raw) : raw;
            const counts = this.store.importSnapshot(data, mode);
            await this.store.flush();
            showMessage(this.t("imported", counts.tasks, counts.projects), 3500, "info");
            return counts;
        } catch (err) {
            console.error("[stm] import failed", err);
            showMessage(this.t("importInvalid"), 3500, "error");
            return null;
        }
    }

    private async readLegacyFiles(): Promise<{ reminder: any; project: any; categories: any } | null> {
        const base = "data/storage/petal/siyuan-plugin-task-note-management";
        const read = async (name: string): Promise<any> => {
            try {
                const res = await fetch("/api/file/getFile", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path: `${base}/${name}` }),
                });
                if (!res.ok) return null;
                const text = await res.text();
                if (!text || text.startsWith("{")) {
                    try {
                        const parsed = JSON.parse(text);
                        if (parsed && parsed.code && parsed.code !== 0) return null;
                    } catch {
                        /* 继续按普通文本解析 */
                    }
                }
                return JSON.parse(text);
            } catch {
                return null;
            }
        };
        const [reminder, project, categories] = await Promise.all([
            read("reminder.json"),
            read("project.json"),
            read("categories.json"),
        ]);
        if (!reminder && !project) return null;
        return { reminder: reminder || {}, project: project || {}, categories: categories || [] };
    }

    /** 启用旧插件数据导入；files 传旧插件三个文件的对象，不传则读取默认数据目录 */
    async importLegacy(files?: { reminder?: any; project?: any; categories?: any }): Promise<number | null> {
        try {
            const data = files || (await this.readLegacyFiles());
            if (!data) {
                showMessage(this.t("legacyImportEmpty"), 3500, "error");
                return null;
            }
            const count = await this.store.importLegacy({
                reminder: data.reminder || {},
                project: data.project || {},
                categories: data.categories || [],
            });
            await this.store.flush();
            showMessage(this.t("legacyImported", count), 3500, "info");
            return count;
        } catch (err) {
            console.error("[stm] legacy import failed", err);
            showMessage(this.t("legacyImportFailed"), 3500, "error");
            return null;
        }
    }

    async openLegacyImport(): Promise<void> {
        const data = await this.readLegacyFiles();
        if (!data) {
            showMessage(this.t("legacyImportEmpty"), 3500, "error");
            return;
        }
        const taskCount = data.reminder && typeof data.reminder === "object" ? Object.keys(data.reminder).length : 0;
        const projectCount = data.project && typeof data.project === "object" ? Object.keys(data.project).length : 0;
        if (!taskCount && !projectCount) {
            showMessage(this.t("legacyImportEmpty"), 3500, "error");
            return;
        }
        confirm(this.t("legacyImportTitle"), this.t("legacyImportSummary", taskCount, projectCount), () => {
            void this.importLegacy(data);
        });
    }

    openImportDialog(): void {
        const t = this.t;
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.style.display = "none";
        document.body.append(input);
        input.addEventListener("change", () => {
            const file = input.files?.[0];
            input.remove();
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                let data: any;
                try {
                    data = JSON.parse(String(reader.result || ""));
                } catch {
                    showMessage(t("importInvalid"), 3500, "error");
                    return;
                }
                const taskCount = Array.isArray(data) ? data.length : Array.isArray(data?.tasks) ? data.tasks.length : 0;
                const projectCount = Array.isArray(data?.projects) ? data.projects.length : 0;
                if (!taskCount && !projectCount) {
                    showMessage(t("importEmpty"), 3500, "error");
                    return;
                }
                const dialog = new Dialog({
                    title: t("importTitle"),
                    width: dialogWidth(460),
                    content: `<div class="b3-dialog__content stm-dialog">
  <p>${t("importSummary", taskCount, projectCount)}</p>
  <p class="stm-import-hint">${t("importHint")}</p>
</div>
<div class="b3-dialog__action">
  <button class="b3-button b3-button--cancel" data-act="cancel">${t("cancel")}</button>
  <div class="fn__flex-1"></div>
  <button class="b3-button b3-button--outline" data-act="replace">${t("importReplace")}</button>
  <button class="b3-button b3-button--text" data-act="merge">${t("importMerge")}</button>
</div>`,
                });
                const run = async (mode: "merge" | "replace") => {
                    dialog.destroy();
                    await this.importData(data, mode);
                };
                const el = dialog.element;
                el.querySelector('[data-act="cancel"]')?.addEventListener("click", () => dialog.destroy());
                el.querySelector('[data-act="merge"]')?.addEventListener("click", () => void run("merge"));
                el.querySelector('[data-act="replace"]')?.addEventListener("click", () => {
                    confirm(t("importReplaceConfirm"), t("importReplaceHint"), () => {
                        void run("replace");
                    });
                });
            };
            reader.readAsText(file);
        });
        input.click();
    }

    exportData(): void {
        try {
            const blob = new Blob([this.store.exportSnapshot()], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `事项管理-${this.today()}.json`;
            a.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            showMessage(this.t("exported"), 2500, "info");
        } catch (err) {
            console.error("[stm] export failed", err);
            showMessage(this.t("exportFailed"), 3000, "error");
        }
    }

    private registerDock(): void {
        this.addDock({
            config: {
                position: "LeftTop",
                size: { width: 300, height: 0 },
                icon: "iconSTM",
                title: this.t("dockTitle"),
                hotkey: "",
            },
            data: { text: this.t("dockTitle") },
            type: DOCK_TYPE,
            init: dock => {
                this.panel = new TaskPanel(dock.element as HTMLElement, this);
                this.panel.mount();
            },
            destroy: () => {
                this.panel?.destroy();
                this.panel = null;
            },
        });
    }

    private registerTabs(): void {
        const pluginRef = this;
        this.addTab({
            type: KANBAN_TYPE,
            init: tab => {
                const view = new KanbanView(tab.element as HTMLElement, this);
                view.mount();
                this.tabViews.set(tab, view);
            },
            destroy: function (this: any) {
                const view = pluginRef.tabViews.get(this);
                view?.destroy();
                pluginRef.tabViews.delete(this);
            } as any,
        });

        this.addTab({
            type: GANTT_TYPE,
            init: tab => {
                const view = new GanttView(tab.element as HTMLElement, this);
                view.mount();
                this.tabViews.set(tab, view);
            },
            resize: function (this: any) {
                pluginRef.tabViews.get(this)?.resize?.();
            } as any,
            destroy: function (this: any) {
                const view = pluginRef.tabViews.get(this);
                view?.destroy();
                pluginRef.tabViews.delete(this);
            } as any,
        });

        this.addTab({
            type: CALENDAR_TYPE,
            init: tab => {
                const view = new CalendarView(tab.element as HTMLElement, this);
                view.mount();
                this.tabViews.set(tab, view);
            },
            resize: function (this: any) {
                pluginRef.tabViews.get(this)?.resize?.();
            } as any,
            destroy: function (this: any) {
                const view = pluginRef.tabViews.get(this);
                view?.destroy();
                pluginRef.tabViews.delete(this);
            } as any,
        });
    }

    private registerCommands(): void {
        this.addCommand({
            langKey: "cmdNewTask",
            hotkey: "",
            callback: () => this.openTaskDialog({ date: this.today() }),
        });
        this.addCommand({
            langKey: "cmdSetDocAsTask",
            hotkey: "",
            editorCallback: protyle => {
                const rootId = protyle?.block?.rootID;
                if (!rootId) {
                    showMessage(this.t("selectDocFirst"), 3000, "info");
                    return;
                }
                const title = (protyle as any)?.title?.editElement?.textContent?.trim() || "";
                void this.resolveTaskProject(rootId).then(projectId => {
                    this.openTaskDialog({
                        blockId: rootId,
                        docId: rootId,
                        title,
                        date: parseDateFromText(title) || this.today(),
                        projectId,
                    });
                });
            },
        });
        this.addCommand({
            langKey: "cmdOpenKanban",
            hotkey: "",
            callback: () => this.openKanban(),
        });
        this.addCommand({
            langKey: "cmdOpenCalendar",
            hotkey: "",
            callback: () => this.openCalendar(),
        });
        this.addCommand({
            langKey: "cmdImportData",
            hotkey: "",
            callback: () => this.openImportDialog(),
        });
        this.addCommand({
            langKey: "cmdImportLegacy",
            hotkey: "",
            callback: () => void this.openLegacyImport(),
        });
        this.addCommand({
            langKey: "cmdExportData",
            hotkey: "",
            callback: () => this.exportData(),
        });
    }

    private buildSetting(): void {
        const t = this.t;
        const s = this.store.settings;
        const setting = new Setting({
            confirmCallback: () => {
                void this.saveSettingValues();
            },
        });

        const dock = document.createElement("input");
        dock.type = "checkbox";
        dock.className = "b3-switch fn__flex";
        dock.checked = s.dockEnabled;
        this.settingInputs.dock = dock;
        setting.addItem({ title: t("settingDock"), actionElement: dock });

        const notifications = document.createElement("input");
        notifications.type = "checkbox";
        notifications.className = "b3-switch fn__flex";
        notifications.checked = s.notifications;
        this.settingInputs.notifications = notifications;
        setting.addItem({ title: t("settingNotifications"), actionElement: notifications });

        const reminderTime = document.createElement("input");
        reminderTime.type = "time";
        reminderTime.className = "b3-text-field fn__size200";
        reminderTime.value = s.defaultReminderTime;
        this.settingInputs.reminderTime = reminderTime;
        setting.addItem({ title: t("settingReminderTime"), actionElement: reminderTime });

        const dayStart = document.createElement("input");
        dayStart.type = "time";
        dayStart.className = "b3-text-field fn__size200";
        dayStart.value = s.dayStartTime;
        this.settingInputs.dayStart = dayStart;
        setting.addItem({ title: t("settingDayStart"), actionElement: dayStart });

        const weekStart = document.createElement("select");
        weekStart.className = "b3-select fn__size200";
        weekStart.innerHTML = `<option value="1">${t("weekMonday")}</option><option value="0">${t("weekSunday")}</option>`;
        weekStart.value = String(s.weekStart);
        this.settingInputs.weekStart = weekStart;
        setting.addItem({ title: t("settingWeekStart"), actionElement: weekStart });

        const dateHeadingLevel = document.createElement("select");
        dateHeadingLevel.className = "b3-select fn__size200";
        dateHeadingLevel.innerHTML = [1, 2, 3, 4, 5, 6].map(n => `<option value="${n}">H${n}</option>`).join("");
        dateHeadingLevel.value = String(s.dateHeadingLevel);
        this.settingInputs.dateHeadingLevel = dateHeadingLevel;
        setting.addItem({ title: t("settingDateHeadingLevel"), actionElement: dateHeadingLevel });

        const autoTaskFromList = document.createElement("input");
        autoTaskFromList.type = "checkbox";
        autoTaskFromList.className = "b3-switch fn__flex";
        autoTaskFromList.checked = s.autoTaskFromList;
        this.settingInputs.autoTaskFromList = autoTaskFromList;
        setting.addItem({ title: t("settingAutoTaskFromList"), actionElement: autoTaskFromList });

        const autoTaskHeadingLevel = document.createElement("select");
        autoTaskHeadingLevel.className = "b3-select fn__size200";
        autoTaskHeadingLevel.innerHTML = `<option value="off">${t("autoHeadingOff")}</option><option value="h5">${t("autoHeadingH5")}</option><option value="h6">${t("autoHeadingH6")}</option><option value="both">${t("autoHeadingBoth")}</option>`;
        autoTaskHeadingLevel.value = s.autoTaskHeadingLevel;
        this.settingInputs.autoTaskHeadingLevel = autoTaskHeadingLevel;
        setting.addItem({ title: t("settingAutoTaskHeadingLevel"), actionElement: autoTaskHeadingLevel });
        setting.addItem({ title: t("settingAutoTaskHint") });

        const calendarColorMode = document.createElement("select");
        calendarColorMode.className = "b3-select fn__size200";
        calendarColorMode.innerHTML = `<option value="muted">${t("calendarMuted")}</option><option value="vivid">${t("calendarVivid")}</option>`;
        calendarColorMode.value = s.calendarColorMode || "muted";
        this.settingInputs.calendarColorMode = calendarColorMode;
        setting.addItem({ title: t("settingCalendarColorMode"), actionElement: calendarColorMode });

        const privacyMode = document.createElement("input");
        privacyMode.type = "checkbox";
        privacyMode.className = "b3-switch fn__flex";
        privacyMode.checked = s.privacyMode;
        this.settingInputs.privacyMode = privacyMode;
        setting.addItem({ title: t("settingPrivacyMode"), actionElement: privacyMode });

        const showCompleted = document.createElement("input");
        showCompleted.type = "checkbox";
        showCompleted.className = "b3-switch fn__flex";
        showCompleted.checked = s.showCompleted;
        this.settingInputs.showCompleted = showCompleted;
        setting.addItem({ title: t("settingShowCompleted"), actionElement: showCompleted });

        const confirmDelete = document.createElement("input");
        confirmDelete.type = "checkbox";
        confirmDelete.className = "b3-switch fn__flex";
        confirmDelete.checked = s.confirmDelete;
        this.settingInputs.confirmDelete = confirmDelete;
        setting.addItem({ title: t("settingConfirmDelete"), actionElement: confirmDelete });

        this.setting = setting;
    }

    private async saveSettingValues(): Promise<void> {
        const inputs = this.settingInputs;
        const before = { ...this.store.settings };
        this.store.updateSettings({
            dockEnabled: !!inputs.dock?.checked,
            notifications: !!inputs.notifications?.checked,
            defaultReminderTime: inputs.reminderTime?.value || "08:00",
            dayStartTime: inputs.dayStart?.value || "03:00",
            weekStart: inputs.weekStart?.value === "0" ? 0 : 1,
            dateHeadingLevel: Math.max(1, Math.min(6, Number(inputs.dateHeadingLevel?.value) || 3)),
            autoTaskFromList: !!inputs.autoTaskFromList?.checked,
            autoTaskHeadingLevel: (["h5", "h6", "both"].includes(inputs.autoTaskHeadingLevel?.value || "")
                ? inputs.autoTaskHeadingLevel!.value
                : "off") as Settings["autoTaskHeadingLevel"],
            calendarColorMode: inputs.calendarColorMode?.value === "vivid" ? "vivid" : "muted",
            privacyMode: !!inputs.privacyMode?.checked,
            showCompleted: !!inputs.showCompleted?.checked,
            confirmDelete: !!inputs.confirmDelete?.checked,
        });
        await this.store.flush();
        showMessage(this.t("settingsSaved"), 2000, "info");
        if (before.dockEnabled !== this.store.settings.dockEnabled) {
            showMessage(this.t("dockReloadHint"), 4000, "info");
        }
    }
}
