import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = resolve(root, "dist");
const release = resolve(root, "release");
const archive = resolve(release, "package.zip");

if (!existsSync(resolve(dist, "plugin.json"))) {
    console.error("dist/plugin.json not found. Run `npm run build` first.");
    process.exit(1);
}

rmSync(release, { recursive: true, force: true });
mkdirSync(release, { recursive: true });
execFileSync("zip", ["-qr", archive, "."], { cwd: dist, stdio: "inherit" });
console.log(`Created ${archive}`);
