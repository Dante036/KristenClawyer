const form = document.getElementById('sync-form');
const tagInput = document.getElementById('tag');
const resultPanel = document.getElementById('result-panel');
const resultBody = document.getElementById('result-body');
const submitBtn = document.getElementById('submit-btn');
const submitPublishBtn = document.getElementById('submit-publish-btn');
const statusPill = document.getElementById('status-pill');
let latestImport = null;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setSubmittingState(isSubmitting, publishAfterImport = false) {
  submitBtn.disabled = isSubmitting;
  submitPublishBtn.disabled = isSubmitting;
  submitBtn.textContent = isSubmitting && !publishAfterImport ? '正在同步，请稍候...' : '同步到网站';
  submitPublishBtn.textContent = isSubmitting && publishAfterImport ? '正在同步并发布...' : '同步并发布';
}

async function loadStatus() {
  try {
    const response = await fetch('/api/status');
    const data = await response.json();
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || '环境状态获取失败');
    }
    if (data.playwrightFound) {
      const branch = data.git && data.git.branch ? ` · ${data.git.branch}` : '';
      const authMap = {
        token: ' · Token 推送可用',
        'system-ssh': ' · 使用本机 SSH',
        system: ' · 使用本机 Git 登录态'
      };
      const auth = data.git ? authMap[data.git.authMode] || '' : '';
      statusPill.textContent = `环境正常，可直接同步${branch}${auth}`;
      statusPill.className = 'status-pill ok';
    } else {
      statusPill.textContent = '缺少 Playwright，请先执行 npm install playwright';
      statusPill.className = 'status-pill warn';
    }
  } catch (error) {
    statusPill.textContent = '环境状态获取失败';
    statusPill.className = 'status-pill warn';
  }
}

function showResult(html) {
  resultPanel.classList.remove('hidden');
  resultBody.innerHTML = html;
}

function renderImportResult(result, publishMarkup = '<p id="publish-status" class="muted"></p>') {
  const images = result.images.map((item) => `<li><code>${escapeHtml(item.path)}</code></li>`).join('');
  showResult(`
    <div class="result-card">
      <h3>${escapeHtml(result.title)}</h3>
      <p class="muted">日期：${escapeHtml(result.date)}　标签：${escapeHtml(result.tag)}　slug：<code>${escapeHtml(result.slug)}</code></p>
      <ul class="result-list">
        <li>文章文件：<code>${escapeHtml(result.articlePath)}</code></li>
        <li>图片目录：<code>${escapeHtml(result.imageDir)}</code></li>
        <li>首图：<code>${escapeHtml(result.cover.path)}</code></li>
      </ul>
      <div class="result-links">
        <a href="${result.previewPath}" target="_blank" rel="noreferrer">打开文章预览</a>
        <a class="secondary" href="${result.articlesPath}" target="_blank" rel="noreferrer">打开文章列表</a>
      </div>
    </div>
    <div class="result-card">
      <h3>正文配图</h3>
      <ul class="result-list">${images || '<li>未抓到正文配图</li>'}</ul>
    </div>
    <div class="result-card">
      <h3>发布到 Git</h3>
      <p class="muted">将本次同步生成的文件执行 <code>git add</code>、<code>git commit</code>、<code>git push</code>。</p>
      <div class="result-links">
        <button id="publish-btn" class="publish-btn">提交并推送到 Git</button>
      </div>
      ${publishMarkup}
    </div>
  `);
}

async function publishImport(importResult, options = {}) {
  const publishStatus = document.getElementById('publish-status');
  const publishButton = document.getElementById('publish-btn');
  if (publishButton) {
    publishButton.disabled = true;
    publishButton.textContent = options.auto ? '正在自动发布...' : '正在提交并推送...';
  }
  if (publishStatus) {
    publishStatus.textContent = options.auto
      ? '文章已同步，正在自动执行 git add / commit / push ...'
      : '正在执行 git add / commit / push ...';
  }

  const response = await fetch('/api/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: importResult.title,
      changedFiles: importResult.changedFiles
    })
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || '发布失败');
  }

  if (publishStatus) {
    publishStatus.innerHTML = `已发布：<code>${escapeHtml(data.result.commitHash)}</code> · ${escapeHtml(data.result.commitMessage)}`;
  }
  if (publishButton) {
    publishButton.textContent = '已提交并推送';
  }

  return data.result;
}

function attachPublishHandler() {
  const button = document.getElementById('publish-btn');
  if (!button || !latestImport) return;
  button.addEventListener('click', async () => {
    try {
      await publishImport(latestImport, { auto: false });
    } catch (error) {
      const publishStatus = document.getElementById('publish-status');
      if (publishStatus) publishStatus.textContent = error.message;
      button.disabled = false;
      button.textContent = '提交并推送到 Git';
    }
  });
}

async function submitImport(publishAfterImport) {
  latestImport = null;
  setSubmittingState(true, publishAfterImport);
  showResult(`<div class="result-card"><p class="muted">${publishAfterImport ? '正在抓取公众号正文、下载图片、写入网站文件，并准备提交发布...' : '正在抓取公众号正文、下载图片并写入网站文件...'}</p></div>`);

  const payload = Object.fromEntries(new FormData(form).entries());
  Object.keys(payload).forEach((key) => {
    if (!payload[key]) delete payload[key];
  });

  try {
    const response = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || '同步失败');
    }

    latestImport = data.result;
    renderImportResult(
      data.result,
      publishAfterImport
        ? '<p id="publish-status" class="muted">文章已同步，准备自动发布...</p>'
        : '<p id="publish-status" class="muted"></p>'
    );
    attachPublishHandler();

    if (publishAfterImport) {
      await publishImport(data.result, { auto: true });
    }
  } catch (error) {
    showResult(`<div class="result-card"><h3>${publishAfterImport ? '同步或发布失败' : '同步失败'}</h3><p class="error-text">${escapeHtml(error.message)}</p></div>`);
  } finally {
    setSubmittingState(false, false);
  }
}

for (const button of document.querySelectorAll('[data-tag]')) {
  button.addEventListener('click', () => {
    tagInput.value = button.dataset.tag;
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await submitImport(false);
});

submitPublishBtn.addEventListener('click', async () => {
  await submitImport(true);
});

loadStatus();
