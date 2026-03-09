const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SKILL_ROOT = path.join(process.env.HOME || '', '.codex', 'skills', 'republish-wechat-article');
const EXTRACTOR = path.join(SKILL_ROOT, 'scripts', 'extract_wechat_article.js');
const DOWNLOADER = path.join(SKILL_ROOT, 'scripts', 'download_wechat_assets.js');
const AVATAR = '<img src="images/avanta.jpg" alt="小布布头像" class="article-inline-avatar" />';
const GIT_ASKPASS = path.join(__dirname, 'git-askpass.js');

function hasTokenAuth() {
  return Boolean(process.env.WECHAT_SYNC_GITHUB_TOKEN || process.env.GITHUB_TOKEN);
}

function parseRemote(remote) {
  const text = String(remote || '').trim();
  if (!text) {
    return { kind: 'none', raw: '' };
  }

  const githubScp = text.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (githubScp) {
    return {
      kind: 'github-ssh',
      raw: text,
      owner: githubScp[1],
      repo: githubScp[2],
      httpsUrl: `https://github.com/${githubScp[1]}/${githubScp[2]}.git`
    };
  }

  const githubSshUrl = text.match(/^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?$/i);
  if (githubSshUrl) {
    return {
      kind: 'github-ssh',
      raw: text,
      owner: githubSshUrl[1],
      repo: githubSshUrl[2],
      httpsUrl: `https://github.com/${githubSshUrl[1]}/${githubSshUrl[2]}.git`
    };
  }

  const githubHttps = text.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/i);
  if (githubHttps) {
    return {
      kind: 'github-https',
      raw: text,
      owner: githubHttps[1],
      repo: githubHttps[2],
      httpsUrl: `https://github.com/${githubHttps[1]}/${githubHttps[2]}.git`
    };
  }

  if (/^(git@|ssh:\/\/)/i.test(text)) {
    return { kind: 'ssh', raw: text };
  }

  if (/^https?:\/\//i.test(text)) {
    return { kind: 'https', raw: text, httpsUrl: text };
  }

  return { kind: 'other', raw: text };
}

function resolveAuthMode(remote) {
  const remoteInfo = parseRemote(remote);
  const tokenEnabled = hasTokenAuth();
  const tokenUsable = tokenEnabled && Boolean(remoteInfo.httpsUrl);

  if (tokenUsable) {
    return {
      tokenEnabled,
      tokenUsable,
      authMode: 'token',
      remoteInfo
    };
  }

  if (remoteInfo.kind === 'github-ssh' || remoteInfo.kind === 'ssh') {
    return {
      tokenEnabled,
      tokenUsable,
      authMode: 'system-ssh',
      remoteInfo
    };
  }

  return {
    tokenEnabled,
    tokenUsable,
    authMode: 'system',
    remoteInfo
  };
}

function baseGitEnv() {
  const env = { ...process.env };
  const token = env.WECHAT_SYNC_GITHUB_TOKEN || env.GITHUB_TOKEN || '';
  if (token) {
    env.GIT_TERMINAL_PROMPT = '0';
    env.GIT_ASKPASS = GIT_ASKPASS;
    env.WECHAT_SYNC_GIT_USERNAME = env.WECHAT_SYNC_GIT_USERNAME || 'x-access-token';
    env.WECHAT_SYNC_GIT_PASSWORD = token;
  }
  return env;
}

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: baseGitEnv(),
    ...options
  });
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || `Failed to run git ${args.join(' ')}`).trim();
    throw new Error(message);
  }
  return (result.stdout || '').trim();
}

function runNode(scriptPath, args) {
  const result = spawnSync('node', [scriptPath, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || `Failed to run ${scriptPath}`).trim();
    throw new Error(message);
  }
  return result.stdout;
}

function normalizeDate(input) {
  const text = String(input || '').trim();
  const match = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function inferTag(title, text) {
  const source = `${title} ${text}`;
  const rules = [
    [/支付令|欠钱|借款|欠款|债务|老赖|执行/u, '债务纠纷'],
    [/离婚|抚养|婚姻|彩礼|夫妻|财产分割/u, '婚姻家事'],
    [/工伤|劳动|社保|仲裁|辞退|加班/u, '劳动争议'],
    [/合同|违约|买卖|租赁|定金/u, '合同纠纷'],
    [/未成年|警方|热点|刑事|治安/u, '法律热点']
  ];
  for (const [pattern, tag] of rules) {
    if (pattern.test(source)) return tag;
  }
  return '法律热点';
}

function buildSlug(url, date, customSlug) {
  if (customSlug) {
    return customSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }
  const tokenMatch = String(url).match(/\/s\/([^?]+)/);
  const token = tokenMatch ? tokenMatch[1].toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) : Date.now().toString(36);
  return `wechat-${date.replace(/-/g, '')}-${token}`;
}

