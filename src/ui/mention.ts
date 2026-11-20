import type { Contact } from "../integration/contacts";

export interface MentionOptions {
    noMatchText?: string;
}

/** 在输入框/文本域中支持 @联系人，选中后插入 @姓名 */
export function attachMention(
    input: HTMLInputElement | HTMLTextAreaElement,
    contacts: Contact[],
    options: MentionOptions = {}
): () => void {
    let popup: HTMLElement | null = null;
    let filtered: Contact[] = [];
    let active = 0;
    let open = false;
    let query = "";

    const close = () => {
        open = false;
        popup?.remove();
        popup = null;
        filtered = [];
        active = 0;
    };

    const position = () => {
        if (!popup) return;
        const rect = input.getBoundingClientRect();
        popup.style.left = `${rect.left}px`;
        popup.style.top = `${rect.bottom + 4}px`;
        popup.style.width = `${Math.max(200, rect.width)}px`;
    };

    const render = () => {
        if (!popup) return;
        popup.innerHTML = "";
        if (!filtered.length) {
            const empty = document.createElement("div");
            empty.className = "stm-mention-empty";
            empty.textContent = options.noMatchText || "无匹配联系人";
            popup.append(empty);
            return;
        }
        filtered.forEach((contact, index) => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = `stm-mention-item${index === active ? " is-active" : ""}`;
            item.innerHTML = `<span class="stm-mention-avatar">👤</span><span class="stm-mention-name"></span>`;
            item.querySelector(".stm-mention-name")!.textContent = contact.name;
            item.addEventListener("mousedown", ev => {
                ev.preventDefault();
                ev.stopPropagation();
                pick(contact);
            });
            item.addEventListener("mouseenter", () => {
                active = index;
                popup?.querySelectorAll(".stm-mention-item").forEach((el, i) => el.classList.toggle("is-active", i === index));
            });
            popup!.append(item);
        });
    };

    const currentMatch = () => {
        const pos = input.selectionStart ?? input.value.length;
        const before = input.value.slice(0, pos);
        const match = before.match(/@([^\s@]*)$/);
        return match ? { query: match[1], at: pos - match[1].length - 1 } : null;
    };

    const update = () => {
        const match = currentMatch();
        if (!match) {
            close();
            return;
        }
        query = match.query;
        filtered = contacts.filter(c => !query || c.name.toLowerCase().includes(query.toLowerCase()));
        if (!popup) {
            popup = document.createElement("div");
            popup.className = "stm-mention-popup";
            document.body.append(popup);
        }
        if (active >= filtered.length) active = 0;
        open = true;
        render();
        position();
    };

    const pick = (contact: Contact) => {
        const match = currentMatch();
        if (!match) {
            close();
            return;
        }
        const value = input.value;
        const pos = input.selectionStart ?? value.length;
        const next = value.slice(0, match.at) + `@${contact.name} ` + value.slice(pos);
        input.value = next;
        const caret = match.at + contact.name.length + 2;
        input.setSelectionRange(caret, caret);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus();
        close();
    };

    const onKeyDown = (ev: KeyboardEvent) => {
        if (!open) return;
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
            ev.preventDefault();
            ev.stopPropagation();
            const count = Math.max(filtered.length, 1);
            active = ev.key === "ArrowDown" ? (active + 1) % count : (active - 1 + count) % count;
            render();
        } else if (ev.key === "Enter") {
            if (filtered[active]) {
                ev.preventDefault();
                ev.stopPropagation();
                pick(filtered[active]);
            }
        } else if (ev.key === "Escape") {
            ev.preventDefault();
            ev.stopPropagation();
            close();
        }
    };

    const onDocMouseDown = (ev: MouseEvent) => {
        if (!open) return;
        const target = ev.target as Node;
        if (popup && !popup.contains(target) && target !== input) close();
    };

    const onBlur = () => window.setTimeout(close, 120);

    input.addEventListener("input", update);
    input.addEventListener("click", update);
    input.addEventListener("keydown", onKeyDown as EventListener, true);
    input.addEventListener("blur", onBlur);
    document.addEventListener("mousedown", onDocMouseDown);

    return () => {
        close();
        input.removeEventListener("input", update);
        input.removeEventListener("click", update);
        input.removeEventListener("keydown", onKeyDown as EventListener, true);
        input.removeEventListener("blur", onBlur);
        document.removeEventListener("mousedown", onDocMouseDown);
    };
}
