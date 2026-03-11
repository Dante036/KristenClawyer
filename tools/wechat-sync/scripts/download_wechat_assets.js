#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: node download_wechat_assets.js <article-json> <output-dir>');
  process.exit(1);
}

function normalizeUrl(value) {
  return String(value || '').split('#')[0].trim();
}

function inferExtension(url, fallback = 'jpg') {
  try {
    const parsed = new URL(url);
    const wxFmt = parsed.searchParams.get('wx_fmt');
    if (wxFmt) return wxFmt.replace('jpeg', 'jpg').toLowerCase();
    const ext = path.extname(parsed.pathname).replace('.', '').toLowerCase();
    if (ext) return ext.replace('jpeg', 'jpg');
  } catch (err) {
  }
  return fallback;
}

function uniqueImages(images) {
  const seen = new Set();
  const result = [];
  for (const item of images || []) {
    const url = normalizeUrl(item.url || item.src || '');
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push({ ...item, url });
  }
  return result;
}

async function downloadFile(url, destPath) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    },
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, bytes);
  return bytes.length;
}

async function main() {
  const jsonPath = process.argv[2];
  const outputDir = process.argv[3];
  if (!jsonPath || !outputDir) usage();

  const article = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const coverImage = normalizeUrl(article.coverImage);
  const suggestedImages = uniqueImages(article.suggestedImages || []);
  fs.mkdirSync(outputDir, { recursive: true });

  const manifest = {
    title: article.title || '',
    publishDate: article.publishDate || '',
    outputDir: path.resolve(outputDir),
    cover: null,
    images: []
  };

  if (coverImage) {
    const ext = inferExtension(coverImage, 'jpg');
    const filename = `cover.${ext}`;
    const absPath = path.join(outputDir, filename);
    const size = await downloadFile(coverImage, absPath);
    manifest.cover = {
      sourceUrl: coverImage,
      filename,
      path: absPath,
      size
    };
  }

  let imageIndex = 1;
  for (const image of suggestedImages) {
    const ext = inferExtension(image.url, 'jpg');
    const filename = `illustration-${imageIndex}.${ext}`;
    const absPath = path.join(outputDir, filename);
    const size = await downloadFile(image.url, absPath);
    manifest.images.push({
      sourceUrl: image.url,
      filename,
      path: absPath,
      size,
      alt: image.alt || '',
      renderedWidth: image.renderedWidth || 0,
      renderedHeight: image.renderedHeight || 0
    });
    imageIndex += 1;
  }

  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
