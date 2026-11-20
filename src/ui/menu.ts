import { Menu, type IMenu } from "siyuan";

export function showMenu(items: IMenu[], position: { x: number; y: number }): void {
    const menu = new Menu("stm-context-menu");
    for (const item of items) {
        if (item.label === "-") menu.addSeparator();
        else menu.addItem(item);
    }
    menu.open(position);
}

export function menuItem(label: string, icon: string, click: () => void): IMenu {
    return { label, icon, click } as IMenu;
}
