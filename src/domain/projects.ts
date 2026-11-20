import type { Project } from "../types";
import { diffDays, todayStr } from "./date";

export type ProjectStatus = "none" | "upcoming" | "active" | "ended";

export interface ProjectGroup {
    category: string;
    projects: Project[];
}

/** 按分类分组，未分类排最后；组内按 sort 排序 */
export function groupProjects(projects: Project[]): ProjectGroup[] {
    const map = new Map<string, Project[]>();
    for (const project of projects) {
        if (project.archived) continue;
        const key = (project.category || "").trim();
        const list = map.get(key);
        if (list) list.push(project);
        else map.set(key, [project]);
    }
    return [...map.entries()]
        .sort(([a], [b]) => {
            if (a === b) return 0;
            if (!a) return 1;
            if (!b) return -1;
            return a.localeCompare(b, "zh-Hans-CN");
        })
        .map(([category, list]) => ({
            category,
            projects: list.slice().sort((a, b) => (a.sort || 0) - (b.sort || 0)),
        }));
}

export function projectStatus(project: Project, today: string = todayStr()): ProjectStatus {
    if (!project.startDate && !project.endDate) return "none";
    if (project.startDate && today < project.startDate) return "upcoming";
    if (project.endDate && today > project.endDate) return "ended";
    return "active";
}

export function projectDateRange(project: Project): string {
    if (project.startDate && project.endDate) return `${project.startDate} → ${project.endDate}`;
    return project.startDate || project.endDate || "";
}

/** 已开始天数（含开始当天）；未开始或没有开始日期返回 null */
export function projectStartedDays(project: Project, today: string = todayStr()): number | null {
    if (!project.startDate || today < project.startDate) return null;
    return diffDays(project.startDate, today) + 1;
}

/** 根据文档 ID 找到关联的项目（用于在该文档下新建事项时自动归入项目） */
export function findProjectIdByDoc(projects: Project[], docId: string | null | undefined): string | null {
    if (!docId) return null;
    const project = projects
        .filter(p => !p.archived && p.docId === docId)
        .sort((a, b) => (a.sort || 0) - (b.sort || 0))[0];
    return project ? project.id : null;
}

const CATEGORY_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"];

/** 分类颜色：同一分类稳定同色，用于徽章和分组圆点 */
export function categoryColor(category: string): string {
    if (!category) return "#94a3b8";
    let hash = 0;
    for (const ch of category) hash = (hash * 31 + (ch.codePointAt(0) || 0)) >>> 0;
    return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
}
