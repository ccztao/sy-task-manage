import { h } from "./dom";

function pad2(value: number): string {
    return String(value).padStart(2, "0");
}

/** 仿 Apple 的双列时间选择器，避免浏览器原生 time 弹层的突兀样式 */
export function attachTimePicker(input: HTMLInputElement): () => void {
    let popup: HTMLElement | null = null;

    const close = () => {
        popup?.remove();
        popup = null;
    };

    const syncSelection = () => {
        if (!popup) return;
        const [hour = "00", minute = "00"] = (input.value || "00:00").split(":");
        popup.querySelectorAll<HTMLElement>("[data-time-kind]").forEach(option => {
            const kind = option.dataset.timeKind;
            option.classList.toggle("is-active", kind === "hour" ? option.textContent === hour : option.textContent === minute);
        });
    };

    const pick = (kind: "hour" | "minute", value: string) => {
        const [hour = "00", minute = "00"] = (input.value || "00:00").split(":");
        input.value = kind === "hour" ? `${value}:${minute}` : `${hour}:${value}`;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        syncSelection();
        if (kind === "minute") close();
    };

    const buildColumn = (title: string, kind: "hour" | "minute", values: string[], current: string) => {
        const column = h("div", { class: "stm-time-column" });
        column.append(h("div", { class: "stm-time-column-title", text: title }));
        const list = h("div", { class: "stm-time-list" });
        for (const value of values) {
            const option = h("button", {
                class: `stm-time-option${value === current ? " is-active" : ""}`,
                text: value,
                dataset: { timeKind: kind },
            });
            option.type = "button";
            option.addEventListener("pointerdown", ev => ev.preventDefault());
            option.addEventListener("click", ev => {
                ev.preventDefault();
                ev.stopPropagation();
                pick(kind, value);
            });
            list.append(option);
        }
        column.append(list);
        return { column, list };
    };

    const open = () => {
        if (popup) {
            close();
            return;
        }
        const value = input.value.trim();
        const [hour = "", minute = ""] = value.includes(":") ? value.split(":") : [];
        const hours: string[] = [];
        for (let i = 0; i < 24; i++) hours.push(pad2(i));
        const minutes: string[] = [];
        for (let i = 0; i < 60; i++) minutes.push(pad2(i));

        popup = h("div", { class: "stm-time-popup" });
        const hourColumn = buildColumn("时", "hour", hours, hour);
        const minuteColumn = buildColumn("分", "minute", minutes, minute);
        popup.append(hourColumn.column, minuteColumn.column);
        document.body.append(popup);

        const rect = input.getBoundingClientRect();
        const width = 184;
        let left = rect.left;
        let top = rect.bottom + 4;
        if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
        if (top + 330 > window.innerHeight - 8) top = Math.max(8, rect.top - 334);
        popup.style.left = `${Math.max(8, left)}px`;
        popup.style.top = `${top}px`;
        popup.style.width = `${width}px`;

        for (const list of [hourColumn.list, minuteColumn.list]) {
            const active = list.querySelector(".stm-time-option.is-active") as HTMLElement | null;
            if (active) list.scrollTop = Math.max(0, active.offsetTop - list.clientHeight / 2 + active.clientHeight / 2);
        }
    };

    const onDocumentDown = (event: MouseEvent) => {
        if (!popup) return;
        const target = event.target as Node;
        if (!popup.contains(target) && target !== input) close();
    };

    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") close();
    };

    input.addEventListener("click", open);
    document.addEventListener("mousedown", onDocumentDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
        close();
        input.removeEventListener("click", open);
        document.removeEventListener("mousedown", onDocumentDown, true);
        document.removeEventListener("keydown", onKeyDown, true);
    };
}
