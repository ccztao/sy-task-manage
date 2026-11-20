import { api, getBlockRow, type BlockRow } from "../api";
import { parseDateFromText } from "../domain/date";

const escape = (id: string) => id.replace(/'/g, "''");

/**
 * 找到块所在文档中“最近的日期标题”，用于把正文块设为事项时自动带入日期。
 * 先看块自身/文档标题，再沿父级向上找同级的最近标题块。
 */
export async function resolveDateForBlock(blockId: string): Promise<string | null> {
    try {
        const row = await getBlockRow(blockId);
        if (!row) return null;

        const own = parseDateFromText(row.content);
        if (own && (row.type === "h" || row.type === "d")) return own;

        let current: BlockRow | null = row;
        for (let depth = 0; depth < 8 && current; depth++) {
            const parentId = current.parent_id;
            if (!parentId || parentId === current.id) break;
            const parent = await getBlockRow(parentId);

            // 思源会把标题下的块 parent 指向标题块：日期标题就是最近的上下文
            if (parent && (parent.type === "h" || parent.type === "d")) {
                const parentDate = parseDateFromText(parent.content);
                if (parentDate) return parentDate;
            }

            // 兼容标题与正文同级的文档结构
            const sort = Number(current.sort) || 0;
            const rows = await api<BlockRow[]>("/api/query/sql", {
                stmt: `SELECT id, type, content, parent_id, sort, root_id FROM blocks
                       WHERE parent_id = '${escape(parentId)}' AND type = 'h' AND sort < ${sort}
                       ORDER BY sort DESC LIMIT 1`,
            });
            const headingDate = rows?.[0] ? parseDateFromText(rows[0].content) : null;
            if (headingDate) return headingDate;

            current = parent;
        }

        // 兜底：同一文档内该块之前最近的标题
        if (row.root_id && row.root_id !== row.id) {
            const rows = await api<BlockRow[]>("/api/query/sql", {
                stmt: `SELECT id, type, content FROM blocks
                       WHERE root_id = '${escape(row.root_id)}' AND type = 'h' AND sort < ${Number(row.sort) || 0}
                       ORDER BY sort DESC LIMIT 1`,
            });
            return rows?.[0] ? parseDateFromText(rows[0].content) : null;
        }
        return null;
    } catch (err) {
        console.warn("[stm] resolve date for block failed", err);
        return null;
    }
}
