const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TOOL_ROOT = __dirname;
const SCRIPTS_ROOT = path.join(TOOL_ROOT, 'scripts');
const EXTRACTOR = path.join(SCRIPTS_ROOT, 'extract_wechat_article.js');
const DOWNLOADER = path.join(SCRIPTS_ROOT, 'download_wechat_assets.js');
const AVATAR = '<img src="images/avanta.jpg" alt="小布布头像" class="article-inline-avatar" />';
function getGithubToken() {
  return String(process.env.WECHAT_SYNC_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '').trim();
}

function hasTokenAuth() {
  return Boolean(getGithubToken());
}

function parseRepoSpec(value) {
  const text = String(value || '')
    .trim()
    .replace(/^https:\/\/github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/\.git$/i, '');
  const match = text.match(/^([^/]+)\/([^/]+)$/);
  if (!match) {
    return { valid: false, owner: '', repo: '', fullName: '' };
  }
  return {
    valid: true,
    owner: match[1],
    repo: match[2],
    fullName: `${match[1]}/${match[2]}`
  };
}

function parseRemote(remote) {
  const text = String(remote || '').trim();
  if (!text) {
    return { kind: 'none', raw: '', owner: '', repo: '', fullName: '' };
  }

  const githubScp = text.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (githubScp) {
    return {
      kind: 'github-ssh',
      raw: text,
      owner: githubScp[1],
      repo: githubScp[2],
      fullName: `${githubScp[1]}/${githubScp[2]}`,
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
      fullName: `${githubSshUrl[1]}/${githubSshUrl[2]}`,
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
      fullName: `${githubHttps[1]}/${githubHttps[2]}`,
      httpsUrl: `https://github.com/${githubHttps[1]}/${githubHttps[2]}.git`
    };
  }

  if (/^(git@|ssh:\/\/)/i.test(text)) {
    return { kind: 'ssh', raw: text, owner: '', repo: '', fullName: '' };
  }

  if (/^https?:\/\//i.test(text)) {
    return { kind: 'https', raw: text, owner: '', repo: '', fullName: '', httpsUrl: text };
  }

  return { kind: 'other', raw: text, owner: '', repo: '', fullName: '' };
}

function runGitProbe(args) {
  const result = spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  return {
    ok: !result.error && result.status === 0,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    error: result.error ? result.error.message : ''
  };
}

function getLocalGitStatus() {
  const gitVersion = runGitProbe(['--version']);
  if (!gitVersion.ok) {
    return {
      available: false,
      repo: false,
      branch: '',
      remote: '',
      remoteKind: 'none',
      clean: false,
      pendingCount: 0,
      pending: [],
      error: '当前机器未安装 Git'
    };
  }

  const repoCheck = runGitProbe(['rev-parse', '--is-inside-work-tree']);
  if (!repoCheck.ok || repoCheck.stdout !== 'true') {
    return {
      available: true,
      repo: false,
      branch: '',
      remote: '',
      remoteKind: 'none',
      clean: false,
      pendingCount: 0,
      pending: [],
      error: '当前目录不是 Git 仓库'
    };
  }

  const branch = runGitProbe(['rev-parse', '--abbrev-ref', 'HEAD']).stdout;
  const remoteResult = runGitProbe(['remote', 'get-url', 'origin']);
  const remote = remoteResult.ok ? remoteResult.stdout : '';
  const porcelainResult = runGitProbe(['status', '--porcelain']);
  const pending = porcelainResult.ok && porcelainResult.stdout
    ? porcelainResult.stdout.split(/\r?\n/).filter(Boolean)
    : [];
  const remoteInfo = parseRemote(remote);

  return {
    available: true,
    repo: true,
    branch,
    remote,
    remoteKind: remoteInfo.kind,
    clean: pending.length === 0,
    pendingCount: pending.length,
    pending,
    error: ''
  };
}

function getConfiguredPublishTarget(gitStatus = getLocalGitStatus()) {
  const token = getGithubToken();
  const configuredRepo = parseRepoSpec(process.env.WECHAT_SYNC_GITHUB_REPO || '');
  const owner = configuredRepo.valid ? configuredRepo.owner : (gitStatus.repo ? parseRemote(gitStatus.remote).owner : '');
  const repo = configuredRepo.valid ? configuredRepo.repo : (gitStatus.repo ? parseRemote(gitStatus.remote).repo : '');
  const repoSource = configuredRepo.valid ? 'env' : (owner && repo ? 'git' : 'missing');

  let branch = String(process.env.WECHAT_SYNC_GITHUB_BRANCH || '').trim();
  let branchSource = branch ? 'env' : 'missing';
  if (!branch && gitStatus.repo && gitStatus.branch) {
    branch = gitStatus.branch;
    branchSource = 'git';
  }

  let error = '';
  if (!token) {
    error = '未设置 WECHAT_SYNC_GITHUB_TOKEN 或 GITHUB_TOKEN';
  } else if (!owner || !repo) {
    error = '未设置 WECHAT_SYNC_GITHUB_REPO，且当前目录也无法从 Git remote 推断仓库';
  }

  return {
    mode: 'github-api',
    ready: Boolean(token && owner && repo),
    tokenEnabled: Boolean(token),
    owner,
    repo,
    repoFullName: owner && repo ? `${owner}/${repo}` : '',
    repoSource,
    branch,
    branchSource,
    error
  };
}

