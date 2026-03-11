#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function tryRequirePlaywright() {
  const candidates = [
    'playwright',
    path.join(process.cwd(), 'node_modules', 'playwright'),
    path.join(__dirname, '..', 'node_modules', 'playwright'),
    '/tmp/pw-run/node_modules/playwright'
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (err) {
    }
  }

  console.error('Playwright not found. Install it with: npm install playwright');
  process.exit(1);
}

function detectBrowserExecutable() {
  const envPath = process.env.WECHAT_ARTICLE_BROWSER;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const home = process.env.HOME || process.env.USERPROFILE || '';
  const localAppData = process.env.LOCALAPPDATA || '';
  const programFiles = process.env.PROGRAMFILES || 'C:/Program Files';
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)';
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    path.join(localAppData, 'Google/Chrome/Application/chrome.exe'),
    path.join(localAppData, 'Microsoft/Edge/Application/msedge.exe'),
    path.join(programFiles, 'Google/Chrome/Application/chrome.exe'),
    path.join(programFilesX86, 'Google/Chrome/Application/chrome.exe'),
    path.join(programFiles, 'Microsoft/Edge/Application/msedge.exe'),
    path.join(programFilesX86, 'Microsoft/Edge/Application/msedge.exe'),
    path.join(home, 'AppData/Local/Google/Chrome/Application/chrome.exe'),
    path.join(home, 'AppData/Local/Microsoft/Edge/Application/msedge.exe')
  ].filter(Boolean);

  return candidates.find(fs.existsSync);
}

function normalizeImageUrl(url) {
  if (!url) return '';
  return String(url).split('#')[0].trim();
}

function dedupeByUrl(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = normalizeImageUrl(item.url || item.src || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ ...item, url: key });
  }
  return result;
}

function parsePublishDateFromHtml(html) {
  const patterns = [
    /create_time:\s*JsDecode\('([^']+)'\)/,
    /var\s+create_time\s*=\s*['"]([^'"]+)['"]/
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1].trim();
  }
  return '';
}

function parseDescriptionFromHtml(html) {
  const match = html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i);
  return match ? match[1].trim() : '';
}

function shouldExcludeImage(img, coverImage) {
  const url = normalizeImageUrl(img.url || img.src || '');
  const lower = url.toLowerCase();
  const alt = String(img.alt || '').toLowerCase();
  const nearby = `${img.prevText || ''} ${img.nextText || ''} ${img.parentText || ''}`.toLowerCase();
  const renderedWidth = Number(img.renderedWidth || 0);
  const renderedHeight = Number(img.renderedHeight || 0);
  const originalWidth = Number(img.originalWidth || 0);
  const originalHeight = Number(img.originalHeight || 0);
  const squareish = originalWidth > 0 && originalHeight > 0 && Math.abs(originalWidth - originalHeight) <= Math.min(originalWidth, originalHeight) * 0.12;
  const renderedSquareish = renderedWidth > 0 && renderedHeight > 0 && Math.abs(renderedWidth - renderedHeight) <= Math.min(renderedWidth, renderedHeight) * 0.18;

  if (!url) return true;
  if (normalizeImageUrl(coverImage) === url) return true;
  if (renderedWidth < 180 || renderedHeight < 120) return true;
  if (renderedHeight <= 24 || renderedWidth <= 48) return true;
  if (lower.includes('qrcode') || lower.includes('wx_fmt=gif')) return true;
  if (nearby.includes('二维码') || nearby.includes('扫码')) return true;
  if (nearby.includes('公众号') || nearby.includes('视频号') || nearby.includes('小红书') || nearby.includes('抖音')) return true;
  if (alt.includes('二维码')) return true;
  if (renderedWidth <= 260 && renderedHeight <= 260) return true;
  if (squareish && Math.max(originalWidth, originalHeight) <= 420) return true;
  if (renderedSquareish && Math.max(renderedWidth, renderedHeight) <= 320 && !nearby.trim()) return true;
  return false;
}

(async () => {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node extract_wechat_article.js "<wechat-url>"');
    process.exit(1);
  }

  const { chromium } = tryRequirePlaywright();
  const executablePath = detectBrowserExecutable();
  const launchOptions = { headless: true };
  if (executablePath) launchOptions.executablePath = executablePath;

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 2400 },
    locale: 'zh-CN'
  });

  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(7000);

  const html = await page.content();
  const extracted = await page.evaluate(() => {
    const root = document.querySelector('#js_content') || document.querySelector('.rich_media_content') || document.body;
    const cover = document.querySelector('#js_row_immersive_cover_img img') || document.querySelector('meta[property="og:image"]');
    const titleEl = document.querySelector('#activity-name') || document.querySelector('.rich_media_title');
    const authorEl = document.querySelector('#js_author_name_text') || document.querySelector('#js_author_name');
    const accountEl = document.querySelector('#js_name');
    const textOf = (node) => (node?.innerText || node?.textContent || '').replace(/\s+/g, ' ').trim();

    const allImages = Array.from(root.querySelectorAll('img')).map((img, index) => {
      const rect = img.getBoundingClientRect();
      const prev = img.previousElementSibling;
      const next = img.nextElementSibling;
      const parent = img.parentElement;
      return {
        index,
        url: img.getAttribute('data-src') || img.getAttribute('src') || '',
        alt: img.getAttribute('alt') || '',
        className: img.className || '',
        originalWidth: Number(img.getAttribute('data-w') || img.naturalWidth || img.width || 0),
        originalHeight: Number(img.getAttribute('data-h') || img.naturalHeight || img.height || 0),
        renderedWidth: Number(rect.width || 0),
        renderedHeight: Number(rect.height || 0),
        prevText: textOf(prev).slice(0, 120),
        nextText: textOf(next).slice(0, 120),
        parentText: textOf(parent).slice(0, 200)
      };
    });

    return {
      title: textOf(titleEl),
      author: textOf(authorEl),
      accountName: textOf(accountEl),
      coverImage: cover ? (cover.getAttribute('content') || cover.getAttribute('src') || '') : '',
      html: root ? root.innerHTML : '',
      rawText: root ? (root.innerText || root.textContent || '') : '',
      text: root ? textOf(root) : '',
      allImages
    };
  });

  const publishDate = parsePublishDateFromHtml(html);
  const description = parseDescriptionFromHtml(html);
  const coverImage = normalizeImageUrl(extracted.coverImage);
  const allImages = dedupeByUrl(extracted.allImages);
  const suggestedImages = allImages.filter((img) => !shouldExcludeImage(img, coverImage)).slice(0, 6);

  const result = {
    sourceUrl: url,
    title: extracted.title,
    publishDate,
    author: extracted.author,
    accountName: extracted.accountName,
    description,
    coverImage,
    suggestedImages,
    allImages,
    html: extracted.html,
    rawText: extracted.rawText,
    text: extracted.text
  };

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
