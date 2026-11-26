import { addDays, todayStr } from "./date";

export interface QuickAddResult {
    title: string;
    date: string;
    time: string | null;
}

export function parseQuickAdd(input: string, baseDate = todayStr()): QuickAddResult {
    let text = input.trim();
    let date: string | null = null;
    let time: string | null = null;
    const base = new Date(`${baseDate}T12:00:00`);

    const explicit = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
    if (explicit) {
        const y = Number(explicit[1]);
        const m = Number(explicit[2]);
        const d = Number(explicit[3]);
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            text = text.replace(explicit[0], " ");
        }
    }
    if (!date) {
        const md = /(\d{1,2})月(\d{1,2})日?/.exec(text);
        if (md) {
            const m = Number(md[1]);
            const d = Number(md[2]);
            if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
                date = `${base.getFullYear()}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                text = text.replace(md[0], " ");
            }
        }
    }
    if (!date) {
        const rel = /(大后天|后天|明天|今天)/.exec(text);
        if (rel) {
            const offset = rel[1] === "大后天" ? 3 : rel[1] === "后天" ? 2 : rel[1] === "明天" ? 1 : 0;
            date = addDays(baseDate, offset);
            text = text.replace(rel[0], " ");
        }
    }
    if (!date) {
        const week = /(下周|下星期|本周|这周|周|星期)([一二三四五六日天])/.exec(text);
        if (week) {
            const target = "一二三四五六日".indexOf(week[2] === "天" ? "日" : week[2]) + 1;
            const current = base.getDay() === 0 ? 7 : base.getDay();
            let offset = target - current;
            const prefix = week[1];
            if (prefix === "下周" || prefix === "下星期") offset += 7;
            else if (offset < 0 || (offset === 0 && !prefix.startsWith("周") && !prefix.startsWith("星期"))) offset += 7;
            date = addDays(baseDate, offset);
            text = text.replace(week[0], " ");
        }
    }

    const timeMatch = /(上午|下午|晚上|中午)?\s*(\d{1,2})(?::(\d{1,2})|点(半)?)/.exec(text);
    if (timeMatch) {
        let hour = Number(timeMatch[2]);
        const minute = timeMatch[4] === "半" ? 30 : Number(timeMatch[3] || 0);
        const period = timeMatch[1] || "";
        if ((period === "下午" || period === "晚上") && hour < 12) hour += 12;
        if (period === "中午" && hour < 11) hour += 12;
        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
            time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
            text = text.replace(timeMatch[0], " ");
        }
    }

    const title = text.replace(/\s+/g, " ").replace(/^[\s,，。;；:：]+|[\s,，。;；:：]+$/g, "").trim();
    return { title: title || input.trim(), date: date || baseDate, time };
}
