// content.js — Twitter/X メディアダウンローダー (v3)

(function () {
  'use strict';

  // currentMedia = { element, type: 'video'|'image', url? }
  let currentMedia = null;
  let floatBtn     = null;
  let customMenu   = null;
  let lastMouse    = [0, 0];

  // ---- マウス座標でメディア要素を探す ----
  function findMediaAt(x, y) {
    // 動画（オーバーレイDIVを無視するため座標で判定）
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 &&
          x >= r.left && x <= r.right &&
          y >= r.top  && y <= r.bottom) {
        return { element: v, type: 'video' };
      }
    }
    // 画像（ツイート本文の写真のみ。pbs.twimg.com/media/ でフィルタ）
    for (const img of document.querySelectorAll('img[src*="pbs.twimg.com/media/"]')) {
      const r = img.getBoundingClientRect();
      if (r.width > 50 && r.height > 50 &&
          x >= r.left && x <= r.right &&
          y >= r.top  && y <= r.bottom) {
        return { element: img, type: 'image', url: bestImageUrl(img.src) };
      }
    }
    return null;
  }

  // Twitter 画像URLを最高画質 (orig) に変換
  function bestImageUrl(src) {
    if (src.includes('name=')) return src.replace(/name=[^&]+/, 'name=orig');
    if (src.match(/:\w+$/))    return src.replace(/:\w+$/, ':orig');
    return src;
  }

  // ---- mousemove でメディア検出 ----
  document.addEventListener('mousemove', e => {
    lastMouse = [e.clientX, e.clientY];
    const m = findMediaAt(e.clientX, e.clientY);
    if (m?.element !== currentMedia?.element) {
      currentMedia = m;
      updateFloatBtn();
    }
  }, { passive: true });

  // ---- フローティングダウンロードボタン ----
  function createFloatBtn() {
    const el = document.createElement('div');
    el.id = 'twdl-float-btn';
    Object.assign(el.style, {
      position:     'fixed',
      display:      'none',
      background:   'rgba(29,155,240,0.93)',
      color:        'white',
      padding:      '7px 15px',
      borderRadius: '20px',
      fontSize:     '13px',
      fontWeight:   '700',
      fontFamily:   '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      cursor:       'pointer',
      zIndex:       '2147483647',
      boxShadow:    '0 2px 10px rgba(0,0,0,0.45)',
      userSelect:   'none',
      pointerEvents:'auto',
      transition:   'background 0.15s',
      letterSpacing:'0.01em',
    });
    el.addEventListener('mouseenter', () => {
      el.style.background = 'rgba(14,122,197,1)';
      // ボタン上にいる間も currentMedia を維持
      if (!currentMedia) currentMedia = findMediaAt(...lastMouse);
    });
    el.addEventListener('mouseleave', () => {
      el.style.background = 'rgba(29,155,240,0.93)';
    });
    el.addEventListener('click', async e => {
      e.preventDefault(); e.stopPropagation();
      const label = el.textContent;
      el.textContent = '⏳ ダウンロード中...';
      await doDownload();
      setTimeout(() => { el.textContent = label; }, 2000);
    });
    document.body.appendChild(el);
    return el;
  }

  function btnLabel() {
    return currentMedia?.type === 'image' ? '⬇ 画像をダウンロード' : '⬇ 動画をダウンロード';
  }

  function updateFloatBtn() {
    if (!floatBtn) floatBtn = createFloatBtn();
    if (!currentMedia) { floatBtn.style.display = 'none'; return; }
    const r = currentMedia.element.getBoundingClientRect();
    floatBtn.textContent   = btnLabel();
    floatBtn.style.display = 'block';
    floatBtn.style.top     = `${r.top  + 10}px`;
    floatBtn.style.right   = `${window.innerWidth - r.right + 10}px`;
    floatBtn.style.left    = 'auto';
  }

  window.addEventListener('scroll', updateFloatBtn, { passive: true });
  window.addEventListener('resize', updateFloatBtn, { passive: true });

  // ---- 右クリック：Twitterより先に捕捉 ----
  document.addEventListener('contextmenu', e => {
    const m = findMediaAt(e.clientX, e.clientY);
    if (!m) return;                       // 対象外は通常メニュー

    e.preventDefault();
    e.stopImmediatePropagation();         // Twitterの独自UIをブロック
    currentMedia = m;
    showCustomMenu(e.clientX, e.clientY);
  }, { capture: true });

  // ---- カスタムコンテキストメニュー ----
  function showCustomMenu(x, y) {
    hideCustomMenu();
    const menu = document.createElement('div');
    menu.id = 'twdl-ctx-menu';
    Object.assign(menu.style, {
      position:     'fixed',
      left:         `${Math.min(x + 2, window.innerWidth  - 230)}px`,
      top:          `${Math.min(y + 2, window.innerHeight - 54)}px`,
      background:   '#1e2732',
      border:       '1px solid rgba(255,255,255,0.12)',
      borderRadius: '8px',
      boxShadow:    '0 8px 28px rgba(0,0,0,0.55)',
      zIndex:       '2147483647',
      overflow:     'hidden',
      minWidth:     '210px',
    });
    menu.appendChild(makeMenuItem(btnLabel(), async () => {
      hideCustomMenu();
      await doDownload();
    }));
    document.body.appendChild(menu);
    customMenu = menu;
  }

  function makeMenuItem(label, onClick) {
    const el = document.createElement('div');
    el.textContent = label;
    Object.assign(el.style, {
      padding:    '11px 16px',
      color:      'white',
      fontSize:   '14px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      cursor:     'pointer',
    });
    el.addEventListener('mouseenter', () => el.style.background = 'rgba(29,155,240,0.25)');
    el.addEventListener('mouseleave', () => el.style.background = 'transparent');
    el.addEventListener('click', e => { e.stopPropagation(); onClick(); });
    return el;
  }

  function hideCustomMenu() {
    customMenu?.remove();
    customMenu = null;
  }

  document.addEventListener('click',   hideCustomMenu, { capture: true });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideCustomMenu(); });

  // ---- ダウンロード実行 ----
  async function doDownload() {
    if (!currentMedia) return;
    try {
      let res;
      if (currentMedia.type === 'image') {
        res = await chrome.runtime.sendMessage({ action: 'downloadImage', url: currentMedia.url });
      } else {
        // performance API でブラウザが読み込んだ MP4 URL を収集（webRequest の補完）
        const perfUrls = performance.getEntriesByType('resource')
          .map(r => r.name)
          .filter(u => u.includes('video.twimg.com') && /\.mp4(\?|$)/i.test(u));
        res = await chrome.runtime.sendMessage({ action: 'downloadVideo', perfUrls });
      }
      showToast(res?.success
        ? '✓ ダウンロードを開始しました'
        : (res?.error || 'ダウンロードに失敗しました'));
    } catch (_) {
      showToast('エラーが発生しました');
    }
  }

  // ---- トースト通知 ----
  function showToast(msg) {
    document.getElementById('twdl-toast')?.remove();
    const t = document.createElement('div');
    t.id = 'twdl-toast';
    t.textContent = msg;
    Object.assign(t.style, {
      position:     'fixed',
      bottom:       '28px',
      left:         '50%',
      transform:    'translateX(-50%)',
      background:   'rgba(15,20,25,0.93)',
      color:        'white',
      padding:      '11px 22px',
      borderRadius: '24px',
      zIndex:       '2147483647',
      fontSize:     '14px',
      fontFamily:   '-apple-system, BlinkMacSystemFont, sans-serif',
      boxShadow:    '0 4px 14px rgba(0,0,0,0.35)',
      pointerEvents:'none',
      whiteSpace:   'nowrap',
    });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // ---- メッセージ受信 ----
  chrome.runtime.onMessage.addListener((req, _, sendResponse) => {
    if (req.action === 'showNotification') showToast(req.message);
    sendResponse({});
    return false;
  });

  // 初期化
  if (document.body) {
    floatBtn = createFloatBtn();
  } else {
    document.addEventListener('DOMContentLoaded', () => { floatBtn = createFloatBtn(); });
  }
})();
