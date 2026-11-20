import {
    api,
    deleteBlock,
    getBlockAttrs,
    getBlockRow,
    getChildBlocks,
    insertBlock,
    moveBlock,
    prependBlock,
    setBlockAttrs,
    type ChildBlock,
} from "../api";
import { parseDateFromText } from "../domain/date";

export const DATE_HEADING_ATTR = "custom-stm-date-heading";

export interface DateHeading {
    id: string;
    date: string;
    level: number;
}

function headingLevel(block: ChildBlock): number {
    const match = /^h([1-6])$/.exec(block.subType || "");
    return match ? Number(match[1]) : 3;
}

function headingMarkdown(date: string, level: number): string {
    return `${"#".repeat(Math.max(1, Math.min(6, level)))} ${date}`;
}

async function parentOf(docId: string): Promise<string> {
    const flat = await getChildBlocks(docId);
    const firstDate = flat.find(b => b.type === "h" && parseDateFromText(b.content));
    if (firstDate) {
        const row = await getBlockRow(firstDate.id);
        return row?.parent_id || docId;
    }
    const h1 = flat.find(b => b.type === "h" && (b.subType || "h1") === "h1");
    return h1 ? h1.id : docId;
}

export async function listDateHeadings(docId: string): Promise<DateHeading[]> {
    const flat = await getChildBlocks(docId);
    return flat
        .filter(b => b.type === "h")
        .map(b => ({ id: b.id, date: parseDateFromText(b.content) || "", level: headingLevel(b) }))
        .filter((h): h is DateHeading => !!h.date);
}

/** 给日期标题打上属性，用于 CSS 分割线和日历联动识别 */
export async function tagDateHeadings(docId: string): Promise<number> {
    const headings = await listDateHeadings(docId);
    let changed = 0;
    await Promise.all(
        headings.map(async h => {
            try {
                const attrs = await getBlockAttrs(h.id);
                if (attrs?.[DATE_HEADING_ATTR] === h.date) return;
                await setBlockAttrs(h.id, { [DATE_HEADING_ATTR]: h.date });
                changed++;
            } catch {
                /* 忽略单个标题失败 */
            }
        })
    );
    return changed;
}

/**
 * 确保文档里存在某日期的标题，并按倒序插入。
 * 新日期比现有标题新 -> 插到最前；比最旧还旧 -> 追加到末尾；否则插到下一个更旧标题之前。
 */
export async function ensureDateHeading(docId: string, date: string, defaultLevel = 3): Promise<string | null> {
    try {
        const headings = await listDateHeadings(docId);
        const existing = headings.find(h => h.date === date);
        if (existing) {
            await setBlockAttrs(existing.id, { [DATE_HEADING_ATTR]: date });
            return existing.id;
        }
        const parent = await parentOf(docId);
        const level = Math.max(1, Math.min(6, defaultLevel || 3));
        const md = headingMarkdown(date, level);
        const flat = await getChildBlocks(docId);
        const beforeIds = new Set(flat.map(b => b.id));

        if (!headings.length || date > headings[0].date) {
            await prependBlock(parent, md);
        } else {
            const older = headings.find(h => h.date < date);
            if (!older) {
                const last = flat[flat.length - 1];
                await insertBlock(last?.id || parent, parent, md);
            } else {
                const index = flat.findIndex(b => b.id === older.id);
                const previous = index > 0 ? flat[index - 1] : null;
                await insertBlock(previous?.id || parent, parent, md);
            }
        }
        const after = await getChildBlocks(docId);
        const created = after.find(b => !beforeIds.has(b.id) && b.type === "h" && parseDateFromText(b.content) === date);
        if (!created) return null;
        await setBlockAttrs(created.id, { [DATE_HEADING_ATTR]: date });
        return created.id;
    } catch (err) {
        console.warn("[stm] ensure date heading failed", err);
        return null;
    }
}

/** 删除没有子块的日期标题（keep 里的标题除外） */
export async function pruneEmptyDateHeadings(docId: string, keep: Set<string> = new Set()): Promise<number> {
    try {
        const headings = await listDateHeadings(docId);
        let deleted = 0;
        for (const heading of headings) {
            if (keep.has(heading.id)) continue;
            const children = await getChildBlocks(heading.id);
            if (children.length) continue;
            await deleteBlock(heading.id);
            deleted++;
        }
        return deleted;
    } catch (err) {
        console.warn("[stm] prune empty date headings failed", err);
        return 0;
    }
}

