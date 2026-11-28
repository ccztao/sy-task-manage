import { Dialog, showMessage } from "siyuan";
import type STMPlugin from "../index";
import type { Settings } from "../types";
import { dialogWidth } from "../ui/dom";

export class SettingsDialog {
    private dialog: Dialog | null = null;

    constructor(private plugin: STMPlugin) {}

    open(): void {
        const t = this.plugin.t;
        const s = this.plugin.store.settings;
        const row = (title: string, desc: string, control: string): string => `<div class="stm-setting-row">
  <div class="stm-setting-copy"><div class="stm-setting-title">${title}</div><div class="stm-setting-desc">${desc}</div></div>
  <div class="stm-setting-control">${control}</div>
</div>`;
        const section = (title: string, rows: string): string => `<section class="stm-settings-section"><h3 class="stm-settings-section-title">${title}</h3>${rows}</section>`;
        const toggle = (key: keyof Settings, checked: boolean): string =>
            `<input type="checkbox" class="b3-switch stm-setting-switch" data-setting="${key}" ${checked ? "checked" : ""}>`;
        const select = (key: keyof Settings, value: string, options: Array<[string, string]>): string =>
            `<select class="b3-select stm-setting-select" data-setting="${key}">${options.map(([v, label]) => `<option value="${v}" ${v === value ? "selected" : ""}>${label}</option>`).join("")}</select>`;
        const time = (key: keyof Settings, value: string): string =>
            `<input type="time" class="b3-text-field stm-setting-time" data-setting="${key}" value="${value}">`;

        const content = `<div class="b3-dialog__content stm-dialog stm-settings-panel">
  <div class="stm-settings-subtitle">${t("settingsSubtitle")}</div>
  ${section(t("settingsSectionGeneral"), [
      row(t("settingDock"), t("settingDockDesc"), toggle("dockEnabled", s.dockEnabled)),
      row(t("settingNotifications"), t("settingNotificationsDesc"), toggle("notifications", s.notifications)),
      row(t("settingReminderTime"), t("settingReminderTimeDesc"), time("defaultReminderTime", s.defaultReminderTime)),
      row(t("settingDayStart"), t("settingDayStartDesc"), time("dayStartTime", s.dayStartTime)),
  ].join(""))}
  ${section(t("settingsSectionTasks"), [
      row(t("settingAutoTaskFromList"), t("settingAutoTaskFromListDesc"), toggle("autoTaskFromList", s.autoTaskFromList)),
      row(t("settingAutoTaskHeadingLevel"), t("settingAutoTaskHint"), select("autoTaskHeadingLevel", s.autoTaskHeadingLevel, [
          ["off", t("autoHeadingOff")], ["h5", t("autoHeadingH5")], ["h6", t("autoHeadingH6")], ["both", t("autoHeadingBoth")],
      ])),
      row(t("settingDateHeadingLevel"), t("settingDateHeadingLevelDesc"), select("dateHeadingLevel", String(s.dateHeadingLevel), [1,2,3,4,5,6].map(n => [String(n), `H${n}`] as [string,string]))),
      row(t("settingSubtaskParentHeading"), t("settingSubtaskParentHeadingDesc"), select("subtaskParentHeading", s.subtaskParentHeading, [
          ["auto", t("subtaskHeadingAuto")], ["h5", t("subtaskHeadingH5")], ["h6", t("subtaskHeadingH6")],
      ])),
  ].join(""))}
  ${section(t("settingsSectionCalendar"), [
      row(t("settingWeekStart"), t("settingWeekStartDesc"), select("weekStart", String(s.weekStart), [["1", t("weekMonday")], ["0", t("weekSunday")]])),
      row(t("settingCalendarColorMode"), t("settingCalendarColorModeDesc"), select("calendarColorMode", s.calendarColorMode, [
          ["muted", t("calendarMuted")], ["vivid", t("calendarVivid")],
      ])),
  ].join(""))}
  ${section(t("settingsSectionData"), [
      row(t("settingsDataTitle"), t("settingsDataDesc"), `<div class="stm-setting-actions">
        <button type="button" class="b3-button b3-button--outline stm-setting-action" data-data="import">${t("importData")}</button>
        <button type="button" class="b3-button b3-button--outline stm-setting-action" data-data="export">${t("exportData")}</button>
        <button type="button" class="b3-button b3-button--outline stm-setting-action" data-data="legacy">${t("importLegacy")}</button>
      </div>`),
  ].join(""))}
  ${section(t("settingsSectionDisplay"), [
      row(t("settingShowCompleted"), t("settingShowCompletedDesc"), toggle("showCompleted", s.showCompleted)),
      row(t("settingPrivacyMode"), t("settingPrivacyModeDesc"), toggle("privacyMode", s.privacyMode)),
      row(t("settingConfirmDelete"), t("settingConfirmDeleteDesc"), toggle("confirmDelete", s.confirmDelete)),
  ].join(""))}
</div>
<div class="b3-dialog__action">
  <button class="b3-button b3-button--cancel" data-act="cancel">${t("cancel")}</button>
  <button class="b3-button b3-button--text" data-act="save">${t("save")}</button>
</div>`;

        this.dialog = new Dialog({
            title: t("settingsDialogTitle"),
            width: dialogWidth(620),
            content,
            destroyCallback: () => { this.dialog = null; },
        });
        const el = this.dialog.element;
        el.querySelector('[data-act="cancel"]')?.addEventListener("click", () => this.dialog?.destroy());
        el.querySelectorAll<HTMLElement>("[data-data]").forEach(button => {
            button.addEventListener("click", () => {
                const action = button.dataset.data;
                this.dialog?.destroy();
                if (action === "import") this.plugin.openImportDialog();
                else if (action === "export") this.plugin.exportData();
                else if (action === "legacy") void this.plugin.openLegacyImport();
            });
        });
        el.querySelector('[data-act="save"]')?.addEventListener("click", () => {
            const before = { ...this.plugin.store.settings };
            const value = (key: string): string => el.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-setting="${key}"]`)?.value || "";
            const checked = (key: string): boolean => !!el.querySelector<HTMLInputElement>(`[data-setting="${key}"]`)?.checked;
            const next: Partial<Settings> = {
                dockEnabled: checked("dockEnabled"),
                notifications: checked("notifications"),
                defaultReminderTime: value("defaultReminderTime") || "08:00",
                dayStartTime: value("dayStartTime") || "03:00",
                autoTaskFromList: checked("autoTaskFromList"),
                autoTaskHeadingLevel: (["h5", "h6", "both"].includes(value("autoTaskHeadingLevel")) ? value("autoTaskHeadingLevel") : "off") as Settings["autoTaskHeadingLevel"],
                dateHeadingLevel: Math.max(1, Math.min(6, Number(value("dateHeadingLevel")) || 3)),
                subtaskParentHeading: (["h5", "h6"].includes(value("subtaskParentHeading")) ? value("subtaskParentHeading") : "auto") as Settings["subtaskParentHeading"],
                weekStart: value("weekStart") === "0" ? 0 : 1,
                calendarColorMode: value("calendarColorMode") === "vivid" ? "vivid" : "muted",
                showCompleted: checked("showCompleted"),
                privacyMode: checked("privacyMode"),
                confirmDelete: checked("confirmDelete"),
            };
            this.plugin.store.updateSettings(next);
            void this.plugin.store.flush().then(() => {
                showMessage(t("settingsSaved"), 2200, "info");
                if (before.dockEnabled !== next.dockEnabled) showMessage(t("dockReloadHint"), 4000, "info");
            });
            this.dialog?.destroy();
        });
    }
}
