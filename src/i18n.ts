export type T = (key: string, ...args: Array<string | number>) => string;

/** 使用思源加载的插件 i18n（i18n/zh_CN.json、en.json），缺失时回退到 key */
export function createT(i18n: Record<string, any> | undefined): T {
    return (key: string, ...args: Array<string | number>) => {
        let text = i18n && typeof i18n[key] === "string" ? (i18n[key] as string) : key;
        args.forEach((arg, index) => {
            text = text.replace(new RegExp(`\\{${index}\\}`, "g"), String(arg));
        });
        return text;
    };
}
