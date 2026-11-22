import { fetchSyncPost, openTab, platformUtils, showMessage, type App } from "siyuan";

export async function api<T = any>(url: string, data: Record<string, any> = {}): Promise<T> {
    const res: any = await fetchSyncPost(url, data);
    if (!res || res.code !== 0) {
        throw new Error(res?.msg || `API ${url} failed`);
    }
    return res.data as T;
}

export async function getBlockAttrs(id: string): Promise<Record<string, string>> {
    return api<Record<string, string>>("/api/attr/getBlockAttrs", { id });
}

export async function setBlockAttrs(id: string, attrs: Record<string, string>): Promise<void> {
    await api("/api/attr/setBlockAttrs", { id, attrs });
}

export interface BlockRow {
    id: string;
    type: string;
    root_id: string;
    parent_id?: string;
    sort?: number;
    content: string;
    box?: string;
    path?: string;
}

export async function getBlockRow(id: string): Promise<BlockRow | null> {
    try {
        const rows = await api<BlockRow[]>("/api/query/sql", {
            stmt: `SELECT id, type, root_id, parent_id, sort, content FROM blocks WHERE id = '${id.replace(/'/g, "''")}' LIMIT 1`,
        });
        return rows?.[0] || null;
    } catch {
        return null;
    }
}

/** 打开绑定的块/文档；失败时提示 */
export async function openBoundBlock(app: App, blockId: string): Promise<void> {
    try {
        const row = await getBlockRow(blockId);
        const rootId = row?.type === "d" ? blockId : row?.root_id || blockId;
        // 打开文档根，不把块 ID 作为 tab id；避免思源自动进入块聚焦/缩放
        await openTab({ app, doc: { id: rootId, zoomIn: false } });
        if (row && row.type !== "d") {
            const scrollToTarget = (attempt: number) => {
                const el = document.querySelector(`[data-node-id="${blockId}"]`);
                if (el) {
                    el.scrollIntoView({ block: "center", behavior: "smooth" });
                    return;
                }
                if (attempt < 6) window.setTimeout(() => scrollToTarget(attempt + 1), 300);
            };
            window.setTimeout(() => scrollToTarget(0), 350);
        }
    } catch (err) {
        console.error("[stm] open block failed", err);
        showMessage("无法打开绑定的块，可能已被删除", 4000, "error");
    }
}

export async function sendReminderNotification(title: string, body: string): Promise<boolean> {
    try {
        await platformUtils.sendNotification({
            channel: "事项管理",
            title,
            body,
            delayInSeconds: 0,
            timeoutType: "default",
        });
        return true;
    } catch (err) {
        console.warn("[stm] system notification failed", err);
    }
    try {
        if (typeof Notification !== "undefined") {
            if (Notification.permission === "granted") {
                new Notification(title, { body });
                return true;
            }
            if (Notification.permission !== "denied") {
                const permission = await Notification.requestPermission();
                if (permission === "granted") {
                    new Notification(title, { body });
                    return true;
                }
            }
        }
    } catch (err) {
        console.warn("[stm] web notification failed", err);
    }
    return false;
}

export interface ChildBlock {
    id: string;
    type: string;
    subType?: string;
    content: string;
    markdown?: string;
}

export async function getChildBlocks(id: string): Promise<ChildBlock[]> {
    try {
        return await api<ChildBlock[]>("/api/block/getChildBlocks", { id });
    } catch {
        return [];
    }
}

export async function prependBlock(parentID: string, markdown: string): Promise<void> {
    await api("/api/block/prependBlock", { parentID, dataType: "markdown", data: markdown });
}

export async function insertBlock(previousID: string, parentID: string, markdown: string): Promise<void> {
    await api("/api/block/insertBlock", { parentID, previousID, dataType: "markdown", data: markdown });
}

export async function moveBlock(id: string, previousID?: string, parentID?: string): Promise<void> {
    await api("/api/block/moveBlock", { id, previousID, parentID });
}

export async function deleteBlock(id: string): Promise<void> {
    await api("/api/block/deleteBlock", { id });
}
