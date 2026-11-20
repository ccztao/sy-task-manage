# Development

```bash
npm install
npm run dev        # watch build
npm run typecheck
npm test
npm run build      # production build into dist/
npm run package    # build + release/package.zip for GitHub releases
```

The plugin uses Vite, TypeScript and SCSS. Built files are written to `dist/`; `release/package.zip` is generated only for publishing.

## Releasing

1. Keep `plugin.json` `version` and the Git tag in sync (for example `0.2.1` / `v0.2.1`).
2. Run `npm run package`.
3. Create a GitHub release and upload `release/package.zip` as an asset named exactly `package.zip`.
4. The package root must contain `plugin.json`, `index.js`, `index.css`, `icon.png`, `preview.png`, `i18n/` and the README files.

To list the plugin in the SiYuan community marketplace, fork [siyuan-note/bazaar](https://github.com/siyuan-note/bazaar), add `ccztao/sy-task-manage` to `plugins.txt`, and open a pull request.

## License

MIT. See [LICENSE](LICENSE).

---

# 开发与发布

```bash
npm install
npm run dev        # 监听构建
npm run typecheck
npm test
npm run build      # 构建到 dist/
npm run package    # 构建并生成 release/package.zip
```

插件使用 Vite、TypeScript 和 SCSS。`dist/` 是构建产物，`release/package.zip` 仅用于发布。

## 发布

1. 保持 `plugin.json` 的 `version` 与 Git tag 一致（例如 `0.2.1` / `v0.2.1`）。
2. 运行 `npm run package`。
3. 在 GitHub 创建 Release，上传 `release/package.zip`，资产名必须是 `package.zip`。
4. 压缩包根目录必须包含 `plugin.json`、`index.js`、`index.css`、`icon.png`、`preview.png`、`i18n/` 和 README 文件。

上架集市：fork [siyuan-note/bazaar](https://github.com/siyuan-note/bazaar)，在 `plugins.txt` 中加入 `ccztao/sy-task-manage`，然后提交 Pull Request。

## 许可证

MIT，见 [LICENSE](LICENSE)。
