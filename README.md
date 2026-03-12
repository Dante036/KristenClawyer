# 陈律 · 个人律师网站

现代简洁的个人律师网站，支持 Markdown 文章发布，直接部署到 GitHub Pages。

## 部署到 GitHub Pages

1. 在 GitHub 新建一个仓库（例如 `chenlaw-site`）
2. 把整个 `lawyer-site/` 文件夹的内容推送到仓库根目录
3. 在仓库 Settings → Pages → Source 选择 `main` 分支，根目录 `/`
4. 访问 `https://你的用户名.github.io/chenlaw-site/`

## 如何发布新文章

1. 在 `articles/` 文件夹下新建 `.md` 文件，例如 `2026-03-10-房产纠纷.md`
2. 文件开头加上 frontmatter：

```
---
title: 文章标题
date: 2026-03-10
tag: 房产纠纷
excerpt: 一两句摘要
---

正文内容（Markdown 格式）
```

3. 在 `js/articles.js` 顶部的 `ARTICLES` 数组中添加一条记录：

```js
{
  slug: "2026-03-10-房产纠纷",   // 文件名（不含 .md）
  title: "文章标题",
  date: "2026-03-10",
  tag: "房产纠纷",
  excerpt: "摘要"
}
```

4. 推送到 GitHub，网站自动更新。

## 本地同步公众号文章

给陈律用的本地小工具已经在仓库里：

- 公众号抓取脚本现已内置在仓库 `tools/wechat-sync/scripts/`，不再依赖你本机 `~/.codex/skills/...` 路径

- 双击运行：`start-wechat-sync-tool.command`
- Windows 可双击运行：`start-wechat-sync-tool.bat`
- 打开后访问：`http://127.0.0.1:4318/tool/`
- 粘贴公众号链接后，可选“同步到网站”或“同步并发布”

如果第一次运行提示缺少 Playwright，请先在仓库根目录执行：

```bash
npm install playwright
```

先准备本机私密配置文件：

```bash
cp wechat-sync.local.env.example wechat-sync.local.env
```

然后把 `wechat-sync.local.env` 里的 `WECHAT_SYNC_GITHUB_TOKEN` 改成你自己的 GitHub PAT，再确认 `WECHAT_SYNC_GITHUB_REPO` 指向目标仓库。这个文件已经被忽略，不会提交到仓库。

也可以直接用命令行导入：

```bash
node tools/wechat-sync/import_wechat_article.js --url "https://mp.weixin.qq.com/s/..."
```

如果要在网页里直接发布到 GitHub：

- 现在走的是 **GitHub API 发布**，不依赖本地 `git commit` / `git push`
- 必填：`WECHAT_SYNC_GITHUB_TOKEN`、`WECHAT_SYNC_GITHUB_REPO`
- 可选：`WECHAT_SYNC_GITHUB_BRANCH`；如果不填，会优先取当前 Git 分支，再不行就取仓库默认分支

macOS：

```bash
cp wechat-sync.local.env.example wechat-sync.local.env
open -a TextEdit wechat-sync.local.env
./start-wechat-sync-tool.command
```

Windows：

```powershell
copy wechat-sync.local.env.example wechat-sync.local.env
notepad wechat-sync.local.env
.\start-wechat-sync-tool.bat
```

## 添加微信二维码

把二维码图片保存为 `images/wechat-qr.png`，然后在 `contact.html` 中找到以下注释并取消注释：

```html
<!-- 取消注释并替换路径后使用：
<img src="images/wechat-qr.png" alt="陈律微信二维码" class="qr-image" />
-->
```

## 文件结构

```
lawyer-site/
├── index.html          首页
├── articles.html       文章列表
├── article.html        文章详情
├── contact.html        联系页
├── css/
│   └── style.css       样式
├── js/
│   ├── articles.js     文章系统（在此添加新文章）
│   └── main.js         导航等交互
├── articles/           Markdown 文章文件夹
│   ├── what-to-do-when-contract-breached.md
│   ├── divorce-property-division-guide.md
│   └── work-injury-claim-steps.md
└── images/             图片（放微信二维码等）
```