function excerptFromParagraphs(paragraphs) {
  const first = (paragraphs.find((item) => item.length >= 20) || paragraphs[0] || '').trim();
  if (!first) return '这是一篇同步自微信公众号的文章。';
  return first.length > 78 ? `${first.slice(0, 78)}...` : first;
}

function splitRawText(rawText) {
  return String(rawText || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/[\t\u00a0 ]+/g, ' ').trim())
    .filter(Boolean);
}

function cleanLines(lines, article) {
  const headNoise = [
    /^点击蓝字$/,
    /^关注我们$/,
    /^原创$/,
    /^spring festival$/i,
    /^陈律和小布布$/,
    /^吉祥$/,
    /^如意$/,
    /^[一二三四五六七八九十]月$/,
    /^[a-z]+$/i,
    /^\d{1,2}$/,
    /^大家好，这里是.{0,20}$/,
    /^公众号[丨|]/,
    /^视频号[丨|]/,
    /^小红书$/,
    /^b站[丨|]?/i,
    /^抖音$/,
    /^拥有一只/u,
    /^作者提示[:：]?$/,
    /^吉$/,
    /^祥$/,
    /^如$/,
    /^意$/
  ];
  const tailNoise = [
    /^公众号[丨|]/,
    /^视频号[丨|]/,
    /^小红书$/,
    /^b站[丨|]?/i,
    /^抖音$/,
    /^拥有一只/u,
    /^陈律和小布布$/,
    /^原创$/
  ];

  let result = [...lines];
  while (result.length && headNoise.some((pattern) => pattern.test(result[0]))) {
    result.shift();
  }

  const firstContentIndex = result.findIndex((line) => /[。！？；]/.test(line) && line.length >= 18);
  if (firstContentIndex > 0) {
    result = result.slice(firstContentIndex);
  }

  const tailIndex = result.findIndex((line) => tailNoise.some((pattern) => pattern.test(line)));
  if (tailIndex >= 0) {
    result = result.slice(0, tailIndex);
  }

  return result.filter((line) => line !== article.title && line !== article.author && line !== article.accountName && !(line.length <= 2 && !isSectionNumber(line)));
}

function isSectionNumber(line) {
  return /^\d{2}$/.test(line);
}

function isHeading(line) {
  return /^(一、|二、|三、|四、|五、|六、|七、|八、|九、|十、|写在最后|最后|结语|总结)/.test(line) ||
    ((line.endsWith('？') || line.endsWith('!') || line.endsWith('！') || line.endsWith('：') || line.endsWith(':')) && line.length <= 28) ||
    (line.length <= 24 && /逻辑|硬伤|代价|方案|路径|影响|条件|程序|风险/.test(line));
}

function toBlocks(lines) {
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1];

    if (isSectionNumber(line) && next && next.length <= 30) {
      blocks.push({ type: 'heading', text: next });
      i += 1;
      continue;
    }

    if (isHeading(line)) {
      blocks.push({ type: 'heading', text: line.replace(/^\d+[、. ]*/, '') });
      continue;
    }

    if (/^[•·-]/.test(line)) {
      blocks.push({ type: 'list', text: line.replace(/^[•·-]\s*/, '') });
      continue;
    }

    blocks.push({ type: 'paragraph', text: line });
  }
  return blocks;
}

function insertFigures(blocks, imageFiles, slug) {
  if (!imageFiles.length) return blocks;
  const paragraphIndexes = [];
  blocks.forEach((block, index) => {
    if (block.type === 'paragraph' || block.type === 'heading') paragraphIndexes.push(index);
  });
  if (!paragraphIndexes.length) return blocks;

  const picks = [];
  for (let i = 0; i < imageFiles.length; i += 1) {
    const pickIndex = paragraphIndexes[Math.min(paragraphIndexes.length - 1, Math.max(0, Math.round(((i + 1) * paragraphIndexes.length) / (imageFiles.length + 1)) - 1))];
    picks.push({ at: pickIndex, file: imageFiles[i] });
  }

  const byIndex = new Map();
  for (const pick of picks) {
    if (!byIndex.has(pick.at)) byIndex.set(pick.at, []);
    byIndex.get(pick.at).push(pick.file);
  }

  const output = [];
  blocks.forEach((block, index) => {
    output.push(block);
    const files = byIndex.get(index) || [];
    for (const file of files) {
      output.push({
        type: 'figure',
        src: `images/articles/${slug}/${file}`
      });
    }
  });
  return output;
}

