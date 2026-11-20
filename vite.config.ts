import { defineConfig } from "vite";
import { resolve } from "node:path";
import { copyFileSync, existsSync } from "node:fs";

const outDir = "dist";
const packageFiles = ["plugin.json", "README.md", "README_zh_CN.md", "LICENSE"];

function copyPackageFiles() {
    return {
        name: "stm-package-files",
        closeBundle() {
            for (const file of packageFiles) {
                const source = resolve(__dirname, file);
                if (existsSync(source)) copyFileSync(source, resolve(outDir, file));
            }
        },
    };
}

export default defineConfig({
    publicDir: "public",
    resolve: {
        alias: { "@": resolve(__dirname, "src") },
    },
    css: {
        preprocessorOptions: {
            scss: {
                silenceDeprecations: ["import", "global-builtin", "color-functions", "mixed-decls"],
            },
        },
    },
    build: {
        outDir,
        emptyOutDir: true,
        target: "es2020",
        minify: true,
        sourcemap: false,
        lib: {
            entry: resolve(__dirname, "src/index.ts"),
            name: "STMTaskManage",
            formats: ["cjs"],
            fileName: () => "index.js",
        },
        rollupOptions: {
            external: ["siyuan", "process"],
            output: {
                entryFileNames: "index.js",
                assetFileNames: asset => (asset.name === "style.css" ? "index.css" : asset.name || "asset"),
                inlineDynamicImports: true,
            },
        },
    },
    plugins: [copyPackageFiles()],
});
