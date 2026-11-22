import type { T } from "../i18n";
import type { Project } from "../types";
import type { ProjectGroup } from "../domain/projects";
import { h } from "./dom";

function findProject(groups: ProjectGroup[], projectId: string): Project | null {
    for (const group of groups) {
        for (const project of group.projects) {
            if (project.id === projectId) return project;
        }
    }
    return null;
}

/** 可搜索的项目选择器：下拉 + 关键字过滤，按分类分组，和左侧项目列表使用同一份 groupProjects */
export function attachProjectPicker(
    display: HTMLInputElement,
    hidden: HTMLInputElement,
    getGroups: () => ProjectGroup[],
    t: T
): () => void {
    let popup: HTMLElement | null = null;

    const selectedLabel = () => {
        const groups = getGroups();
        const id = hidden.value;
        const project = id ? findProject(groups, id) : null;
        if (id && !project) hidden.value = "";
        return project ? `${project.emoji ? project.emoji + " " : ""}${project.name}` : t("noProject");
    };

    const syncDisplay = () => {
        display.value = selectedLabel();
    };

    const close = () => {
        popup?.remove();
        popup = null;
    };

    const choose = (projectId: string) => {
        hidden.value = projectId;
        syncDisplay();
        hidden.dispatchEvent(new Event("change", { bubbles: true }));
        close();
    };

    const renderList = (list: HTMLElement, query: string) => {
        list.innerHTML = "";
        const q = query.trim().toLowerCase();
        const groups = getGroups();
        const noProject = h("button", {
            class: `stm-project-picker-option${hidden.value ? "" : " is-active"}`,
            attrs: { type: "button" },
        }, [
            h("span", { class: "stm-project-no-icon", text: "⊘" }),
            h("span", { class: "stm-project-picker-option-name", text: t("noProject") }),
        ]);
        noProject.type = "button";
        noProject.addEventListener("click", () => choose(""));
        if (!q || t("noProject").toLowerCase().includes(q)) list.append(noProject);

        for (const group of groups) {
            const groupName = group.category || t("uncategorized");
            const matched = group.projects.filter(project =>
                !q || project.name.toLowerCase().includes(q) || groupName.toLowerCase().includes(q)
            );
            if (!matched.length) continue;
            list.append(h("div", { class: "stm-project-picker-group", text: groupName }));
            for (const project of matched) {
                const option = h("button", {
                    class: `stm-project-picker-option${project.id === hidden.value ? " is-active" : ""}`,
                    attrs: { type: "button" },
                }, [
                    h("span", { class: "stm-project-picker-option-dot", style: { background: project.color } }),
                    h("span", { class: "stm-project-picker-option-name", text: `${project.emoji ? project.emoji + " " : ""}${project.name}` }),
                ]);
                option.type = "button";
                option.addEventListener("click", () => choose(project.id));
                list.append(option);
            }
        }
        if (!list.childElementCount) {
            list.append(h("div", { class: "stm-project-picker-empty", text: t("noMatchProject") }));
        }
    };

    const open = () => {
        if (popup) {
            close();
            return;
        }
        popup = h("div", { class: "stm-project-popup" });
        const search = h("input", {
            class: "b3-text-field stm-project-search",
            attrs: { placeholder: t("searchProject"), autocomplete: "off" },
        }) as HTMLInputElement;
        const list = h("div", { class: "stm-project-picker-list" });
        popup.append(h("div", { class: "stm-project-popup-head" }, [search]), list);
        document.body.append(popup);
        renderList(list, "");
        search.addEventListener("input", () => renderList(list, search.value));
        search.addEventListener("keydown", event => {
            if (event.key === "Escape") close();
        });

        const rect = display.getBoundingClientRect();
        const width = Math.max(240, rect.width);
        let left = rect.left;
        let top = rect.bottom + 4;
        if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
        if (top + 330 > window.innerHeight - 8) top = Math.max(8, rect.top - 334);
        popup.style.left = `${Math.max(8, left)}px`;
        popup.style.top = `${top}px`;
        popup.style.width = `${width}px`;
        search.focus();
    };

    const onDocumentDown = (event: MouseEvent) => {
        if (!popup) return;
        const target = event.target as Node;
        if (!popup.contains(target) && target !== display) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") close();
    };

    display.addEventListener("click", open);
    display.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            open();
        }
    });
    document.addEventListener("mousedown", onDocumentDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    syncDisplay();
    return () => {
        close();
        display.removeEventListener("click", open);
        document.removeEventListener("mousedown", onDocumentDown, true);
        document.removeEventListener("keydown", onKeyDown, true);
    };
}
