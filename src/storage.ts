export interface StorageHost {
    loadData(name: string): Promise<any>;
    saveData(name: string, data: any): Promise<any>;
}

const SAVE_TIMEOUT = 15_000;

function withTimeout<T>(p: Promise<T>, ms = SAVE_TIMEOUT): Promise<T> {
    return Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error("storage timeout")), ms)),
    ]);
}

/** 插件私有 JSON 存储：串行写入 + 失败保护，避免多窗口/快速编辑时互相覆盖。 */
export class Persistence {
    private queue: Promise<void> = Promise.resolve();
    private lastBackupAt = 0;
    private lastTasksSnapshot: string | null = null;

    constructor(private host: StorageHost) {}

    async loadArray<T>(file: string, normalize: (raw: any) => T[]): Promise<T[]> {
        try {
            const raw = await withTimeout(this.host.loadData(file));
            return normalize(raw);
        } catch (err) {
            console.warn(`[stm] load ${file} failed`, err);
            return [];
        }
    }

    async loadObject<T>(file: string, fallback: T, normalize: (raw: any) => T): Promise<T> {
        try {
            const raw = await withTimeout(this.host.loadData(file));
            return normalize(raw);
        } catch (err) {
            console.warn(`[stm] load ${file} failed`, err);
            return fallback;
        }
    }

    /** 排队保存，返回的 Promise 在本次写入完成后兑现（失败只记录，不阻塞后续写入） */
    save(file: string, data: any): Promise<void> {
        const job = async () => {
            try {
                if (file === "tasks.json") {
                    const snapshot = JSON.stringify(data);
                    const now = Date.now();
                    if (now - this.lastBackupAt > 6 * 3600_000 && this.lastTasksSnapshot) {
                        this.lastBackupAt = now;
                        await withTimeout(this.host.saveData("tasks.backup.json", JSON.parse(this.lastTasksSnapshot)));
                    }
                    this.lastTasksSnapshot = snapshot;
                }
                await withTimeout(this.host.saveData(file, data));
            } catch (err) {
                console.error(`[stm] save ${file} failed`, err);
            }
        };
        this.queue = this.queue.then(job, job);
        return this.queue;
    }

    flush(): Promise<void> {
        return this.queue;
    }
}