async function githubRequest(token, method, endpoint, body) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'wechat-sync-tool',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const raw = await response.text();
  let data = raw ? raw : null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch (error) {
  }

  if (!response.ok) {
    const message = data && typeof data === 'object' && data.message ? data.message : response.statusText;
    throw new Error(`GitHub API 请求失败（${response.status}）：${message}`);
  }

  return data;
}

async function resolvePublishTarget() {
  const gitStatus = getLocalGitStatus();
  const publish = getConfiguredPublishTarget(gitStatus);
  const token = getGithubToken();

  if (!token) {
    throw new Error('未设置 WECHAT_SYNC_GITHUB_TOKEN 或 GITHUB_TOKEN。');
  }
  if (!publish.repoFullName) {
    throw new Error('未设置 WECHAT_SYNC_GITHUB_REPO，且当前目录也无法从 Git remote 推断仓库。');
  }

  let branch = publish.branch;
  let branchSource = publish.branchSource;
  if (!branch) {
    const repoInfo = await githubRequest(token, 'GET', `/repos/${publish.owner}/${publish.repo}`);
    branch = repoInfo.default_branch || 'main';
    branchSource = 'repo-default';
  }

  return {
    ...publish,
    token,
    branch,
    branchSource,
    ready: true
  };
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
  const git = getLocalGitStatus();
  const publish = getConfiguredPublishTarget(git);
  return {
    ...git,
    authMode: publish.ready ? 'token-api' : 'unavailable',
    tokenEnabled: publish.tokenEnabled,
    tokenUsable: publish.ready,
    publishRepo: publish.repoFullName,
    publishBranch: publish.branch,
    publishBranchSource: publish.branchSource,
    publishError: publish.error
  };
}

function toRepoRelative(filePath) {
  const absolute = path.resolve(filePath);
  if (!absolute.startsWith(REPO_ROOT)) {
    throw new Error(`文件不在仓库内：${filePath}`);
  }
  return path.relative(REPO_ROOT, absolute);
}

async function createGithubBlob(target, relativePath) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`准备发布的文件不存在：${absolutePath}`);
  }
  const bytes = fs.readFileSync(absolutePath);
  const blob = await githubRequest(
    target.token,
    'POST',
    `/repos/${target.owner}/${target.repo}/git/blobs`,
    {
      content: bytes.toString('base64'),
      encoding: 'base64'
    }
  );

  return {
    path: relativePath.replace(/\\/g, '/'),
    mode: '100644',
    type: 'blob',
    sha: blob.sha
  };
}

async function publishChangedFiles(options) {
  const title = String(options.title || 'new article').trim();
  const changedFiles = Array.isArray(options.changedFiles) ? [...new Set(options.changedFiles)] : [];
  if (!changedFiles.length) {
    throw new Error('没有可发布的文件。');
  }

  const target = await resolvePublishTarget();
  const relativeFiles = changedFiles.map(toRepoRelative);
  const branchInfo = await githubRequest(
    target.token,
    'GET',
    `/repos/${target.owner}/${target.repo}/branches/${encodeURIComponent(target.branch)}`
  );

  const baseCommitSha = branchInfo.commit.sha;
  const baseTreeSha = branchInfo.commit.commit.tree.sha;
  const treeEntries = [];
  for (const relativePath of relativeFiles) {
    treeEntries.push(await createGithubBlob(target, relativePath));
  }

  const tree = await githubRequest(
    target.token,
    'POST',
    `/repos/${target.owner}/${target.repo}/git/trees`,
    {
      base_tree: baseTreeSha,
      tree: treeEntries
    }
  );

  const commitMessage = `publish: ${title.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()}`;
  const commit = await githubRequest(
    target.token,
    'POST',
    `/repos/${target.owner}/${target.repo}/git/commits`,
    {
      message: commitMessage,
      tree: tree.sha,
      parents: [baseCommitSha]
    }
  );

  await githubRequest(
    target.token,
    'PATCH',
    `/repos/${target.owner}/${target.repo}/git/refs/heads/${encodeURIComponent(target.branch)}`,
    {
      sha: commit.sha,
      force: false
    }
  );

  return {
    commitMessage,
    commitHash: commit.sha.slice(0, 7),
    commitSha: commit.sha,
    commitUrl: `https://github.com/${target.owner}/${target.repo}/commit/${commit.sha}`,
    files: relativeFiles,
    authMode: 'token-api',
    branch: target.branch,
    branchSource: target.branchSource,
    repoFullName: target.repoFullName
  };
}

function checkEnvironment() {
  const candidates = [
    path.join(REPO_ROOT, 'node_modules', 'playwright'),
    path.join(TOOL_ROOT, 'node_modules', 'playwright'),
    '/tmp/pw-run/node_modules/playwright'
  ];

  const git = getLocalGitStatus();
  const publish = getConfiguredPublishTarget(git);

  return {
    repoRoot: REPO_ROOT,
    extractor: fs.existsSync(EXTRACTOR),
    downloader: fs.existsSync(DOWNLOADER),
    playwrightFound: candidates.some((item) => fs.existsSync(item)),
    playwrightCandidates: candidates,
    git,
    publish
  };
}

async function importWechatArticle(options) {
  const env = checkEnvironment();
  if (!env.extractor || !env.downloader) {
    throw new Error(`公众号同步脚本不存在，请检查仓库内脚本是否完整：${EXTRACTOR} / ${DOWNLOADER}`);
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
