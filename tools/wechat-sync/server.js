#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const { checkEnvironment, importWechatArticle, publishChangedFiles, REPO_ROOT } = require('./importer');

const PORT = Number(process.env.WECHAT_SYNC_PORT || 4318);
const TOOL_ROOT = path.join(__dirname, 'public');

function sendJson(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.md') return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

function safeJoin(base, requestPath) {
  const target = path.normalize(path.join(base, requestPath));
  if (!target.startsWith(base)) return null;
  return target;
}

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }
  res.writeHead(200, { 'Content-Type': contentType(filePath) });
  fs.createReadStream(filePath).pipe(res);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(302, { Location: '/tool/' });
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/status') {
    try {
      sendJson(res, 200, checkEnvironment());
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message || String(error) });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/import') {
    try {
      const body = await readBody(req);
      const result = await importWechatArticle(body);
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message || String(error) });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/publish') {
    try {
      const body = await readBody(req);
      const result = await publishChangedFiles(body);
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message || String(error) });
    }
    return;
  }

  if (url.pathname.startsWith('/tool/')) {
    const relative = url.pathname === '/tool/' ? 'index.html' : url.pathname.replace(/^\/tool\//, '');
    const filePath = safeJoin(TOOL_ROOT, relative);
    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }
    serveFile(res, filePath);
    return;
  }

  const relativePath = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
  const filePath = safeJoin(REPO_ROOT, relativePath);
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  serveFile(res, filePath);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Chen sync tool running at http://127.0.0.1:${PORT}/tool/`);
});