function renderBlocks(blocks) {
  const lines = [];
  let listBuffer = [];

  function flushList() {
    if (!listBuffer.length) return;
    for (const item of listBuffer) lines.push(`- ${item}`);
    lines.push('');
    listBuffer = [];
  }

  for (const block of blocks) {
    if (block.type !== 'list') flushList();

    if (block.type === 'heading') {
      lines.push(`## ${block.text}`);
      lines.push('');
    } else if (block.type === 'paragraph') {
      lines.push(block.text);
      lines.push('');
    } else if (block.type === 'list') {
      listBuffer.push(block.text);
    } else if (block.type === 'figure') {
      const ext = path.extname(block.src).toLowerCase();
      const label = ext === '.png' ? '关键截图' : '正文配图';
      lines.push('<figure>');
      lines.push(`  <img src="${block.src}" alt="${label}" />`);
      lines.push('</figure>');
      lines.push('');
    }
  }
  flushList();

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function buildArticleMarkdown(article, manifest, options) {
  const cleanedLines = cleanLines(splitRawText(article.rawText || article.text), article);
  const introLines = cleanedLines.slice(0, 3);
  const bodyLines = cleanedLines.slice(3);
  const blocks = toBlocks(bodyLines.length ? bodyLines : cleanedLines);
  const imageFiles = manifest.images.map((item) => item.filename);
  const blocksWithFigures = insertFigures(blocks, imageFiles, options.slug);
  const excerpt = excerptFromParagraphs(cleanedLines);
  const date = normalizeDate(article.publishDate);
  const tag = options.tag || inferTag(article.title, article.text);

  const markdown = [
    '---',
    `title: ${article.title}`,
    `date: ${date}`,
    `tag: ${tag}`,
    `excerpt: ${excerpt}`,
    '---',
    '',
    '<figure>',
    `  <img src="images/articles/${options.slug}/${manifest.cover.filename}" alt="文章首图" />`,
    '</figure>',
    '',
    `## ${AVATAR} 小布布说`,
    ''
  ];

  const intro = introLines.length ? introLines : cleanedLines.slice(0, 2);
  intro.forEach((line) => {
    markdown.push(line);
    markdown.push('');
  });

  markdown.push(renderBlocks(blocksWithFigures));
  markdown.push('');
  markdown.push(`> ${AVATAR} **小布布总结：** ${excerpt}`);
  markdown.push('');
  markdown.push(`作者提示：原文发布于 ${date}，同步自公众号文章。`);
  markdown.push('');

  return {
    markdown: markdown.join('\n').replace(/\n{3,}/g, '\n\n'),
    excerpt,
    tag,
    date,
    cleanedLines
  };
}

function updateArticlesRegistry(entry) {
  const target = path.join(REPO_ROOT, 'js', 'articles.js');
  let source = fs.readFileSync(target, 'utf8');
  if (source.includes(`slug: "${entry.slug}"`)) {
    throw new Error(`文章 slug 已存在: ${entry.slug}`);
  }

  const block = [
    '  {',
    `    slug: "${entry.slug}",`,
    `    title: "${entry.title.replace(/"/g, '\\"')}",`,
    `    date: "${entry.date}",`,
    `    tag: "${entry.tag}",`,
    `    excerpt: "${entry.excerpt.replace(/"/g, '\\"')}",`,
    '  },'
  ].join('\n');

  source = source.replace('const ARTICLES = [\n', `const ARTICLES = [\n${block}\n`);

  if (!source.includes('function getSortedArticles()')) {
    source = source.replace(
      'function loadArticlePreview(containerId, limit) {\n  const articles = ARTICLES.slice(0, limit);\n  renderArticleCards(articles, containerId);\n}\n\nfunction loadAllArticles(containerId) {\n  renderArticleCards(ARTICLES, containerId);\n}\n',
      'function getSortedArticles() {\n  return ARTICLES.slice().sort((a, b) => new Date(b.date) - new Date(a.date));\n}\n\nfunction loadArticlePreview(containerId, limit) {\n  const articles = getSortedArticles().slice(0, limit);\n  renderArticleCards(articles, containerId);\n}\n\nfunction loadAllArticles(containerId) {\n  renderArticleCards(getSortedArticles(), containerId);\n}\n'
    );
  }

  fs.writeFileSync(target, source);
}

function getGitStatus() {
  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  let remote = '';
  try {
    remote = runGit(['remote', 'get-url', 'origin']);
  } catch (error) {
    remote = '';
  }
  const porcelain = runGit(['status', '--porcelain']);
  const pending = porcelain ? porcelain.split(/\r?\n/).filter(Boolean) : [];
  const auth = resolveAuthMode(remote);
  return {
    branch,
    remote,
    remoteKind: auth.remoteInfo.kind,
    clean: pending.length === 0,
    pendingCount: pending.length,
    pending,
    authMode: auth.authMode,
    tokenEnabled: auth.tokenEnabled,
    tokenUsable: auth.tokenUsable
  };
}

function toRepoRelative(filePath) {
  const absolute = path.resolve(filePath);
  if (!absolute.startsWith(REPO_ROOT)) {
    throw new Error(`文件不在仓库内：${filePath}`);
  }
  return path.relative(REPO_ROOT, absolute);
}

function publishChangedFiles(options) {
  const title = String(options.title || 'new article').trim();
  const changedFiles = Array.isArray(options.changedFiles) ? [...new Set(options.changedFiles)] : [];
  if (!changedFiles.length) {
    throw new Error('没有可提交的文件。');
  }

  const git = getGitStatus();
  const relativeFiles = changedFiles.map(toRepoRelative);
  runGit(['add', '--', ...relativeFiles]);

  const staged = runGit(['diff', '--cached', '--name-only']);
  if (!staged.trim()) {
    throw new Error('没有检测到新的已暂存改动。');
  }

  const commitMessage = `publish: ${title.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()}`;
  runGit(['commit', '-m', commitMessage]);
  const pushArgs = ['push'];
  if (git.authMode === 'token' && git.remote) {
    const remoteInfo = parseRemote(git.remote);
    pushArgs.push(remoteInfo.httpsUrl, `HEAD:${git.branch}`);
  }
  const pushOutput = runGit(pushArgs);
  const commitHash = runGit(['rev-parse', '--short', 'HEAD']);

  return {
    commitMessage,
    commitHash,
    pushOutput,
    files: relativeFiles,
    authMode: git.authMode
  };
}

function checkEnvironment() {
  const candidates = [
    path.join(REPO_ROOT, 'node_modules', 'playwright'),
    path.join(SKILL_ROOT, 'node_modules', 'playwright'),
    '/tmp/pw-run/node_modules/playwright'
  ];

  let git;
  try {
    git = getGitStatus();
  } catch (error) {
    git = {
      branch: '',
      remote: '',
      remoteKind: 'unknown',
      clean: false,
      pendingCount: 0,
      pending: [],
      authMode: 'unavailable',
      tokenEnabled: hasTokenAuth(),
      tokenUsable: false,
      error: error.message || String(error)
    };
  }

  return {
    repoRoot: REPO_ROOT,
    extractor: fs.existsSync(EXTRACTOR),
    downloader: fs.existsSync(DOWNLOADER),
    playwrightFound: candidates.some((item) => fs.existsSync(item)),
    playwrightCandidates: candidates,
    git
  };
}

async function importWechatArticle(options) {
  const env = checkEnvironment();
  if (!env.extractor || !env.downloader) {
    throw new Error('公众号同步脚本不存在，请检查 skill 安装。');
  }

  const extractedJson = runNode(EXTRACTOR, [options.url]);
  const article = JSON.parse(extractedJson);
  const date = normalizeDate(article.publishDate);
  const slug = buildSlug(options.url, date, options.slug);
  const tag = options.tag || inferTag(article.title, article.text);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-sync-'));
  const extractedPath = path.join(tmpDir, 'article.json');
  fs.writeFileSync(extractedPath, extractedJson);

  const imageDir = path.join(REPO_ROOT, 'images', 'articles', slug);
  fs.mkdirSync(imageDir, { recursive: true });
  const manifestJson = runNode(DOWNLOADER, [extractedPath, imageDir]);
  const manifest = JSON.parse(manifestJson);

  const built = buildArticleMarkdown(article, manifest, { slug, tag });
  const articlePath = path.join(REPO_ROOT, 'articles', `${slug}.md`);
  fs.writeFileSync(articlePath, built.markdown);

  updateArticlesRegistry({
    slug,
    title: article.title,
    date: built.date,
    tag: built.tag,
    excerpt: built.excerpt
  });

  return {
    title: article.title,
    slug,
    date: built.date,
    tag: built.tag,
    excerpt: built.excerpt,
    articlePath,
    imageDir,
    cover: manifest.cover,
    images: manifest.images,
    previewPath: `/article.html?slug=${slug}`,
    articlesPath: '/articles.html',
    changedFiles: [articlePath, path.join(REPO_ROOT, 'js', 'articles.js'), manifest.cover.path, ...manifest.images.map((item) => item.path)]
  };
}

module.exports = {
  REPO_ROOT,
  checkEnvironment,
  getGitStatus,
  importWechatArticle,
  publishChangedFiles
};
