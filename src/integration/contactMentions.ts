import type STMPlugin from "../index";
import { openTab } from "siyuan";
import { api, getBlockAttrs } from "../api";
import { loadContacts, type Contact } from "./contacts";

interface MentionRef {
    blockId: string;
    contactId: string;
    name: string;
}

const FILE = "contact-mentions.json";
const SYNC_MS = 30_000;

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 去掉 kramdown 末尾的块属性行，updateBlock 只需要正文 markdown */
export function stripBlockAttrs(kramdown: string): string {
    return kramdown.replace(/\r?\n\{:[^}]*\}\s*$/, "").trimEnd();
}

/** 联系人提及使用普通链接，避免块引用自带的文档图标造成识别异常 */
const LINK_PREFIX = "siyuan://plugins/sy-task-manage/contact/";

export function mentionLink(contactId: string, name: string): string {
    return `[@${name}](${LINK_PREFIX}${contactId})`;
}

/** 匹配正文里的纯文本 @姓名，避开链接标签和已经转换过的引用 */
export function plainMentionPattern(name: string): RegExp {
    const n = escapeRegex(name);
    return new RegExp(`(?<![\\w"@\\u4e00-\\u9fa5\\[])@${n}(?![\\w"\\u4e00-\\u9fa5\\]])`, "g");
}

/** 把块引用或旧链接统一替换为普通链接，并更新名字 */
export function replaceMentionAnchor(kramdown: string, contactId: string, newName: string): string {
    const id = escapeRegex(contactId);
    const icon = `(?:<span data-type="text">📄</span>\u200b?)?`;
    const refPattern = new RegExp(`${icon}\\(\\(${id}\\s+"[^"]*"\\)\\)`, "g");
    const linkPattern = new RegExp(
        `${icon}\\[@[^\\]]*\\]\\((?:siyuan:\\/\\/blocks\\/|siyuan:\\/\\/plugins\\/sy-task-manage\\/contact\\/)${id}\\)`,
        "g"
    );
    const link = mentionLink(contactId, newName);
    return kramdown.replace(refPattern, link).replace(linkPattern, link);
}

function blockIdOfNode(node: Node): string | null {
    let el: HTMLElement | null = node.parentElement;
    while (el) {
        const id = el.getAttribute("data-node-id");
        if (id) return id;
        el = el.parentElement;
    }
    return null;
}

class ContactMentionRegistry {
    private plugin: STMPlugin | null = null;
    private items: MentionRef[] = [];
    private lastNames = new Map<string, string>();
    private timer: number | null = null;
    private syncing = false;
    private dirty = false;
    private cleanupLinks: Array<() => void> = [];
    private lastOpened = 0;

    async init(plugin: STMPlugin): Promise<void> {
        this.plugin = plugin;
        try {
            const raw = await plugin.loadData(FILE);
            if (Array.isArray(raw)) {
                this.items = raw.filter((x: any) => x && x.blockId && x.contactId && typeof x.name === "string");
            }
        } catch (err) {
            console.warn("[stm] load contact mentions failed", err);
        }
        await this.pruneMissingRefs();
        const contacts = await loadContacts();
        this.lastNames = new Map(contacts.map(c => [c.id, c.name]));
        // 插件关闭期间联系人可能被改名：用注册表里的旧名字触发一次同步
        for (const ref of this.items) {
            const current = contacts.find(c => c.id === ref.contactId);
            if (current && current.name !== ref.name) this.lastNames.set(ref.contactId, ref.name);
        }
        await this.migrateRegistryToLinks();
        await this.sync(true);
        this.installLinkHandler();
        this.timer = window.setInterval(() => void this.sync(true), SYNC_MS);
    }

    async stop(): Promise<void> {
        if (this.timer !== null) window.clearInterval(this.timer);
        this.timer = null;
        for (const cleanup of this.cleanupLinks) cleanup();
        this.cleanupLinks = [];
    }

