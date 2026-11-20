import type STMPlugin from "../index";
import { TaskDialog } from "../dialogs/TaskDialog";
import { getBlockTitle } from "./blockBinding";
import { logicalToday, parseDateFromText } from "../domain/date";
import { resolveDateForBlock } from "./blockDate";
import { resolveProjectForBlock } from "./blockProject";

/** 在文档树、块菜单、文档标题菜单中增加“设为事项” */
export function registerMenus(plugin: STMPlugin): Array<() => void> {
    const bus = plugin.eventBus;
    const today = () => logicalToday(plugin.store.settings.dayStartTime);

    const onDocTree = (event: any) => {
        const detail = event.detail;
        const items = detail?.items as Array<{ id: string }> | undefined;
        if (!detail?.menu || !items?.length) return;
        const blockId = items[0].id;
        const existing = plugin.store.tasks.find(t => t.blockId === blockId);
        detail.menu.addItem({
            label: existing ? plugin.t("openTask") : plugin.t("setAsTask"),
            icon: "iconSTM",
            click: async () => {
                if (existing) {
                    new TaskDialog(plugin, { task: existing }).open();
                    return;
                }
                const title = await getBlockTitle(blockId);
                const date = (await resolveDateForBlock(blockId)) || today();
                const projectId = await resolveProjectForBlock(plugin.store, blockId);
                new TaskDialog(plugin, { blockId, docId: blockId, title, date, projectId }).open();
            },
        });
    };

    const onBlockIcon = (event: any) => {
        const detail = event.detail;
        const blockEl = detail?.blockElements?.[0] as HTMLElement | undefined;
        const blockId = blockEl?.getAttribute("data-node-id");
        if (!detail?.menu || !blockId) return;
        const existing = plugin.store.tasks.find(t => t.blockId === blockId);
        detail.menu.addItem({
            label: existing ? plugin.t("openTask") : plugin.t("setAsTask"),
            icon: "iconSTM",
            click: async () => {
                if (existing) {
                    new TaskDialog(plugin, { task: existing }).open();
                    return;
                }
                const title = await getBlockTitle(blockId);
                const date = (await resolveDateForBlock(blockId)) || today();
                const projectId = await resolveProjectForBlock(plugin.store, blockId);
                new TaskDialog(plugin, { blockId, title, date, projectId }).open();
            },
        });
    };

    const onTitleIcon = (event: any) => {
        const detail = event.detail;
        const docId = detail?.data?.id as string | undefined;
        if (!detail?.menu || !docId) return;
        const existing = plugin.store.tasks.find(t => t.blockId === docId);
        detail.menu.addItem({
            label: existing ? plugin.t("openTask") : plugin.t("setAsTask"),
            icon: "iconSTM",
            click: async () => {
                if (existing) {
                    new TaskDialog(plugin, { task: existing }).open();
                    return;
                }
                const title = await getBlockTitle(docId);
                const date = parseDateFromText(title) || (await resolveDateForBlock(docId)) || today();
                const projectId = await resolveProjectForBlock(plugin.store, docId);
                new TaskDialog(plugin, { blockId: docId, docId, title, date, projectId }).open();
            },
        });
    };

    bus.on("open-menu-doctree", onDocTree);
    bus.on("click-blockicon", onBlockIcon);
    bus.on("click-editortitleicon", onTitleIcon);

    return [
        () => bus.off("open-menu-doctree", onDocTree),
        () => bus.off("click-blockicon", onBlockIcon),
        () => bus.off("click-editortitleicon", onTitleIcon),
    ];
}
