/** 隐私模式：保留长度，把每个可见字符（包括空格）都替换为 * */
export function maskText(text: string | null | undefined): string {
    const value = String(text || "");
    if (!value) return "****";
    return "*".repeat([...value].length);
}