    private installLinkHandler(): void {
        const open = (href: string) => {
            if (!href.startsWith(LINK_PREFIX)) return false;
            const id = href.slice(LINK_PREFIX.length).split(/[?#]/)[0];
            if (!id) return false;
            const now = Date.now();
            if (now - this.lastOpened < 500) return true;
            this.lastOpened = now;
            const app = this.plugin?.app;
            if (!app) return false;
            void openTab({ app, doc: { id } });
            return true;
        };
        const onClick = (event: MouseEvent) => {
            const target = event.target as Element | null;
            const link = target?.closest?.("[data-href], a") as HTMLElement | null;
            const href = link?.getAttribute("data-href") || link?.getAttribute("href") || "";
            if (open(href)) {
                event.preventDefault();
                event.stopPropagation();
            }
        };
        document.addEventListener("click", onClick, true);
        this.cleanupLinks.push(() => document.removeEventListener("click", onClick, true));
        const onUrl = (event: any) => {
            const url = event?.detail?.url || event?.url || "";
            open(String(url));
        };
        this.plugin?.eventBus.on("open-siyuan-url-plugin", onUrl);
        this.cleanupLinks.push(() => this.plugin?.eventBus.off("open-siyuan-url-plugin", onUrl));
    }

    private async save(): Promise<void> {
        if (!this.plugin || !this.dirty) return;
        try {
            await this.plugin.saveData(FILE, this.items);
            this.dirty = false;
        } catch (err) {
            console.warn("[stm] save contact mentions failed", err);
        }
    }

    /** 清掉已经删除的块登记，避免初始化时 API 报 block not found */
    private async pruneMissingRefs(): Promise<void> {
        const ids = [...new Set(this.items.map(r => r.blockId))];
        if (!ids.length) return;
        try {
            const list = ids.map(id => `'${id.replace(/'/g, "''")}'`).join(",");
            const rows = await api<Array<{ id: string }>>("/api/query/sql", {
                stmt: `select id from blocks where id in (${list})`,
            });
            const alive = new Set((rows || []).map(r => r.id));
            const before = this.items.length;
            this.items = this.items.filter(r => alive.has(r.blockId));
            if (this.items.length !== before) {
                this.dirty = true;
                await this.save();
            }
        } catch (err) {
            console.warn("[stm] prune missing contact refs failed", err);
        }
    }

    async removeBlock(blockId: string): Promise<void> {
        const before = this.items.length;
        this.items = this.items.filter(r => r.blockId !== blockId);
        if (this.items.length !== before) {
            this.dirty = true;
            await this.save();
        }
    }

    async add(blockId: string, contact: Contact, persist = true): Promise<void> {
        const exists = this.items.find(x => x.blockId === blockId && x.contactId === contact.id);
        if (exists) {
            if (exists.name !== contact.name) {
                exists.name = contact.name;
                this.dirty = true;
            }
        } else {
            this.items.push({ blockId, contactId: contact.id, name: contact.name });
            this.dirty = true;
        }
        this.lastNames.set(contact.id, contact.name);
        if (persist) await this.save();
    }

    /** 把当前文档里已有的纯文本 @姓名 转成指向联系人文档的引用 */
    async migrateDocument(rootId: string): Promise<number> {
        if (!this.plugin || !rootId) return 0;
        try {
            const contacts = (await loadContacts()).slice().sort((a, b) => b.name.length - a.name.length);
            if (!contacts.length) return 0;
            const rows = await api<Array<{ id: string }>>("/api/query/sql", {
                stmt: `SELECT id FROM blocks WHERE root_id = '${rootId.replace(/'/g, "''")}' AND content LIKE '%@%' AND type IN ('p','h','i','l','t','b','s')`,
            });
            let linked = 0;
            for (const row of rows || []) {
                try {
                    const data = await api<{ kramdown: string }>("/api/block/getBlockKramdown", { id: row.id });
                    let kramdown = data?.kramdown || "";
                    let changed = false;
                    for (const contact of contacts) {
                        const hadRef = kramdown.includes(`((${contact.id}`) || kramdown.includes(`siyuan://blocks/${contact.id}`);
                        const withLink = replaceMentionAnchor(kramdown, contact.id, contact.name);
                        if (withLink !== kramdown) {
                            kramdown = withLink;
                            changed = true;
                            if (hadRef) {
                                linked++;
                                await this.add(row.id, contact, false);
                            }
                        }
                        const pattern = plainMentionPattern(contact.name);
                        const link = mentionLink(contact.id, contact.name);
                        const next = kramdown.replace(pattern, link);
                        if (next !== kramdown) {
                            kramdown = next;
                            changed = true;
                            linked++;
                            await this.add(row.id, contact, false);
                        }
                    }
                    if (changed) {
                        await api("/api/block/updateBlock", {
                            id: row.id,
                            dataType: "markdown",
                            data: stripBlockAttrs(kramdown),
                        });
                    }
                } catch (err) {
                    console.warn("[stm] migrate block mention failed", err);
                }
            }
            if (linked > 0 || this.dirty) await this.save();
            return linked;
        } catch (err) {
            console.warn("[stm] migrate document mentions failed", err);
            return 0;
        }
    }

    /** 把某个块里新输入的纯文本 @姓名 重新变成联系人链接（编辑标题后调用） */
    async linkifyBlock(blockId: string): Promise<number> {
        try {
            const contacts = (await loadContacts()).slice().sort((a, b) => b.name.length - a.name.length);
            if (!contacts.length) return 0;
            const data = await api<{ kramdown: string }>("/api/block/getBlockKramdown", { id: blockId });
            let kramdown = data?.kramdown || "";
            const before = kramdown;
            let linked = 0;
            for (const contact of contacts) {
                const next = replaceMentionAnchor(kramdown, contact.id, contact.name);
                if (next !== kramdown) {
                    kramdown = next;
                    linked++;
                }
                const pattern = plainMentionPattern(contact.name);
                const link = mentionLink(contact.id, contact.name);
                const after = kramdown.replace(pattern, link);
                if (after !== kramdown) {
                    kramdown = after;
                    linked++;
                    await this.add(blockId, contact, false);
                }
            }
            if (kramdown !== before) {
                await api("/api/block/updateBlock", {
                    id: blockId,
                    dataType: "markdown",
                    data: stripBlockAttrs(kramdown),
                });
            }
            if (this.dirty) await this.save();
            return linked;
        } catch (err) {
            console.warn("[stm] linkify block failed", err);
            return 0;
        }
    }

    /** 把正文中的 @query 替换成指向联系人文档的块引用 */
    async insertMention(blockId: string, contact: Contact, query: string): Promise<boolean> {
        try {
            const data = await api<{ kramdown: string }>("/api/block/getBlockKramdown", { id: blockId });
            const kramdown = data?.kramdown || "";
            const needle = `@${query}`;
            const index = kramdown.lastIndexOf(needle);
            if (index < 0) return false;
            const link = mentionLink(contact.id, contact.name);
            const next = kramdown.slice(0, index) + link + kramdown.slice(index + needle.length);
            await api("/api/block/updateBlock", {
                id: blockId,
                dataType: "markdown",
                data: stripBlockAttrs(next),
            });
            await this.add(blockId, contact);
            return true;
        } catch (err) {
            console.warn("[stm] insert contact mention failed", err);
            return false;
        }
    }

    /** 把注册表里仍然存在的块引用统一换成普通链接，去掉文档图标 */
    private async migrateRegistryToLinks(): Promise<void> {
        const seen = new Set<string>();
        for (const ref of this.items) {
            if (seen.has(ref.blockId)) continue;
            seen.add(ref.blockId);
            try {
                const data = await api<{ kramdown: string }>("/api/block/getBlockKramdown", { id: ref.blockId });
                const kramdown = data?.kramdown || "";
                let next = kramdown;
                for (const contact of this.items.filter(x => x.blockId === ref.blockId)) {
                    next = replaceMentionAnchor(next, contact.contactId, contact.name);
                }
                if (next !== kramdown) {
                    await api("/api/block/updateBlock", {
                        id: ref.blockId,
                        dataType: "markdown",
                        data: stripBlockAttrs(next),
                    });
                }
            } catch (err) {
                console.warn(`[stm] migrate mention link for block ${ref.blockId} failed`, err);
            }
        }
    }

    async sync(force = false): Promise<void> {
        if (!this.plugin || this.syncing) return;
        this.syncing = true;
        try {
            const contacts = await loadContacts(force);
            const changed = contacts.filter(c => {
                const old = this.lastNames.get(c.id);
                return old !== undefined && old !== c.name;
            });
            this.lastNames = new Map(contacts.map(c => [c.id, c.name]));
            if (!changed.length) return;
            for (const contact of changed) {
                const refs = this.items.filter(r => r.contactId === contact.id);
                for (const ref of refs) {
                    try {
                        const data = await api<{ kramdown: string }>("/api/block/getBlockKramdown", { id: ref.blockId });
                        const kramdown = data?.kramdown || "";
                        const next = replaceMentionAnchor(kramdown, contact.id, contact.name);
                        if (next === kramdown) continue;
                        await api("/api/block/updateBlock", {
                            id: ref.blockId,
                            dataType: "markdown",
                            data: stripBlockAttrs(next),
                        });
                        ref.name = contact.name;
                        this.dirty = true;
                    } catch (err) {
                        console.warn(`[stm] sync mention for block ${ref.blockId} failed`, err);
                    }
                }
            }
            await this.save();
        } finally {
            this.syncing = false;
        }
    }
}

export const contactMentions = new ContactMentionRegistry();
export { blockIdOfNode };
