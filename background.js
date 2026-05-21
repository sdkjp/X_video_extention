// background.js — Service Worker

// video.twimg.com から MP4 URL を傍受して保存（webRequest 経由）
chrome.webRequest.onBeforeRequest.addListener(
  async ({ url, tabId }) => {
    if (tabId < 0) return;
    if (!url.match(/\.mp4(\?|$)/i)) return;

    const key = `tab_${tabId}`;
    try {
      const stored = await chrome.storage.session.get(key);
      const urls = stored[key] || [];
      if (!urls.some(v => v.url === url)) {
        urls.push({ url, time: Date.now() });
        await chrome.storage.session.set({ [key]: urls.slice(-50) });
      }
    } catch (e) {
      console.error('[TWDL] storage error:', e);
    }
  },
  { urls: ['*://video.twimg.com/*'] }
);

// コンテントスクリプトからのダウンロードリクエスト
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadVideo') {
    // perfUrls: content.js が performance API で収集したフォールバック用 URL リスト
    triggerDownload(sender.tab.id, request.perfUrls || []).then(sendResponse);
    return true;
  }
  if (request.action === 'downloadImage') {
    downloadImage(request.url).then(sendResponse);
    return true;
  }
});

// タブ閉鎖時にストレージをクリーンアップ
chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.session.remove(`tab_${tabId}`);
});

// ---

async function triggerDownload(tabId, perfUrls = []) {
  const key = `tab_${tabId}`;
  const stored = await chrome.storage.session.get(key);
  const storedUrls = stored[key] || [];

  // webRequest 経由 + performance API 経由をマージ
  const seen = new Set(storedUrls.map(v => v.url));
  const allUrls = [...storedUrls];
  for (const url of perfUrls) {
    if (!seen.has(url)) allUrls.push({ url, time: Date.now() });
  }

  if (allUrls.length === 0) {
    try {
      await chrome.tabs.sendMessage(tabId, {
        action: 'showNotification',
        message: '動画URLが見つかりません。動画を再生してから右クリックしてください。'
      });
    } catch (_) {}
    return { success: false, error: '動画URLが見つかりません' };
  }

  // 最高画質（解像度が大きいもの）を選択
  const best = allUrls.reduce((a, b) =>
    getResolution(b.url) > getResolution(a.url) ? b : a
  , allUrls[allUrls.length - 1]);

  const rawName = best.url.split('/').pop().split('?')[0];
  const filename = rawName.endsWith('.mp4') ? rawName : rawName + '.mp4';

  await chrome.downloads.download({ url: best.url, filename, saveAs: false });
  return { success: true };
}

function getResolution(url) {
  const m = url.match(/\/(\d+)x(\d+)\//);
  return m ? parseInt(m[1]) * parseInt(m[2]) : 0;
}

async function downloadImage(url) {
  try {
    const u = new URL(url);
    let name = u.pathname.split('/').pop().split('?')[0];
    const fmt = u.searchParams.get('format') || 'jpg';
    if (!name.includes('.')) name += `.${fmt}`;
    await chrome.downloads.download({ url, filename: name, saveAs: false });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
