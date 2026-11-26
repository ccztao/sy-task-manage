const P: Record<string, string> = {
    check: '<path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
    plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    calendar:
        '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 9.5h17M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    board:
        '<rect x="3.5" y="4.5" width="5.4" height="15" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="9.8" y="4.5" width="5.4" height="10" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="16.1" y="4.5" width="4.4" height="13" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.7"/>',
    eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 6.2A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.2 3.7M6.2 6.8C3.9 8.4 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.8-.4 4-1M9.9 9.9a3 3 0 0 0 4.2 4.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    settings: '<path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.38.5.65.91.7H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1.3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    gantt: '<path d="M4 6h8M4 12h13M4 18h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="15" cy="6" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/><circle cx="13" cy="18" r="2" fill="currentColor"/>',
    more: '<circle cx="5" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="19" cy="12" r="1.7" fill="currentColor"/>',
    edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    trash:
        '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    link: '<path d="M10.5 13.5l3-3M7.8 16.2l-1.3 1.3a3.4 3.4 0 0 1-4.8-4.8l3.2-3.2a3.4 3.4 0 0 1 4.8 0M16.2 7.8l1.3-1.3a3.4 3.4 0 0 1 4.8 4.8l-3.2 3.2a3.4 3.4 0 0 1-4.8 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    clock: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    flag: '<path d="M5 21V4M5 4h11l-1.5 4L16 12H5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    inbox: '<path d="M3.5 13.5l2.2-7h12.6l2.2 7v4.5a1.5 1.5 0 0 1-1.5 1.5h-14a1.5 1.5 0 0 1-1.5-1.5v-4.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3.5 13.5H9l1 2h4l1-2h5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    repeat: '<path d="M4 11a7 7 0 0 1 12-4.9L19 9M20 13a7 7 0 0 1-12 4.9L5 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 4v5h-5M5 20v-5h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    search: '<circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
    stats: '<path d="M4 20V11M9 20V5M14 20v-6M19 20V8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M2.5 20h19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 9h18M3 14h18M9 4v16" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    close: '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    folderPlus:
        '<path d="M3.5 8.5V7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V8.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 11v6M9 14h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
};

export function icon(name: keyof typeof P | string, size = 16): string {
    const path = P[name] || P.more;
    return `<svg class="stm-svg" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
}

/** 注册到思源图标系统，供 dock / 菜单使用 */
export const STM_SYMBOL = `<symbol id="iconSTM" viewBox="0 0 32 32">
  <rect x="4" y="5" width="24" height="22" rx="6" fill="none" stroke="currentColor" stroke-width="2.2"/>
  <path d="M10 12h12M10 17h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M10 22l2 2 4-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
</symbol>`;
