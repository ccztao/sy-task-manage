import type { Store } from "../store";
import type { Task } from "../types";
import { api, getBlockRow, getChildBlocks, insertBlock, prependBlock, deleteBlock } from "../api";
import { bindTaskToBlock } from "./blockBinding";

/** 可选：把普通段落父任务转成 H5/H6 标题；列表项/已有标题不强行转换 */
export async function convertParentToHeading(store: Store, parent: Task, level: 5 | 6): Promise<boolean> {
    if (!parent.blockId) return false;
    const row = await getBlockRow(parent.blockId);
    if (!row || row.type === "d") return false;
    try {
        const data = await api<{ kramdown: string }>("/api/block/getBlockKramdown", { id: parent.blockId });
        const kramdown = (data?.kramdown || "").replace(/\r?\n\{:[^}]*\}\s*$/, "").trimEnd();
        if (!kramdown) return false;
        const lines = kramdown.split(/\r?\n/);
        const body = lines[0]
            .replace(/^#{1,6}\s+/, "")
            .replace(/^-\s*(?:\[[ xX]\]\s*)?/, "");
        if (!body.trim()) return false;
        lines[0] = `${"#".repeat(level)} ${body}`;
        await api("/api/block/updateBlock", {
            id: parent.blockId,
            dataType: "markdown",
            data: lines.join("\n"),
        });
        // updateBlock 是异步事务，立即读 blocks 可能还是旧类型；写入成功即可
        await bindTaskToBlock(parent.id, parent.blockId, parent.startDate);
        return true;
    } catch (err) {
        console.warn("[stm] convert parent task to heading failed", err);
        return false;
    }
}

/** 在父事项块下面创建/追加一个子任务列表，并返回子任务列表项块 ID */
export async function attachSubtaskBlock(store: Store, parent: Task, child: Task, title: string): Promise<string | null> {
    if (!parent.blockId) return null;
    let parentRow = await getBlockRow(parent.blockId);
    if (!parentRow || parentRow.type === "d") return null;
    if (parentRow.type === "p" && store.settings.subtaskParentHeading !== "auto") {
        const level = store.settings.subtaskParentHeading === "h6" ? 6 : 5;
        if (await convertParentToHeading(store, parent, level)) {
            parentRow = (await getBlockRow(parent.blockId)) || parentRow;
        }
    }
    const markdown = `- [ ] ${title.replace(/\s+/g, " ").trim()}`;
    let listId = parent.subtaskListId || null;
    let itemId: string | null = null;
    try {
        if (listId) {
            const listRow = await getBlockRow(listId);
            if (!listRow) listId = null;
        }
        if (listId) {
            const items = (await getChildBlocks(listId)) || [];
            const before = new Set(items.map(x => x.id));
            const last = items[items.length - 1];
            if (last) await insertBlock(last.id, listId, markdown);
            else await prependBlock(listId, markdown);
            const after = (await getChildBlocks(listId)) || [];
            itemId = after.find(x => !before.has(x.id))?.id || null;
        } else {
            // 标题/段落：列表放在父块后面；列表项：列表嵌在列表项里
            let insertParent = parentRow.type === "i" ? parent.blockId : parentRow.parent_id || parent.blockId;
            const before = new Set(((await getChildBlocks(insertParent)) || []).map(x => x.id));
            try {
                await insertBlock(parent.blockId, insertParent, markdown);
            } catch (err) {
                // 某些块类型下「插入为兄弟」会失败，退回到插入为子块
                console.warn("[stm] insert subtask sibling failed, retry as child", err);
                insertParent = parent.blockId;
                await insertBlock(parent.blockId, parent.blockId, markdown);
            }
            const after = (await getChildBlocks(insertParent)) || [];
            const fresh = after.find(x => !before.has(x.id));
            if (fresh) {
                if (fresh.type === "l") {
                    listId = fresh.id;
                    const items = (await getChildBlocks(listId)) || [];
                    itemId = items[0]?.id || null;
                } else {
                    const row = await getBlockRow(fresh.id);
                    listId = row?.parent_id || null;
                    itemId = fresh.id;
                }
            }
        }
        if (!listId || !itemId) return null;
        store.updateTask(child.id, { blockId: itemId, docId: parent.docId, parentId: parent.id });
        store.updateTask(parent.id, { subtaskListId: listId });
        await bindTaskToBlock(child.id, itemId, parent.startDate);
        return itemId;
    } catch (err) {
        console.warn("[stm] attach subtask block failed", err);
        return null;
    }
}

/** 把本地已有、还没有绑定块的子任务补写到文档 */
export async function syncExistingSubtasks(store: Store, parent: Task): Promise<number> {
    let count = 0;
    for (const child of store.tasks.filter(x => x.parentId === parent.id && !x.blockId)) {
        try {
            const blockId = await attachSubtaskBlock(store, parent, child, child.title);
            if (blockId) count++;
        } catch (err) {
            console.warn("[stm] sync existing subtask failed", err);
        }
    }
    return count;
}

/** 插件里勾选/取消子任务后，同步文档列表项里的复选框 */
export async function syncSubtaskCheckbox(task: Task): Promise<void> {
    if (!task.blockId) return;
    try {
        const data = await api<{ kramdown: string }>("/api/block/getBlockKramdown", { id: task.blockId });
        const kramdown = data?.kramdown || "";
        const checked = !!task.completedAt;
        // 列表项的 kramdown 可能是 `- {: id="..." }[ ] 标题`，需要跳过块属性再改复选框
        const next = kramdown.replace(/^(\s*-\s*(?:\{:[^}]*\}\s*)?)\[[ xX]\]/, `$1[${checked ? "x" : " "}]`);
        if (next === kramdown) return;
        await api("/api/block/updateBlock", {
            id: task.blockId,
            dataType: "markdown",
            data: next.replace(/\r?\n\{:[^}]*\}\s*$/, "").trimEnd(),
        });
    } catch (err) {
        console.warn("[stm] sync subtask checkbox failed", err);
    }
}

/** 子任务删除后，如果列表已空就删除列表块，并清掉父事项记录的列表 ID */
export async function pruneSubtaskList(store: Store, parentId: string): Promise<void> {
    const parent = store.getTask(parentId);
    const listId = parent?.subtaskListId;
    if (!parent || !listId) return;
    try {
        const items = (await getChildBlocks(listId)) || [];
        if (items.length) return;
        await deleteBlock(listId);
    } catch {
        /* 块可能已被手动删除 */
    }
    store.updateTask(parent.id, { subtaskListId: null });
}