/** 在项目文档的日期标题下插入事项正文块，返回新块 ID */
export async function insertTaskBlock(docId: string, date: string, title: string, level = 3): Promise<string | null> {
    try {
        const headingId = await ensureDateHeading(docId, date, level);
        if (!headingId) return null;
        const before = new Set((await getChildBlocks(headingId)).map(b => b.id));
        const text = (title || "").replace(/\s+/g, " ").trim() || "未命名事项";
        await insertBlock(headingId, headingId, text);
        const after = await getChildBlocks(headingId);
        const created = after.find(b => !before.has(b.id));
        return created?.id || null;
    } catch (err) {
        console.warn("[stm] insert task block failed", err);
        return null;
    }
}

/** 收集某个块的后代（父级 -> 子级顺序），用于搬移标题事项时带走 Note 等子内容 */
async function collectDescendants(blockId: string, docId: string): Promise<Array<{ id: string; parentId: string }>> {
    const rows = await api<Array<{ id: string; parent_id: string }>>("/api/query/sql", {
        stmt: `select id, parent_id from blocks where root_id = '${docId.replace(/'/g, "''")}'`,
    });
    const children = new Map<string, string[]>();
    for (const row of rows || []) {
        if (!row.parent_id) continue;
        const list = children.get(row.parent_id) || [];
        list.push(row.id);
        children.set(row.parent_id, list);
    }
    const result: Array<{ id: string; parentId: string }> = [];
    const walk = (parent: string) => {
        for (const child of children.get(parent) || []) {
            result.push({ id: child, parentId: parent });
            walk(child);
        }
    };
    walk(blockId);
    return result;
}

/** 搬移事项块及其子内容，再逐层挂回原来的父子关系 */
async function moveBlockTree(blockId: string, targetHeadingId: string, docId: string): Promise<void> {
    const descendants = await collectDescendants(blockId, docId);
    await moveBlock(blockId, targetHeadingId);
    if (!descendants.length) return;
    const byParent = new Map<string, string[]>();
    for (const item of descendants) {
        const list = byParent.get(item.parentId) || [];
        list.push(item.id);
        byParent.set(item.parentId, list);
    }
    const queue = [blockId];
    while (queue.length) {
        const parent = queue.shift()!;
        const parentRow = await getBlockRow(parent);
        const parentIsHeading = parentRow?.type === "h";
        let previous = parent;
        for (const childId of byParent.get(parent) || []) {
            if (parentIsHeading) {
                // 标题是叶子块，不能 parentID；按顺序放到标题后面
                await moveBlock(childId, previous);
                previous = childId;
            } else {
                // 引用块、列表、提示块等容器可以真正挂子块
                await moveBlock(childId, undefined, parent);
            }
            queue.push(childId);
        }
    }
}

/** 把某个块移动到指定日期标题下；返回是否移动 */
export async function moveBlockUnderDate(blockId: string, date: string, level = 3): Promise<boolean> {
    try {
        const row = await getBlockRow(blockId);
        if (!row || row.type === "d") return false;
        // 日期标题本身不能移动；但用户可能把事项写成标题（如 H5），要连子块一起移动
        if (row.type === "h" && parseDateFromText(row.content)) return false;
        const docId = row.root_id;
        if (!docId) return false;
        const headingId = await ensureDateHeading(docId, date, level);
        if (!headingId) return false;
        if (row.parent_id !== headingId) await moveBlockTree(blockId, headingId, docId);
        // 旧标题可能已被移空：保留目标标题，其余空日期标题清掉
        await pruneEmptyDateHeadings(docId, new Set([headingId]));
        return true;
    } catch (err) {
        console.warn("[stm] move block under date failed", err);
        return false;
    }
}

/** 删除事项块及其子块；用于事项删除时同步清理文档 */
export async function deleteBlockTree(blockId: string): Promise<void> {
    try {
        const row = await getBlockRow(blockId);
        if (!row || row.type === "d") return;
        // 日期标题本身不作为事项删除目标，避免删掉一整个日期段
        if (row.type === "h" && parseDateFromText(row.content)) return;
        const docId = row.root_id;
        const before = new Set(docId ? (await getChildBlocks(docId)).map(b => b.id) : []);
        const descendants = docId ? await collectDescendants(blockId, docId) : [];
        for (const item of [...descendants].reverse()) {
            try {
                await deleteBlock(item.id);
            } catch {
                /* 可能已被父块级联删除 */
            }
        }
        try {
            await deleteBlock(blockId);
        } catch {
            /* 忽略不存在 */
        }
        if (docId) {
            // 先清理空日期标题（删除标题时思源可能补空段落），再清掉本次新增的空段落
            await pruneEmptyDateHeadings(docId);
            const after = await getChildBlocks(docId);
            for (const block of after) {
                if (!before.has(block.id) && block.type === "p" && !String(block.content || "").trim()) {
                    try { await deleteBlock(block.id); } catch { /* ignore */ }
                }
            }
        }
    } catch (err) {
        console.warn("[stm] delete block tree failed", err);
    }
}
