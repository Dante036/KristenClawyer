const form = document.getElementById('sync-form');
const tagInput = document.getElementById('tag');
const resultPanel = document.getElementById('result-panel');
const resultBody = document.getElementById('result-body');
const submitBtn = document.getElementById('submit-btn');
const submitPublishBtn = document.getElementById('submit-publish-btn');
const statusPill = document.getElementById('status-pill');
let latestImport = null;
let latestStatus = null;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function canPublish() {
  return Boolean(latestStatus && latestStatus.publish && latestStatus.publish.ready);
}

function setSubmittingState(isSubmitting, publishAfterImport = false) {
  submitBtn.disabled = isSubmitting;
  submitPublishBtn.disabled = isSubmitting || (!canPublish() && !isSubmitting);
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

    latestStatus = data;
    if (!data.playwrightFound) {
      statusPill.textContent = '缺少 Playwright，请先执行 npm install playwright';
      statusPill.className = 'status-pill warn';
      setSubmittingState(false, false);
      return;
    }

    if (!canPublish()) {
      const reason = data.publish && data.publish.error ? ` · ${data.publish.error}` : '';
      statusPill.textContent = `环境正常，可同步文章${reason}`;
      statusPill.className = 'status-pill warn';
      setSubmittingState(false, false);
      return;
    }

    const repo = data.publish.repoFullName ? ` · ${data.publish.repoFullName}` : '';
    const branch = data.publish.branch ? ` · ${data.publish.branch}` : ' · 使用仓库默认分支';
    statusPill.textContent = `环境正常，可同步并发布${repo}${branch}`;
    statusPill.className = 'status-pill ok';
    setSubmittingState(false, false);
  } catch (error) {
    latestStatus = null;
    statusPill.textContent = '环境状态获取失败';
    statusPill.className = 'status-pill warn';
    setSubmittingState(false, false);
  }
}

function showResult(html) {
  resultPanel.classList.remove('hidden');
  resultBody.innerHTML = html;
}

function renderPublishCard(publishMarkup = '<p id="publish-status" class="muted"></p>') {
  if (!canPublish()) {
    const reason = latestStatus && latestStatus.publish && latestStatus.publish.error
      ? escapeHtml(latestStatus.publish.error)
      : '当前不可发布';
    return `
      <div class="result-card">
        <h3>发布到 GitHub</h3>
        <p class="muted">当前机器可以同步文章，但暂时不能通过 GitHub API 发布。</p>
        <p id="publish-status" class="muted">${reason}</p>
      </div>
    `;
  }

  const target = escapeHtml(latestStatus.publish.repoFullName || 'GitHub 仓库');
  const branch = latestStatus.publish.branch
    ? `分支：<code>${escapeHtml(latestStatus.publish.branch)}</code>`
    : '分支：<code>仓库默认分支</code>';
  return `
    <div class="result-card">
      <h3>发布到 GitHub</h3>
      <p class="muted">将本次同步生成的文件直接通过 GitHub API 提交到 <code>${target}</code>。${branch}</p>
      <div class="result-links">
        <button id="publish-btn" class="publish-btn">提交并发布到 GitHub</button>
      </div>
      ${publishMarkup}
    </div>
  `;
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
    ${renderPublishCard(publishMarkup)}
  `);
}

async function publishImport(importResult, options = {}) {
  const publishStatus = document.getElementById('publish-status');
  const publishButton = document.getElementById('publish-btn');
  if (publishButton) {
    publishButton.disabled = true;
    publishButton.textContent = options.auto ? '正在自动发布...' : '正在发布到 GitHub...';
  }
  if (publishStatus) {
    publishStatus.textContent = options.auto
      ? '文章已同步，正在通过 GitHub API 自动发布...'
      : '正在通过 GitHub API 发布...';
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
    const link = data.result.commitUrl
      ? ` · <a href="${escapeHtml(data.result.commitUrl)}" target="_blank" rel="noreferrer">查看提交</a>`
      : '';
    publishStatus.innerHTML = `已发布：<code>${escapeHtml(data.result.commitHash)}</code> · ${escapeHtml(data.result.commitMessage)}${link}`;
  }
  if (publishButton) {
    publishButton.textContent = '已发布到 GitHub';
  }

  return data.result;
}

function attachPublishHandler() {
  const button = document.getElementById('publish-btn');
  if (!button || !latestImport || !canPublish()) return;
  button.addEventListener('click', async () => {
    try {
      await publishImport(latestImport, { auto: false });
    } catch (error) {
      const publishStatus = document.getElementById('publish-status');
      if (publishStatus) publishStatus.textContent = error.message;
      button.disabled = false;
      button.textContent = '提交并发布到 GitHub';
    }
  });
}

async function submitImport(publishAfterImport) {
  latestImport = null;
  const shouldPublish = publishAfterImport && canPublish();
  setSubmittingState(true, shouldPublish);
  showResult(`<div class="result-card"><p class="muted">${shouldPublish ? '正在抓取公众号正文、下载图片、写入网站文件，并准备发布到 GitHub...' : '正在抓取公众号正文、下载图片并写入网站文件...'}</p></div>`);

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
      shouldPublish
        ? '<p id="publish-status" class="muted">文章已同步，准备自动发布...</p>'
        : publishAfterImport
          ? '<p id="publish-status" class="muted">当前未配置 GitHub API 发布，已完成同步，但未执行发布。</p>'
          : '<p id="publish-status" class="muted"></p>'
    );
    attachPublishHandler();

    if (shouldPublish) {
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

setSubmittingState(false, false);
loadStatus();
