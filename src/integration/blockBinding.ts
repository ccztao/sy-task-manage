import type { Store } from "../store";
import { api, deleteBlock, getBlockAttrs, getBlockRow, getChildBlocks, setBlockAttrs } from "../api";
import { deleteBlockTree } from "./dateHeadings";

export const TASK_ATTR = "custom-stm-task-id";
export const DATE_ATTR = "custom-stm-task-date";

export function findTaskByBlock(store: Store, blockId: string) {
    return store.tasks.find(t => t.blockId === blockId);
}

export async function bindTaskToBlock(taskId: string, blockId: string, date?: string | null): Promise<void> {
    await setBlockAttrs(blockId, {
        [TASK_ATTR]: taskId,
        [DATE_ATTR]: date || "",
    });
}

export async function unbindBlock(blockId: string | null): Promise<void> {
    if (!blockId) return;
    try {
        await setBlockAttrs(blockId, { [TASK_ATTR]: "", [DATE_ATTR]: "" });
    } catch (err) {
        console.warn("[stm] unbind block failed", err);
    }
}

/** 已绑定到某个块的旧任务（例如从块属性恢复） */
export async function resolveTaskIdByBlock(blockId: string): Promise<string | null> {
    try {
        const attrs = await getBlockAttrs(blockId);
        return attrs?.[TASK_ATTR] || null;
    } catch {
        return null;
    }
}

export async function getBlockTitle(blockId: string): Promise<string> {
    const row = await getBlockRow(blockId);
    return (row?.content || "").trim().split("\n")[0].slice(0, 120);
}

/** 删除事项并清理块上的绑定属性 */
export async function deleteTaskWithCleanup(store: Store, taskId: string): Promise<void> {
    const task = store.getTask(taskId);
    if (!task) return;
    for (const child of store.tasks.filter(x => x.parentId === taskId)) {
        await deleteTaskWithCleanup(store, child.id);
    }
    if (task?.blockId) {
        const row = await getBlockRow(task.blockId);
        if (row && row.type !== "d") {
            await deleteBlockTree(task.blockId);
        } else {
            await unbindBlock(task.blockId);
        }
    }
    store.deleteTask(taskId);
    if (task.parentId) {
        const parent = store.getTask(task.parentId);
        if (parent?.subtaskListId) {
            const items = await getChildBlocks(parent.subtaskListId);
            if (!items.length) {
                try {
                    await deleteBlock(parent.subtaskListId);
                } catch {
                    /* ignore */
                }
                store.updateTask(parent.id, { subtaskListId: null });
            }
        }
    }
}

function stripKramdownAttrs(kramdown: string): string {
    return kramdown.replace(/\r?\n\{:[^}]*\}\s*$/, "").trimEnd();
}

/** 事项标题在日历/看板/弹窗里改名时，同步绑定块里的标题文本（保留块内引用和子块） */
export async function syncBlockTitle(blockId: string, oldTitle: string, newTitle: string): Promise<boolean> {
    if (!blockId || !oldTitle || oldTitle === newTitle) return false;
    try {
        const row = await getBlockRow(blockId);
        if (!row || row.type === "d") return false;
        const data = await api<{ kramdown: string }>("/api/block/getBlockKramdown", { id: blockId });
        const kramdown = data?.kramdown || "";
        const index = kramdown.indexOf(oldTitle);
        let next: string;
        if (index >= 0) {
            next = kramdown.slice(0, index) + newTitle + kramdown.slice(index + oldTitle.length);
        } else {
            // 块标题可能已被手动改过、和事项旧标题对不上：只替换标题首段，保留后面的 @ 引用/图标
            const lines = kramdown.split(/\r?\n/);
            const first = lines[0] || "";
            const heading = /^(#{1,6}\s+)(.*)$/.exec(first);
            const prefix = heading ? heading[1] : "";
            const body = heading ? heading[2] : first;
            const marker = body.search(/<span|\(\(/);
            const tail = marker >= 0 ? body.slice(marker) : "";
            lines[0] = `${prefix}${newTitle}${tail}`;
            next = lines.join("\n");
            if (next === kramdown) return false;
        }
        await api("/api/block/updateBlock", {
            id: blockId,
            dataType: "markdown",
            data: stripKramdownAttrs(next),
        });
        return true;
    } catch (err) {
        console.warn("[stm] sync block title failed", err);
        return false;
    }
}
