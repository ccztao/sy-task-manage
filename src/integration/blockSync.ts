import { getAllEditor } from "siyuan";
import type STMPlugin from "../index";
import { getBlockRow } from "../api";
import { parseDateFromText } from "../domain/date";

/** 文档里修改绑定块后，把标题/所在日期标题同步回事项 */
function cleanBlockTitle(content: string): string {
    // blocks.content 会把自定义链接的 siyuan:// 地址也拼进来，任务标题只保留可见文字
    return (content || "")
        .split("\n")[0]
        .replace(/\s*siyuan:\/\/\S+/g, "")
        .trim();
}

export async function syncTaskFromBlock(plugin: STMPlugin, blockId: string): Promise<void> {
    const task = plugin.store.tasks.find(t => t.blockId === blockId);
    if (!task) return;
    const row = await getBlockRow(blockId);
    if (!row || row.type === "d") return;
    const content = cleanBlockTitle(row.content || "");

    // 绑定的是日期标题本身时不把日期当标题
    const isDateHeading = row.type === "h" && !!parseDateFromText(content);
    if (content && !isDateHeading && content !== task.title) {
        plugin.store.updateTask(task.id, { title: content });
    }

    let parentId = row.parent_id || "";
    let date: string | null = null;
    for (let i = 0; i < 12 && parentId; i++) {
        const parent = await getBlockRow(parentId);
        if (!parent) break;
        if (parent.type === "h") {
            const parsed = parseDateFromText(parent.content);
            if (parsed) {
                date = parsed;
                break;
            }
        }
        parentId = parent.parent_id || "";
    }
    if (date && date !== task.startDate) {
        plugin.store.updateTask(task.id, { startDate: date });
    }
}

interface SnapshotBlock {
    id: string;
    type: string;
    subtype: string;
    content: string;
    markdown: string;
    parent_id: string;
    root_id: string;
    created: string;
}

function blockCreatedMs(created: string): number {
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(created || "");
    if (!m) return 0;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])).getTime();
}

function dateFromDom(blocks: Map<string, SnapshotBlock>, blockId: string): string | null {
    try {
        const safe = blockId.replace(/["\\]/g, "\\$&");
        const el = document.querySelector<HTMLElement>(`[data-node-id="${safe}"]`);
        const wysiwyg = el?.closest<HTMLElement>(".protyle-wysiwyg");
        if (!el || !wysiwyg) return null;
        let top: HTMLElement = el;
        while (top.parentElement && top.parentElement !== wysiwyg) top = top.parentElement;
        let prev = top.previousElementSibling as HTMLElement | null;
        while (prev) {
            const id = prev.getAttribute("data-node-id") || "";
            const row = blocks.get(id);
            if (row?.type === "h") {
                const date = parseDateFromText(row.content);
                if (date) return date;
            }
            prev = prev.previousElementSibling as HTMLElement | null;
        }
    } catch {
        /* ignore */
    }
    return null;
}

function dateOfBlock(blocks: Map<string, SnapshotBlock>, row: SnapshotBlock): string | null {
    return dateOfParent(blocks, row.parent_id) || dateFromDom(blocks, row.id);
}

function dateOfParent(blocks: Map<string, SnapshotBlock>, parentId: string): string | null {
    let current = parentId;
    for (let i = 0; i < 16 && current; i++) {
        const parent = blocks.get(current);
        if (!parent) break;
        if (parent.type === "h") {
            const parsed = parseDateFromText(parent.content);
            if (parsed) return parsed;
        }
        current = parent.parent_id;
    }
    return null;
}

async function readDocBlocks(rootId: string): Promise<Map<string, SnapshotBlock>> {
    const map = new Map<string, SnapshotBlock>();
    let offset = 0;
    while (true) {
        const res = await fetch("/api/query/sql", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                stmt: `SELECT id, type, subtype, content, markdown, parent_id, root_id, created FROM blocks WHERE root_id = '${rootId.replace(/'/g, "''")}' LIMIT 64 OFFSET ${offset}`,
            }),
        });
        const json = await res.json();
        const rows: SnapshotBlock[] = json?.data || [];
        for (const row of rows) map.set(row.id, row);
        if (rows.length < 64) break;
        offset += 64;
        if (offset > 4000) break;
    }
    return map;
}

