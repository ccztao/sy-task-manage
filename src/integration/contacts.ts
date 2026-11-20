import { api } from "../api";

export interface Contact {
    id: string;
    name: string;
}

interface ContactCache {
    at: number;
    items: Contact[];
}

let cache: ContactCache | null = null;
const CACHE_MS = 60_000;

/** 从 Mankeep 笔记本读取联系人（带 custom-avs 属性的人物文档） */
export async function loadContacts(force = false): Promise<Contact[]> {
    if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.items;
    try {
        const notebooks = await api<{ notebooks: Array<{ id: string; name: string }> }>("/api/notebook/lsNotebooks");
        const boxes = (notebooks.notebooks || []).filter(
            n => (n.name || "").toLowerCase().includes("mankeep") || (n.name || "").includes("人脉")
        );
        if (!boxes.length) {
            cache = { at: Date.now(), items: [] };
            return [];
        }
        const ids = boxes.map(n => `'${n.id.replace(/'/g, "''")}'`).join(",");
        // 思源 SQL API 单次最多返回 64 行，联系人超过 64 时需要分页
        const rows: Array<{ id: string; content: string }> = [];
        let offset = 0;
        while (true) {
            const page = await api<Array<{ id: string; content: string }>>("/api/query/sql", {
                stmt: `SELECT id, content FROM blocks WHERE type = 'd' AND box IN (${ids}) AND ial LIKE '%custom-avs%' ORDER BY created LIMIT 64 OFFSET ${offset}`,
            });
            const list = page || [];
            rows.push(...list);
            if (list.length < 64) break;
            offset += 64;
            if (offset > 2000) break;
        }
        const contacts = rows
            .filter(row => row.content && !/联系人总表|人脉数据备份/.test(row.content))
            .map(row => ({ id: row.id, name: row.content.trim() }) as Contact);

        const seen = new Set<string>();
        const items = contacts
            .filter((c): c is Contact => !!c && !!c.name && !seen.has(c.name) && !!seen.add(c.name))
            .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
        cache = { at: Date.now(), items };
        return items;
    } catch (err) {
        console.warn("[stm] load contacts failed", err);
        cache = { at: Date.now(), items: [] };
        return [];
    }
}
