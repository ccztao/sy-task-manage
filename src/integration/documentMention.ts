import { getAllEditor, showMessage } from "siyuan";
import type STMPlugin from "../index";
import { loadContacts, type Contact } from "./contacts";
import { blockIdOfNode, contactMentions } from "./contactMentions";
import { ensureDateHeading, pruneEmptyDateHeadings, tagDateHeadings } from "./dateHeadings";
import { getBlockRow } from "../api";
import { addDays, parseDateFromText, todayStr } from "../domain/date";

function dateForQuery(query: string): string | null {
    const q = query.trim();
    if (!q) return null;
    if (q === "今天" || q === "today") return todayStr();
    if (q === "明天") return addDays(todayStr(), 1);
    if (q === "后天") return addDays(todayStr(), 2);
    if (q === "昨天") return addDays(todayStr(), -1);
    return parseDateFromText(q);
}

/**
 * 在思源编辑器里直接输入 @ 提及 Mankeep 联系人。
 * 通过 contenteditable 的选区替换实现，尽量不干扰 Protyle 自身的输入模型。
 */
export function installDocumentMention(plugin: STMPlugin): () => void {
    let contacts: Contact[] = [];
    let popup: HTMLElement | null = null;
    let composing = false;
    let state: {
        wysiwyg: HTMLElement;
        node: Text;
        start: number;
        end: number;
        items: Contact[];
        active: number;
        query: string;
        dateItem: { date: string; label: string } | null;
    } | null = null;

    const attachedWysiwyg = new WeakSet<HTMLElement>();
    const migratedRoots = new Set<string>();
    const taggedRoots = new Set<string>();
    const prunedRoots = new Set<string>();
    const protyleByWysiwyg = new WeakMap<HTMLElement, any>();
    const listeners: Array<() => void> = [];

    let lastContactsAt = 0;
    const refreshContacts = () => {
        lastContactsAt = Date.now();
        void loadContacts(true).then(list => {
            contacts = list;
            lastContactsAt = Date.now();
            if (state) {
                // 重新过滤当前查询，否则只重绘旧结果，新联系人不会出现
                state.items = contacts.filter(c => !state!.query || c.name.toLowerCase().includes(state!.query.toLowerCase()));
                state.active = 0;
                render();
            }
        });
    };
    refreshContacts();
    const contactsTimer = window.setInterval(refreshContacts, 20_000);
    listeners.push(() => window.clearInterval(contactsTimer));

    const close = () => {
        popup?.remove();
        popup = null;
        state = null;
    };

    const buildPopup = () => {
        if (popup) return popup;
        popup = document.createElement("div");
        popup.className = "stm-mention-popup stm-protyle-mention";
        document.body.append(popup);
        return popup;
    };

    const render = () => {
        if (!popup || !state) return;
        popup.innerHTML = "";
        if (!state.items.length && !state.dateItem) {
            const empty = document.createElement("div");
            empty.className = "stm-mention-empty";
            empty.textContent = plugin.t("mentionNoMatch");
            popup.append(empty);
            return;
        }
        let offset = 0;
        if (state.dateItem) {
            const dateBtn = document.createElement("button");
            dateBtn.type = "button";
            dateBtn.className = `stm-mention-item stm-mention-date${state.active === 0 ? " is-active" : ""}`;
            dateBtn.innerHTML = `<span class="stm-mention-avatar">📅</span><span class="stm-mention-name"></span>`;
            dateBtn.querySelector(".stm-mention-name")!.textContent = plugin.t("insertDateHeading", state.dateItem.date);
            const prevent = (ev: Event) => {
                ev.preventDefault();
                ev.stopPropagation();
            };
            dateBtn.addEventListener("pointerdown", prevent);
            dateBtn.addEventListener("mousedown", prevent);
            dateBtn.addEventListener("click", ev => {
                ev.preventDefault();
                ev.stopPropagation();
                pickDate(state!.dateItem!.date);
            });
            dateBtn.addEventListener("mouseenter", () => {
                if (!state) return;
                state.active = 0;
                popup?.querySelectorAll(".stm-mention-item").forEach((el, i) => el.classList.toggle("is-active", i === 0));
            });
            popup.append(dateBtn);
            offset = 1;
        }
        state.items.forEach((contact, index) => {
            const itemIndex = index + offset;
            const item = document.createElement("button");
            item.type = "button";
            item.className = `stm-mention-item${itemIndex === state!.active ? " is-active" : ""}`;
            item.innerHTML = `<span class="stm-mention-avatar">👤</span><span class="stm-mention-name"></span>`;
            item.querySelector(".stm-mention-name")!.textContent = contact.name;
            const prevent = (ev: Event) => {
                ev.preventDefault();
                ev.stopPropagation();
            };
            item.addEventListener("pointerdown", prevent);
            item.addEventListener("mousedown", prevent);
            item.addEventListener("click", ev => {
                ev.preventDefault();
                ev.stopPropagation();
                pick(contact);
            });
            item.addEventListener("mouseenter", () => {
                if (!state) return;
                state.active = itemIndex;
                popup?.querySelectorAll(".stm-mention-item").forEach((el, i) => el.classList.toggle("is-active", i === itemIndex));
            });
            popup!.append(item);
        });
    };

    const position = () => {
        if (!popup || !state) return;
        const range = document.createRange();
        range.setStart(state.node, state.start);
        range.setEnd(state.node, state.end);
        let rect = range.getBoundingClientRect();
        if (!rect || (!rect.width && !rect.height)) {
            rect = (state.node.parentElement || state.wysiwyg).getBoundingClientRect();
        }
        const width = Math.min(280, Math.max(200, rect.width + 120));
        let left = rect.left;
        let top = rect.bottom + 4;
        if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
        if (top + 240 > window.innerHeight - 8) top = Math.max(8, rect.top - 240);
        popup.style.left = `${Math.max(8, left)}px`;
        popup.style.top = `${top}px`;
        popup.style.width = `${width}px`;
    };

    const pickDate = (date: string) => {
        if (!state) return;
        const snapshot = state;
        const node = snapshot.node;
        const blockId = blockIdOfNode(node);
        close();
        if (!blockId) return;
        // 插入日期标题后不再保留正文里的 “@日期”
        deleteMentionText(snapshot.wysiwyg, node, snapshot.start, snapshot.end);
        void (async () => {
            try {
                const row = await getBlockRow(blockId);
                if (!row) return;
                const docId = row.type === "d" ? row.id : row.root_id;
                if (!docId) return;
                const headingId = await ensureDateHeading(docId, date, plugin.store.settings.dateHeadingLevel);
                if (headingId) showMessage(plugin.t("dateHeadingCreated", date), 2500, "info");
            } catch (err) {
                console.warn("[stm] insert date heading failed", err);
            }
        })();
    };

    const pick = (contact: Contact) => {
        if (!state) return;
        const snapshot = state;
        close();
        const blockId = blockIdOfNode(snapshot.node);
        if (!blockId) return;
        void contactMentions.insertMention(blockId, contact, snapshot.query).then(ok => {
            if (!ok) {
                // 保底：更新块失败时退回插入纯文本
                try {
                    wysiwygFallback(snapshot.wysiwyg, snapshot.node, snapshot.start, snapshot.end, `@${contact.name} `);
                } catch (err) {
                    console.warn("[stm] fallback mention insert failed", err);
                }
            }
        });
    };

    const deleteMentionText = (wysiwyg: HTMLElement, node: Text, start: number, end: number) => {
        try {
            wysiwyg.focus({ preventScroll: true });
            const selection = window.getSelection();
            const range = document.createRange();
            range.setStart(node, start);
            range.setEnd(node, end);
            selection?.removeAllRanges();
            selection?.addRange(range);
            const ok = document.execCommand("delete", false);
            if (!ok) {
                range.deleteContents();
                wysiwyg.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
            }
        } catch (err) {
            console.warn("[stm] delete date mention failed", err);
        }
    };

    const wysiwygFallback = (wysiwyg: HTMLElement, node: Text, start: number, end: number, text: string) => {
        wysiwyg.focus({ preventScroll: true });
        const selection = window.getSelection();
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        selection?.removeAllRanges();
        selection?.addRange(range);
        const ok = document.execCommand("insertText", false, text);
        if (!ok) {
            range.deleteContents();
            range.insertNode(document.createTextNode(text));
            wysiwyg.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
        }
    };

    const update = (wysiwyg: HTMLElement) => {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount || !selection.isCollapsed) {
            close();
            return;
        }
        const node = selection.anchorNode;
        if (!node || node.nodeType !== Node.TEXT_NODE || !wysiwyg.contains(node)) {
            close();
            return;
        }
        const parent = (node as Text).parentElement;
        if (parent?.closest('[data-type="NodeCodeBlock"], [data-type="NodeHTMLBlock"], [data-type="NodeMathBlock"]')) {
            close();
            return;
        }
        const text = (node as Text).data;
        const offset = selection.anchorOffset;
        const before = text.slice(0, offset);
        const match = before.match(/@([^\s@]*)$/);
        if (!match) {
            close();
            return;
        }
        if (!state && (!contacts.length || Date.now() - lastContactsAt > 8_000)) refreshContacts();
        const query = match[1];
        const items = contacts.filter(c => !query || c.name.toLowerCase().includes(query.toLowerCase()));
        const dateItem = dateForQuery(query) ? { date: dateForQuery(query)!, label: dateForQuery(query)! } : null;
        // 即使暂时没有联系人，也先保留弹层；联系人刷新完成后会重新填充
        state = {
            wysiwyg,
            node: node as Text,
            start: offset - query.length - 1,
            end: offset,
            items,
            active: 0,
            query,
            dateItem,
        };
        buildPopup();
        render();
        position();
    };

    const onKeyDown = (ev: KeyboardEvent) => {
        if (!state) return;
        const offset = state.dateItem ? 1 : 0;
        const count = Math.max(state.items.length + offset, 1);
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
            ev.preventDefault();
            ev.stopPropagation();
            state.active = ev.key === "ArrowDown" ? (state.active + 1) % count : (state.active - 1 + count) % count;
            render();
        } else if (ev.key === "Enter") {
            ev.preventDefault();
            ev.stopPropagation();
            if (state.dateItem && state.active === 0) {
                pickDate(state.dateItem.date);
            } else if (state.items[state.active - offset]) {
                pick(state.items[state.active - offset]);
            }
        } else if (ev.key === "Escape") {
            ev.preventDefault();
            ev.stopPropagation();
            close();
        }
    };

    const onDocMouseDown = (ev: MouseEvent) => {
        if (!state) return;
        if (popup && !popup.contains(ev.target as Node)) close();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    listeners.push(() => document.removeEventListener("mousedown", onDocMouseDown));

    const onScroll = () => close();
    window.addEventListener("scroll", onScroll, true);
    listeners.push(() => window.removeEventListener("scroll", onScroll, true));

    const attach = (wysiwyg: HTMLElement) => {
        if (attachedWysiwyg.has(wysiwyg)) return;
        attachedWysiwyg.add(wysiwyg);
        const onInput = () => update(wysiwyg);
        const onKeyUp = () => update(wysiwyg);
        const onCompositionStart = () => {
            composing = true;
        };
        const onCompositionEnd = () => {
            composing = false;
            // 中文输入法在 compositionend 后文本才稳定，补一次过滤
            window.setTimeout(() => update(wysiwyg), 0);
        };
        wysiwyg.addEventListener("input", onInput);
        wysiwyg.addEventListener("keyup", onKeyUp);
        wysiwyg.addEventListener("compositionstart", onCompositionStart);
        wysiwyg.addEventListener("compositionend", onCompositionEnd);
        wysiwyg.addEventListener("keydown", onKeyDown, true);
        listeners.push(() => {
            wysiwyg.removeEventListener("input", onInput);
            wysiwyg.removeEventListener("keyup", onKeyUp);
            wysiwyg.removeEventListener("compositionstart", onCompositionStart);
            wysiwyg.removeEventListener("compositionend", onCompositionEnd);
            wysiwyg.removeEventListener("keydown", onKeyDown, true);
        });
    };

    const attachProtyle = (protyle: any) => {
        const el = (protyle?.element || protyle?.protyle?.element)?.querySelector?.(".protyle-wysiwyg") as HTMLElement | undefined;
        if (!el) return;
        protyleByWysiwyg.set(el, protyle);
        attach(el);
        const rootId = protyle?.block?.rootID || protyle?.protyle?.block?.rootID;
        if (rootId && !taggedRoots.has(rootId)) {
            taggedRoots.add(rootId);
            window.setTimeout(() => void tagDateHeadings(rootId), 500);
        }
        if (rootId && !prunedRoots.has(rootId)) {
            prunedRoots.add(rootId);
            window.setTimeout(() => void pruneEmptyDateHeadings(rootId), 1500);
        }
        if (rootId && !migratedRoots.has(rootId)) {
            migratedRoots.add(rootId);
            window.setTimeout(() => {
                void contactMentions.migrateDocument(rootId).then(count => {
                    if (count > 0) showMessage(plugin.t("mentionsLinked", count), 3000, "info");
                });
            }, 800);
        }
    };

    try {
        for (const editor of getAllEditor()) attachProtyle(editor);
    } catch (err) {
        console.warn("[stm] attach document mention failed", err);
    }
    // 兜底：有些 Web 端/恢复的页签不会触发 loaded-protyle，直接扫 DOM 并监听新增
    const attachAll = () => {
        try {
            document.querySelectorAll<HTMLElement>(".protyle-wysiwyg").forEach(el => attach(el));
        } catch (err) {
            console.warn("[stm] attach document mention DOM scan failed", err);
        }
    };
    attachAll();
    const observer = new MutationObserver(() => attachAll());
    observer.observe(document.body, { childList: true, subtree: true });
    listeners.push(() => observer.disconnect());
    const onFocusIn = (event: FocusEvent) => {
        const el = (event.target as Element | null)?.closest?.(".protyle-wysiwyg") as HTMLElement | null;
        if (el) attach(el);
    };
    document.addEventListener("focusin", onFocusIn, true);
    listeners.push(() => document.removeEventListener("focusin", onFocusIn, true));

    const onLoaded = (event: any) => {
        if (event?.detail?.protyle) attachProtyle(event.detail.protyle);
    };
    plugin.eventBus.on("loaded-protyle-static", onLoaded);
    plugin.eventBus.on("loaded-protyle-dynamic", onLoaded);
    listeners.push(() => plugin.eventBus.off("loaded-protyle-static", onLoaded));
    listeners.push(() => plugin.eventBus.off("loaded-protyle-dynamic", onLoaded));

    return () => {
        close();
        for (const cleanup of listeners.splice(0)) {
            try {
                cleanup();
            } catch (err) {
                console.warn("[stm] cleanup document mention failed", err);
            }
        }
    };
}