/**
 * 文档编辑兜底轮询：Web 端有时不广播 move 事务，靠 4 秒轮询同步打开的文档。
 * 只扫当前打开的文档，任务量小；标题和日期都参与比较，没有差异不写。
 */
export function startBlockSyncPoller(plugin: STMPlugin): () => void {
    const autoSince = Date.now();
    let busy = false;

    const autoCreate = async (blocks: Map<string, SnapshotBlock>, existing: Map<string, string>) => {
        const settings = plugin.store.settings;
        const headingLevel = settings.autoTaskHeadingLevel;
        for (const row of blocks.values()) {
            if (existing.has(row.id)) continue;
            const content = cleanBlockTitle(row.content || "");
            if (!content || (row.type === "h" && parseDateFromText(content))) continue;

            const isTaskList = settings.autoTaskFromList && row.type === "i" && row.subtype === "t"
                && /^-\s*\[[ xX]\]/.test(row.markdown || "");
            const isHeading = row.type === "h" && (
                (headingLevel === "h5" && row.subtype === "h5") ||
                (headingLevel === "h6" && row.subtype === "h6") ||
                (headingLevel === "both" && (row.subtype === "h5" || row.subtype === "h6"))
            );
            if (!isTaskList && !isHeading) continue;
            // 任务列表只处理新输入的块；H5/H6 在启用设置后扫描当前文档已有标题
            if (isTaskList && blockCreatedMs(row.created) < autoSince - 1500) continue;

            const date = dateOfBlock(blocks, row);
            if (!date) continue;

            const projectId = await plugin.resolveTaskProject(row.id);
            const task = plugin.store.createTask({
                title: content,
                startDate: date,
                blockId: row.id,
                docId: row.root_id || null,
                projectId,
            });
            existing.set(row.id, task.id);
            if (isTaskList && /^-\s*\[[xX]\]/.test(row.markdown || "")) {
                plugin.store.updateTask(task.id, { status: "done", completedAt: Date.now() });
            }
        }
    };

    const tick = async () => {
        if (busy || document.visibilityState === "hidden") return;
        busy = true;
        try {
            const roots = new Set<string>();
            try {
                for (const editor of getAllEditor()) {
                    const root = editor?.protyle?.block?.rootID;
                    if (root) roots.add(root);
                }
            } catch {
                /* ignore */
            }
            for (const root of roots) {
                const blocks = await readDocBlocks(root);
                if (!blocks.size) continue;
                const existing = new Map<string, string>();
                for (const task of plugin.store.tasks) {
                    if (task.blockId) existing.set(task.blockId, task.id);
                }
                for (const task of plugin.store.tasks) {
                    if (!task.blockId) continue;
                    const row = blocks.get(task.blockId);
                    if (!row) continue;
                    const content = cleanBlockTitle(row.content || "");
                    const isDateHeading = row.type === "h" && !!parseDateFromText(content);
                    if (content && !isDateHeading && content !== task.title) {
                        plugin.store.updateTask(task.id, { title: content });
                    }
                    const date = dateOfBlock(blocks, row);
                    if (date && date !== task.startDate) {
                        plugin.store.updateTask(task.id, { startDate: date });
                    }
                    if (row.type === "i" && row.subtype === "t") {
                        const checked = /^-\s*\[[xX]\]/.test(row.markdown || "");
                        if (checked && !task.completedAt && task.status !== "abandoned") {
                            plugin.store.updateTask(task.id, { status: "done", completedAt: Date.now() });
                        } else if (!checked && task.status === "done" && task.completedAt) {
                            plugin.store.updateTask(task.id, { status: "todo", completedAt: null });
                        }
                    }
                }
                await autoCreate(blocks, existing);
            }
        } finally {
            busy = false;
        }
    };
    const timer = window.setInterval(tick, 4000);
    void tick();
    return () => window.clearInterval(timer);
}
