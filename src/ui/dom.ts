export interface ElementProps {
    class?: string;
    text?: string;
    html?: string;
    title?: string;
    attrs?: Record<string, string | number | boolean | null | undefined>;
    dataset?: Record<string, string>;
    style?: Partial<CSSStyleDeclaration>;
    on?: Partial<Record<keyof HTMLElementEventMap, (ev: any) => void>>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props?: ElementProps | null,
    children?: Array<Node | string | null | undefined>
): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    if (props) {
        if (props.class) el.className = props.class;
        if (props.text !== undefined) el.textContent = props.text;
        if (props.html !== undefined) el.innerHTML = props.html;
        if (props.title) el.title = props.title;
        if (props.attrs) {
            for (const [k, v] of Object.entries(props.attrs)) {
                if (v === null || v === undefined || v === false) continue;
                el.setAttribute(k, String(v));
            }
        }
        if (props.dataset) {
            for (const [k, v] of Object.entries(props.dataset)) el.dataset[k] = v;
        }
        if (props.style) Object.assign(el.style, props.style);
        if (props.on) {
            for (const [k, fn] of Object.entries(props.on)) {
                if (fn) el.addEventListener(k, fn as EventListener);
            }
        }
    }
    for (const child of children || []) {
        if (child === null || child === undefined) continue;
        el.append(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return el;
}

export function clear(el: HTMLElement): void {
    while (el.firstChild) el.removeChild(el.firstChild);
}

export function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/** 对话框宽度：桌面保持原宽度，窄屏自动留出 24px 边距 */
export function dialogWidth(preferred: number): string {
    const viewport = typeof window === "undefined" ? preferred : window.innerWidth;
    const width = Math.min(preferred, Math.max(280, viewport - 24));
    return `${width}px`;
}
