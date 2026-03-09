/**
 * 文章系统
 * 
 * 如何新增文章：
 * 1. 在 articles/ 文件夹下新建一个 .md 文件（如 2026-03-08-合同纠纷.md）
 * 2. 在文件头部加上 frontmatter（见示例文章）
 * 3. 在下方 ARTICLES 数组中添加一条记录
 * 
 * 文章 frontmatter 格式：
 * ---
 * title: 文章标题
 * date: 2026-03-08
 * tag: 合同纠纷
 * excerpt: 摘要（一两句话）
 * ---
 */

const ARTICLES = [
  {
    slug: "juvenile-detention-tianjin-case",
    title: "“免死金牌”失效！天津打响第一枪：未成年人作恶，法律不再“虽迟但无”",
    date: "2026-02-10",
    tag: "法律热点",
    excerpt: "天津一名 15 岁少年连砸多辆豪车并实施盗窃后被行政拘留 9 日。这起案件释放出一个清晰信号：未成年人违法，不再天然“只罚不关”。"
  },
  {
    slug: "what-to-do-when-contract-breached",
    title: "合同被违约了，我该怎么办？",
    date: "2026-03-05",
    tag: "合同纠纷",
    excerpt: "对方突然不履行合同，钱打了没收货，货发了没收款——遇到这种情况别慌，小布布带你理清思路。"
  },
  {
    slug: "payment-order-debt-collection-guide",
    title: "欠钱不还，申请支付令最快？为什么我反而要劝退？",
    date: "2026-02-25",
    tag: "债务纠纷",
    excerpt: "支付令听起来快、便宜、直接，但它对债务人的状态要求极高。遇到失联、躲债、随时可能转移财产的老赖，盲目申请支付令，往往反而更耽误事。"
  },
  {
    slug: "divorce-property-division-guide",
    title: "离婚财产怎么分？这几个问题要搞清楚",
    date: "2026-02-20",
    tag: "婚姻家事",
    excerpt: "婚前财产、婚后共同财产、一方债务……离婚分财产时很多人一头雾水，这篇文章帮你理清基本原则。"
  },
  {
    slug: "work-injury-claim-steps",
    title: "工伤了，怎么申请赔偿？",
    date: "2026-02-10",
    tag: "劳动争议",
    excerpt: "工伤认定、劳动能力鉴定、工伤赔偿——步骤不少，但每一步都有规可循。小布布帮你捋一遍。"
  }
];

/**
 * 渲染文章卡片列表
 * @param {string} containerId - 目标容器 ID
 * @param {number|null} limit - 限制数量，null 为全部
 */
function renderArticleCards(articles, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (articles.length === 0) {
    container.innerHTML = '<p class="loading">暂无文章</p>';
    return;
  }

  container.innerHTML = articles.map(a => `
    <a href="article.html?slug=${a.slug}" class="article-card">
      <span class="article-card-tag">${a.tag}</span>
      <div class="article-card-title">${a.title}</div>
      <div class="article-card-date">${formatDate(a.date)}</div>
      <div class="article-card-excerpt">${a.excerpt}</div>
      <span class="article-card-link">阅读全文 →</span>
    </a>
  `).join('');
}

function loadArticlePreview(containerId, limit) {
  const articles = ARTICLES.slice(0, limit);
  renderArticleCards(articles, containerId);
}

function loadAllArticles(containerId) {
  renderArticleCards(ARTICLES, containerId);
}

/**
 * 加载文章详情页
 * 读取对应的 .md 文件并渲染
 */
function loadArticlePage(containerId) {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');
  const container = document.getElementById(containerId);
  if (!container) return;

  const meta = ARTICLES.find(a => a.slug === slug);
  if (!meta) {
    container.innerHTML = '<p>文章不存在。</p>';
    return;
  }

  document.title = `${meta.title} · 陈律`;

  fetch(`articles/${slug}.md`)
    .then(r => {
      if (!r.ok) throw new Error('文章加载失败');
      return r.text();
    })
    .then(text => {
      // 去掉 frontmatter
      const body = text.replace(/^---[\s\S]*?---\n/, '');
      // 用 marked 解析 Markdown（如已加载），否则简单处理
      const html = typeof marked !== 'undefined'
        ? marked.parse(body)
        : simpleMarkdown(body);

      container.innerHTML = `
        <h1>${meta.title}</h1>
        <div class="article-meta">
          <span>📅 ${formatDate(meta.date)}</span>
          <span>🏷️ ${meta.tag}</span>
          <span>✍️ 陈律</span>
        </div>
        ${html}
      `;
    })
    .catch(() => {
      container.innerHTML = `
        <h1>${meta.title}</h1>
        <div class="article-meta">
          <span>📅 ${formatDate(meta.date)}</span>
          <span>🏷️ ${meta.tag}</span>
        </div>
        <p>文章内容加载失败，请稍后再试。</p>
      `;
    });
}

/** 简单 Markdown → HTML 降级处理（无需外部库） */
function simpleMarkdown(text) {
  return text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hbu]|<li|<blockquote)(.+)$/gm, '<p>$1</p>');
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}
