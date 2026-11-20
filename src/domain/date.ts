/** 本地日期工具：所有日期以 YYYY-MM-DD 字符串存储，避免时区漂移 */

const pad = (n: number) => String(n).padStart(2, "0");

export function toDateStr(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(s: string): Date {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}

export function isValidDateStr(s: string | null | undefined): s is string {
    return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseDate(s).getTime());
}

export function todayStr(now: Date = new Date()): string {
    return toDateStr(now);
}

export function timeStr(now: Date = new Date()): string {
    return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function addDays(dateStr: string, days: number): string {
    const d = parseDate(dateStr);
    d.setDate(d.getDate() + days);
    return toDateStr(d);
}

export function addMonths(dateStr: string, months: number): string {
    const d = parseDate(dateStr);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return toDateStr(d);
}

export function diffDays(from: string, to: string): number {
    const a = Date.UTC(...(from.split("-").map(Number) as [number, number, number]));
    const b = Date.UTC(...(to.split("-").map(Number) as [number, number, number]));
    return Math.round((b - a) / 86400000);
}

export function weekday(dateStr: string): number {
    return parseDate(dateStr).getDay();
}

export function isWeekend(dateStr: string): boolean {
    const w = weekday(dateStr);
    return w === 0 || w === 6;
}

export function toMs(dateStr: string, time?: string | null): number {
    const [y, m, d] = dateStr.split("-").map(Number);
    const [hh, mm] = time ? time.split(":").map(Number) : [0, 0];
    return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0).getTime();
}

/** 以 dayStartTime（默认 03:00）为一天的分界 */
export function logicalToday(dayStartTime = "03:00", now: Date = new Date()): string {
    const today = todayStr(now);
    const [hh, mm] = dayStartTime.split(":").map(Number);
    const minutesNow = now.getHours() * 60 + now.getMinutes();
    const boundary = (hh || 0) * 60 + (mm || 0);
    return minutesNow < boundary ? addDays(today, -1) : today;
}

const WEEK_CN = ["日", "一", "二", "三", "四", "五", "六"];

export function formatMonthDay(dateStr: string): string {
    const d = parseDate(dateStr);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function formatDateHuman(dateStr: string, today: string): string {
    const delta = diffDays(today, dateStr);
    if (delta === 0) return "今天";
    if (delta === 1) return "明天";
    if (delta === 2) return "后天";
    if (delta === -1) return "昨天";
    if (delta > 0 && delta < 7) return `周${WEEK_CN[weekday(dateStr)]}`;
    if (delta < 0) return `${formatMonthDay(dateStr)}`;
    const d = parseDate(dateStr);
    if (d.getFullYear() !== parseDate(today).getFullYear()) {
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }
    return formatMonthDay(dateStr);
}

export function formatDateTimeHuman(dateStr: string, time: string | null, today: string): string {
    return `${formatDateHuman(dateStr, today)}${time ? ` ${time}` : ""}`;
}

/** 相对完成时间：刚刚 / n 分钟前 / 今天 18:00 / 10月2日 */
export function formatRelativeTime(ms: number, now: number = Date.now()): string {
    const diff = Math.max(0, now - ms);
    if (diff < 60_000) return "刚刚";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    const d = new Date(ms);
    const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const ds = toDateStr(d);
    const today = todayStr(new Date(now));
    if (ds === today) return `今天 ${hhmm}`;
    if (ds === addDays(today, -1)) return `昨天 ${hhmm}`;
    return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function clampTime(t: string | null | undefined, fallback: string): string {
    return t && /^\d{2}:\d{2}$/.test(t) ? t : fallback;
}

export function startOfWeek(dateStr: string, weekStart: 0 | 1): string {
    const delta = (weekday(dateStr) - weekStart + 7) % 7;
    return addDays(dateStr, -delta);
}

export { pad };

/** 从标题/正文中识别日期，支持 2026-11-16、2026/11/16、2026.11.16、2026年11月16日、11月16日 */
export function parseDateFromText(text: string | null | undefined, baseToday: string = todayStr()): string | null {
    if (!text) return null;
    const source = String(text).trim();
    if (!source) return null;

    const make = (y: number, m: number, d: number): string | null => {
        if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
        if (m < 1 || m > 12 || d < 1 || d > 31) return null;
        const dt = new Date(y, m - 1, d);
        if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    };

    const full = source.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/);
    if (full) return make(Number(full[1]), Number(full[2]), Number(full[3]));

    const compact = source.match(/(?:^|\D)(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:\D|$)/);
    if (compact) return make(Number(compact[1]), Number(compact[2]), Number(compact[3]));

    const monthDay = source.match(/(?:^|\D)(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
    if (monthDay) {
        const year = parseDate(baseToday).getFullYear();
        return make(year, Number(monthDay[1]), Number(monthDay[2]));
    }

    return null;
}
