import { getBlockRow } from "../api";
import { findProjectIdByDoc } from "../domain/projects";
import type { Store } from "../store";

/** 块所属文档关联的项目 ID */
export async function resolveProjectForBlock(store: Store, blockId: string): Promise<string | null> {
    try {
        const row = await getBlockRow(blockId);
        if (!row) return null;
        const docId = row.type === "d" ? row.id : row.root_id;
        return findProjectIdByDoc(store.projects, docId);
    } catch (err) {
        console.warn("[stm] resolve project for block failed", err);
        return null;
    }
}
