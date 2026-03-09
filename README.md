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
