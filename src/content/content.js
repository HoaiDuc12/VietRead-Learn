(function () {
  'use strict';

  // Guard against double injection
  if (window.__VRL_CONTENT_LOADED__) return;
  window.__VRL_CONTENT_LOADED__ = true;

  const VRL = globalThis.VRL;

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'KBD', 'SAMP', 'VAR',
    'SVG', 'MATH', 'CANVAS', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION',
    'BUTTON', 'AUDIO', 'VIDEO', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE',
    'HEAD', 'TITLE', 'LINK', 'META', 'IMG', 'BR', 'HR',
  ]);

  const CANDIDATE_TAGS = new Set([
    'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE',
    'FIGCAPTION', 'TD', 'TH', 'DT', 'DD', 'SUMMARY', 'CAPTION',
  ]);

  const CONTAINER_FALLBACK_TAGS = new Set(['DIV', 'SECTION', 'ARTICLE', 'SPAN', 'MAIN']);

  // Runtime state
  let settings = Object.assign({}, VRL.DEFAULT_SETTINGS);
  let vocabMap = {};
  let knownSet = new Set();
  let isTranslating = false;
  let pageDetectedLang = null; // e.g., 'en', 'ja', 'fr', etc.

  // Block tracking: Element -> BlockRecord
  const blockRecords = new Map();
  const observedElements = new Set();
  const queuedElements = new Set();
  const pageVocabMap = new Map(); // word -> { word, viMeaning, altMeanings, pos, phonetic, audioUrl, enDefinition, example, contextSentence, count }

  let intersectionObserver = null;
  let mutationObserver = null;
  let mutationTimer = null;

  // Concurrency queue for translation requests
  const taskQueue = [];
  let activeWorkers = 0;
  const MAX_CONCURRENCY = 4;

  // Shadow DOM UI state
  let shadowHost = null;
  let shadowRoot = null;
  let popoverEl = null;
  let selectionBtnEl = null;
  let toolbarEl = null;
  let drawerEl = null;
  let activeDrawerTab = 'words';
  let currentPopoverWord = null;
  let quizState = null;

  // Helpers to talk with background service worker
  function sendBg(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || !response.ok) {
            reject(new Error(response?.error || 'Background request failed'));
            return;
          }
          resolve(response.data);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function speakWord(word, audioUrl) {
    const cleanWord = String(word || '').trim();
    if (!cleanWord) return;

    const fallbackTTS = () => {
      try {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(cleanWord);
        utter.lang = settings.speechAccent || 'en-US';
        utter.rate = Number(settings.speechRate) || 0.95;
        window.speechSynthesis.speak(utter);
      } catch (_err) {
        // Ignore TTS failure
      }
    };

    if (audioUrl) {
      try {
        const audio = new Audio(audioUrl);
        audio.play().catch(fallbackTTS);
        return;
      } catch (_err) {
        fallbackTTS();
        return;
      }
    }
    fallbackTTS();
  }

  // Extract a clean sentence containing a given word from surrounding text
  function extractSentenceContext(fullText, word) {
    if (!fullText) return '';
    const cleaned = fullText.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= 200) return cleaned;
    const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleaned];
    const lowerWord = String(word || '').toLowerCase();
    for (const s of sentences) {
      if (s.toLowerCase().includes(lowerWord)) {
        return s.trim().slice(0, 260);
      }
    }
    return cleaned.slice(0, 220) + '…';
  }

  // -------------------- Shadow DOM UI Host --------------------
  function ensureShadowUI() {
    if (shadowHost && document.contains(shadowHost)) return shadowRoot;

    shadowHost = document.createElement('div');
    shadowHost.id = 'vrl-shadow-host';
    shadowHost.setAttribute('data-vrl-injected', 'true');
    shadowHost.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483646; pointer-events: none;';
    document.documentElement.appendChild(shadowHost);

    shadowRoot = shadowHost.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: #0f172a;
      }
      * { box-sizing: border-box; }

      /* Selection Quick Button */
      .vrl-sel-btn {
        position: fixed;
        pointer-events: auto;
        display: none;
        align-items: center;
        gap: 5px;
        padding: 5px 10px;
        border-radius: 999px;
        border: 1px solid rgba(16, 185, 129, 0.45);
        background: #0f172a;
        color: #f8fafc;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.28);
        transition: transform 0.12s ease, background 0.15s ease;
        z-index: 10;
      }
      .vrl-sel-btn:hover {
        background: #059669;
        transform: translateY(-1px);
      }

      /* Dictionary Popover Card */
      .vrl-popover {
        position: fixed;
        pointer-events: auto;
        display: none;
        width: 340px;
        max-width: calc(100vw - 24px);
        max-height: 75vh;
        overflow-y: auto;
        background: #ffffff;
        color: #0f172a;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        box-shadow: 0 18px 44px rgba(15, 23, 42, 0.22), 0 2px 6px rgba(15, 23, 42, 0.08);
        padding: 14px 16px;
        z-index: 20;
        font-size: 13.5px;
        line-height: 1.5;
      }
      .vrl-pop-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }
      .vrl-pop-word-wrap {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 6px;
      }
      .vrl-pop-word {
        font-size: 19px;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: -0.01em;
      }
      .vrl-pop-phonetic {
        font-size: 12.5px;
        color: #6366f1;
        font-family: "Segoe UI", ui-monospace, monospace;
      }
      .vrl-pop-pos {
        display: inline-block;
        font-size: 11px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 999px;
        background: #eef2ff;
        color: #4338ca;
      }
      .vrl-icon-btn {
        border: 1px solid #e2e8f0;
        background: #f8fafc;
        color: #334155;
        width: 28px;
        height: 28px;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 14px;
        flex-shrink: 0;
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      .vrl-icon-btn:hover {
        background: #ecfdf5;
        border-color: #10b981;
        color: #047857;
      }
      .vrl-pop-vi {
        font-size: 15.5px;
        font-weight: 600;
        color: #047857;
        background: #ecfdf5;
        padding: 8px 10px;
        border-radius: 9px;
        border-left: 3px solid #10b981;
        margin-bottom: 8px;
      }
      .vrl-pop-alts {
        font-size: 12.5px;
        color: #475569;
        margin-bottom: 8px;
      }
      .vrl-pop-alts strong { color: #334155; }
      .vrl-pop-def {
        font-size: 12.5px;
        color: #334155;
        margin-bottom: 8px;
        padding: 7px 9px;
        background: #f8fafc;
        border-radius: 8px;
      }
      .vrl-pop-example {
        font-size: 12px;
        color: #64748b;
        font-style: italic;
        margin-bottom: 10px;
        padding-left: 8px;
        border-left: 2px solid #cbd5e1;
      }
      .vrl-pop-actions {
        display: flex;
        gap: 8px;
        margin-top: 10px;
      }
      .vrl-btn {
        flex: 1;
        padding: 7px 10px;
        border-radius: 8px;
        font-size: 12.5px;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid #e2e8f0;
        background: #ffffff;
        color: #334155;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        transition: all 0.15s ease;
      }
      .vrl-btn:hover { background: #f1f5f9; }
      .vrl-btn-primary {
        background: #10b981;
        border-color: #10b981;
        color: #ffffff;
      }
      .vrl-btn-primary:hover { background: #059669; }
      .vrl-btn-saved {
        background: #fef3c7;
        border-color: #f59e0b;
        color: #92400e;
      }
      .vrl-btn-saved:hover { background: #fde68a; }
      .vrl-loading {
        text-align: center;
        padding: 18px 8px;
        color: #64748b;
        font-size: 13px;
      }

      /* Floating Mini Control Bar */
      .vrl-toolbar {
        position: fixed;
        right: 18px;
        bottom: 18px;
        pointer-events: auto;
        display: none;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        padding: 7px 10px;
        background: rgba(15, 23, 42, 0.94);
        color: #f8fafc;
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 999px;
        box-shadow: 0 12px 32px rgba(15, 23, 42, 0.34);
        backdrop-filter: blur(10px);
        font-size: 12px;
        z-index: 15;
      }
      .vrl-tb-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-weight: 700;
        color: #34d399;
        padding: 0 6px 0 4px;
      }
      .vrl-tb-sep {
        width: 1px;
        height: 16px;
        background: rgba(148, 163, 184, 0.3);
      }
      .vrl-tb-btn {
        border: 1px solid transparent;
        background: transparent;
        color: #e2e8f0;
        padding: 4px 9px;
        border-radius: 999px;
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.14s ease;
        white-space: nowrap;
      }
      .vrl-tb-btn:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #ffffff;
      }
      .vrl-tb-btn.active {
        background: #10b981;
        color: #022c22;
      }
      .vrl-tb-btn.vocab-pill {
        background: rgba(99, 102, 241, 0.25);
        border-color: rgba(129, 140, 248, 0.45);
        color: #e0e7ff;
      }
      .vrl-tb-btn.vocab-pill:hover {
        background: rgba(99, 102, 241, 0.45);
      }
      .vrl-tb-close {
        border: none;
        background: rgba(239, 68, 68, 0.2);
        color: #fca5a5;
        padding: 4px 9px;
        border-radius: 999px;
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
      }
      .vrl-tb-close:hover {
        background: #ef4444;
        color: #ffffff;
      }

      /* Slide-Over Page Vocabulary & Mini Quiz Drawer */
      .vrl-drawer {
        position: fixed;
        top: 14px;
        right: 14px;
        bottom: 68px;
        width: 370px;
        max-width: calc(100vw - 28px);
        pointer-events: auto;
        display: none;
        flex-direction: column;
        background: #ffffff;
        color: #0f172a;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        box-shadow: 0 22px 50px rgba(15, 23, 42, 0.25);
        z-index: 18;
        overflow: hidden;
      }
      .vrl-drawer-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 13px 16px;
        background: linear-gradient(135deg, #0f172a, #1e293b);
        color: #ffffff;
      }
      .vrl-drawer-title {
        font-size: 14.5px;
        font-weight: 700;
      }
      .vrl-drawer-tabs {
        display: flex;
        border-bottom: 1px solid #e2e8f0;
        background: #f8fafc;
      }
      .vrl-drawer-tab {
        flex: 1;
        padding: 9px 10px;
        border: none;
        background: transparent;
        color: #475569;
        font-size: 12.5px;
        font-weight: 600;
        cursor: pointer;
        border-bottom: 2px solid transparent;
      }
      .vrl-drawer-tab.active {
        color: #059669;
        border-bottom-color: #10b981;
        background: #ffffff;
      }
      .vrl-drawer-body {
        flex: 1;
        overflow-y: auto;
        padding: 12px 14px;
      }
      .vrl-drawer-footer {
        padding: 10px 14px;
        border-top: 1px solid #e2e8f0;
        background: #f8fafc;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .vrl-word-card {
        padding: 10px 12px;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        margin-bottom: 8px;
        background: #ffffff;
        transition: border-color 0.15s ease;
      }
      .vrl-word-card.saved {
        border-color: #fbbf24;
        background: #fffbeb;
      }
      .vrl-wc-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }
      .vrl-wc-en {
        font-weight: 700;
        font-size: 14.5px;
        color: #0f172a;
      }
      .vrl-wc-vi {
        font-size: 13px;
        color: #047857;
        margin-top: 3px;
        font-weight: 500;
      }
      .vrl-wc-ctx {
        font-size: 11.5px;
        color: #64748b;
        margin-top: 4px;
        line-height: 1.4;
      }
      .vrl-wc-btns {
        display: flex;
        gap: 4px;
      }
      .vrl-mini-btn {
        border: 1px solid #e2e8f0;
        background: #f8fafc;
        color: #334155;
        border-radius: 6px;
        padding: 3px 7px;
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
      }
      .vrl-mini-btn:hover { background: #e2e8f0; }
      .vrl-mini-btn.saved {
        background: #fef3c7;
        border-color: #f59e0b;
        color: #92400e;
      }

      /* Instant Article Quiz styles */
      .vrl-quiz-box {
        padding: 6px 2px;
      }
      .vrl-quiz-progress {
        font-size: 12px;
        color: #64748b;
        margin-bottom: 10px;
        display: flex;
        justify-content: space-between;
      }
      .vrl-quiz-prompt {
        background: #f1f5f9;
        border-radius: 12px;
        padding: 16px;
        text-align: center;
        margin-bottom: 12px;
      }
      .vrl-quiz-word {
        font-size: 22px;
        font-weight: 800;
        color: #0f172a;
        margin-bottom: 6px;
      }
      .vrl-quiz-ctx {
        font-size: 12px;
        color: #475569;
        font-style: italic;
      }
      .vrl-quiz-opt {
        width: 100%;
        text-align: left;
        padding: 10px 12px;
        margin-bottom: 8px;
        border: 1.5px solid #e2e8f0;
        border-radius: 10px;
        background: #ffffff;
        color: #1e293b;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.14s ease;
      }
      .vrl-quiz-opt:hover:not(:disabled) {
        border-color: #6366f1;
        background: #eef2ff;
      }
      .vrl-quiz-opt.correct {
        border-color: #10b981;
        background: #d1fae5;
        color: #065f46;
        font-weight: 700;
      }
      .vrl-quiz-opt.wrong {
        border-color: #ef4444;
        background: #fee2e2;
        color: #991b1b;
      }
      .vrl-empty {
        text-align: center;
        padding: 28px 16px;
        color: #64748b;
        font-size: 13px;
      }
    `;
    shadowRoot.appendChild(style);

    // Selection quick-lookup button
    selectionBtnEl = document.createElement('button');
    selectionBtnEl.className = 'vrl-sel-btn';
    selectionBtnEl.textContent = '📖 Dịch & Học';
    shadowRoot.appendChild(selectionBtnEl);

    // Dictionary Popover
    popoverEl = document.createElement('div');
    popoverEl.className = 'vrl-popover';
    shadowRoot.appendChild(popoverEl);

    // Floating Toolbar
    toolbarEl = document.createElement('div');
    toolbarEl.className = 'vrl-toolbar';
    shadowRoot.appendChild(toolbarEl);

    // Slide-over Drawer
    drawerEl = document.createElement('div');
    drawerEl.className = 'vrl-drawer';
    shadowRoot.appendChild(drawerEl);

    return shadowRoot;
  }

  function renderToolbar() {
    ensureShadowUI();
    if (!isTranslating) {
      toolbarEl.style.display = 'none';
      drawerEl.style.display = 'none';
      return;
    }

    const isEn = !pageDetectedLang || pageDetectedLang === 'en' || pageDetectedLang === 'auto';
    const langLabel = pageDetectedLang && pageDetectedLang !== 'auto'
      ? `${pageDetectedLang.toUpperCase()} → VI`
      : 'Dịch → VI';
    const vocabCount = pageVocabMap.size;

    toolbarEl.innerHTML = `
      <span class="vrl-tb-badge">● ${escapeHtml(langLabel)}</span>
      <span class="vrl-tb-sep"></span>
      <button class="vrl-tb-btn ${settings.mode === VRL.MODES.BILINGUAL ? 'active' : ''}" data-act="mode-bilingual" title="Đọc song ngữ Anh-Việt + gạch chân từ đáng học">Song ngữ</button>
      ${isEn ? `<button class="vrl-tb-btn ${settings.mode === VRL.MODES.IMMERSION ? 'active' : ''}" data-act="mode-immersion" title="Đọc tiếng Việt nhưng giữ lại từ tiếng Anh quan trọng">Trộn từ Anh</button>` : ''}
      <button class="vrl-tb-btn ${settings.mode === VRL.MODES.VIETNAMESE ? 'active' : ''}" data-act="mode-vietnamese" title="Chỉ hiện tiếng Việt (bấm EN để xem gốc)">Thuần Việt</button>
      ${isEn && settings.mode === VRL.MODES.BILINGUAL ? `
        <span class="vrl-tb-sep"></span>
        <button class="vrl-tb-btn ${settings.blurTranslation ? 'active' : ''}" data-act="toggle-blur" title="Làm mờ tiếng Việt để tập đọc tiếng Anh trước (Alt+B)">Mờ dịch</button>
      ` : ''}
      ${isEn && (settings.mode === VRL.MODES.BILINGUAL || settings.mode === VRL.MODES.IMMERSION) ? `
        <button class="vrl-tb-btn ${settings.showInlineGloss ? 'active' : ''}" data-act="toggle-gloss" title="Hiện nghĩa tiếng Việt gọn ngay cạnh từ tiếng Anh">Nghĩa gọn</button>
      ` : ''}
      ${isEn ? `
        <span class="vrl-tb-sep"></span>
        <button class="vrl-tb-btn vocab-pill" data-act="toggle-drawer">📚 Từ bài này (${vocabCount})</button>
      ` : ''}
      <button class="vrl-tb-close" data-act="stop" title="Khôi phục trang gốc (Alt+T)">✕ Gốc</button>
    `;
    toolbarEl.style.display = 'flex';

    toolbarEl.onclick = async (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      if (act === 'mode-bilingual') {
        settings = await VRL.storage.updateSettings({ mode: VRL.MODES.BILINGUAL });
        rerenderAllTranslatedBlocks();
        renderToolbar();
      } else if (act === 'mode-immersion') {
        settings = await VRL.storage.updateSettings({ mode: VRL.MODES.IMMERSION });
        rerenderAllTranslatedBlocks();
        renderToolbar();
      } else if (act === 'mode-vietnamese') {
        settings = await VRL.storage.updateSettings({ mode: VRL.MODES.VIETNAMESE });
        rerenderAllTranslatedBlocks();
        renderToolbar();
      } else if (act === 'toggle-blur') {
        settings = await VRL.storage.updateSettings({ blurTranslation: !settings.blurTranslation });
        rerenderAllTranslatedBlocks();
        renderToolbar();
      } else if (act === 'toggle-gloss') {
        settings = await VRL.storage.updateSettings({ showInlineGloss: !settings.showInlineGloss });
        rerenderAllTranslatedBlocks();
        renderToolbar();
      } else if (act === 'toggle-drawer') {
        if (drawerEl.style.display === 'flex') {
          drawerEl.style.display = 'none';
        } else {
          renderDrawer();
          drawerEl.style.display = 'flex';
        }
      } else if (act === 'stop') {
        stopPageTranslation();
      }
    };
  }

  // -------------------- Slide-Over Page Vocabulary & Instant Quiz Drawer --------------------
  function buildPageQuiz() {
    const words = Array.from(pageVocabMap.values()).filter((w) => w.viMeaning);
    if (words.length === 0) return null;

    // Shuffle and pick up to 6 questions
    const shuffled = [...words].sort(() => Math.random() - 0.5).slice(0, Math.min(6, words.length));
    const allViPool = [
      ...words.map((w) => w.viMeaning),
      ...VRL.QUIZ_FALLBACK_POOL.map((f) => f.vi),
    ];

    const questions = shuffled.map((item) => {
      const distractors = [];
      const used = new Set([item.viMeaning.toLowerCase()]);
      const candidates = [...allViPool].sort(() => Math.random() - 0.5);
      for (const c of candidates) {
        if (distractors.length >= 3) break;
        const low = c.toLowerCase();
        if (!used.has(low)) {
          used.add(low);
          distractors.push(c);
        }
      }
      const options = [item.viMeaning, ...distractors].sort(() => Math.random() - 0.5);
      return { item, options, answered: null };
    });

    return { questions, index: 0, score: 0, finished: false };
  }

  function renderDrawer() {
    ensureShadowUI();
    const words = Array.from(pageVocabMap.values()).sort((a, b) => {
      const aSaved = Boolean(vocabMap[a.word]);
      const bSaved = Boolean(vocabMap[b.word]);
      if (aSaved !== bSaved) return aSaved ? -1 : 1;
      return (b.count || 1) - (a.count || 1);
    });

    let bodyHtml = '';
    if (activeDrawerTab === 'words') {
      if (words.length === 0) {
        bodyHtml = `<div class="vrl-empty">Cuộn trang xuống để hệ thống trích xuất thêm từ vựng tiếng Anh đáng học từ bài viết này.</div>`;
      } else {
        bodyHtml = words.map((w) => {
          const isSaved = Boolean(vocabMap[w.word]);
          return `
            <div class="vrl-word-card ${isSaved ? 'saved' : ''}" data-word="${escapeHtml(w.word)}">
              <div class="vrl-wc-top">
                <span class="vrl-wc-en">${escapeHtml(w.displayWord || w.word)} ${w.phonetic ? `<small style="color:#6366f1;font-weight:400">${escapeHtml(w.phonetic)}</small>` : ''}</span>
                <div class="vrl-wc-btns">
                  <button class="vrl-mini-btn" data-dact="speak" data-word="${escapeHtml(w.word)}" title="Nghe phát âm">🔊</button>
                  <button class="vrl-mini-btn ${isSaved ? 'saved' : ''}" data-dact="save" data-word="${escapeHtml(w.word)}">${isSaved ? '★ Đã lưu' : '☆ Lưu'}</button>
                  <button class="vrl-mini-btn" data-dact="known" data-word="${escapeHtml(w.word)}" title="Ẩn từ này vì bạn đã biết">✓ Biết</button>
                </div>
              </div>
              <div class="vrl-wc-vi">${escapeHtml(w.viMeaning || 'Đang tải nghĩa...')}</div>
              ${w.contextSentence ? `<div class="vrl-wc-ctx">"${escapeHtml(w.contextSentence.slice(0, 140))}${w.contextSentence.length > 140 ? '…' : ''}"</div>` : ''}
            </div>
          `;
        }).join('');
      }
    } else {
      // Instant mini-quiz tab
      if (!quizState) {
        quizState = buildPageQuiz();
      }
      if (!quizState || quizState.questions.length === 0) {
        bodyHtml = `<div class="vrl-empty">Chưa có đủ từ vựng trên trang để tạo quiz. Hãy cuộn trang để dịch thêm vài đoạn tiếng Anh nhé!</div>`;
      } else if (quizState.finished) {
        const total = quizState.questions.length;
        const pct = Math.round((quizState.score / total) * 100);
        bodyHtml = `
          <div class="vrl-quiz-box" style="text-align:center;padding:18px 8px">
            <div style="font-size:36px;margin-bottom:8px">${pct >= 80 ? '🎉' : pct >= 50 ? '👏' : '💪'}</div>
            <div style="font-size:18px;font-weight:700;margin-bottom:4px">Hoàn thành Quiz bài viết!</div>
            <div style="font-size:14px;color:#059669;font-weight:600;margin-bottom:14px">Đúng ${quizState.score}/${total} câu (${pct}%)</div>
            <button class="vrl-btn vrl-btn-primary" data-qact="restart" style="width:100%;margin-bottom:8px">Làm lại bộ câu hỏi mới</button>
            <button class="vrl-btn" data-qact="open-review" style="width:100%">Mở Sổ Từ & Flashcard</button>
          </div>
        `;
      } else {
        const q = quizState.questions[quizState.index];
        const isSaved = Boolean(vocabMap[q.item.word]);
        bodyHtml = `
          <div class="vrl-quiz-box">
            <div class="vrl-quiz-progress">
              <span>Câu ${quizState.index + 1} / ${quizState.questions.length}</span>
              <span>Điểm: <strong>${quizState.score}</strong></span>
            </div>
            <div class="vrl-quiz-prompt">
              <div class="vrl-quiz-word">${escapeHtml(q.item.displayWord || q.item.word)}</div>
              <button class="vrl-mini-btn" data-dact="speak" data-word="${escapeHtml(q.item.word)}" style="margin-bottom:6px">🔊 Nghe phát âm</button>
              ${q.item.contextSentence ? `<div class="vrl-quiz-ctx">"${escapeHtml(q.item.contextSentence.slice(0, 150))}"</div>` : ''}
            </div>
            <div>
              ${q.options.map((opt, idx) => {
                let cls = 'vrl-quiz-opt';
                if (q.answered !== null) {
                  if (opt === q.item.viMeaning) cls += ' correct';
                  else if (idx === q.answered) cls += ' wrong';
                }
                return `<button class="${cls}" data-qopt="${idx}" ${q.answered !== null ? 'disabled' : ''}>${escapeHtml(opt)}</button>`;
              }).join('')}
            </div>
            ${q.answered !== null ? `
              <div style="display:flex;gap:8px;margin-top:10px">
                <button class="vrl-btn ${isSaved ? 'vrl-btn-saved' : ''}" data-dact="save" data-word="${escapeHtml(q.item.word)}">${isSaved ? '★ Đã lưu từ' : '☆ Lưu từ này'}</button>
                <button class="vrl-btn vrl-btn-primary" data-qact="next">${quizState.index + 1 >= quizState.questions.length ? 'Xem kết quả' : 'Câu tiếp →'}</button>
              </div>
            ` : ''}
          </div>
        `;
      }
    }

    drawerEl.innerHTML = `
      <div class="vrl-drawer-head">
        <span class="vrl-drawer-title">📚 Từ vựng trang này (${words.length})</span>
        <button class="vrl-icon-btn" data-dact="close" style="background:rgba(255,255,255,0.12);border-color:transparent;color:#fff">✕</button>
      </div>
      <div class="vrl-drawer-tabs">
        <button class="vrl-drawer-tab ${activeDrawerTab === 'words' ? 'active' : ''}" data-tab="words">Danh sách từ (${words.length})</button>
        <button class="vrl-drawer-tab ${activeDrawerTab === 'quiz' ? 'active' : ''}" data-tab="quiz">⚡ Quiz nhanh bài này</button>
      </div>
      <div class="vrl-drawer-body">${bodyHtml}</div>
      <div class="vrl-drawer-footer">
        <span style="font-size:11.5px;color:#64748b">Sổ của bạn: <strong>${Object.keys(vocabMap).length}</strong> từ</span>
        <button class="vrl-mini-btn" data-dact="open-review" style="background:#10b981;color:#fff;border-color:#10b981">Mở Sổ từ & Flashcard ↗</button>
      </div>
    `;

    drawerEl.onclick = async (e) => {
      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) {
        activeDrawerTab = tabBtn.getAttribute('data-tab');
        if (activeDrawerTab === 'quiz') quizState = buildPageQuiz();
        renderDrawer();
        return;
      }

      const qOpt = e.target.closest('[data-qopt]');
      if (qOpt && quizState) {
        const idx = Number(qOpt.getAttribute('data-qopt'));
        const q = quizState.questions[quizState.index];
        if (q.answered === null) {
          q.answered = idx;
          if (q.options[idx] === q.item.viMeaning) {
            quizState.score += 1;
          }
          renderDrawer();
        }
        return;
      }

      const qAct = e.target.closest('[data-qact]');
      if (qAct) {
        const act = qAct.getAttribute('data-qact');
        if (act === 'next' && quizState) {
          if (quizState.index + 1 >= quizState.questions.length) {
            quizState.finished = true;
          } else {
            quizState.index += 1;
          }
          renderDrawer();
        } else if (act === 'restart') {
          quizState = buildPageQuiz();
          renderDrawer();
        } else if (act === 'open-review') {
          sendBg({ type: 'OPEN_REVIEW_PAGE' }).catch(() => {});
        }
        return;
      }

      const actBtn = e.target.closest('[data-dact]');
      if (!actBtn) return;
      const act = actBtn.getAttribute('data-dact');
      const word = actBtn.getAttribute('data-word');

      if (act === 'close') {
        drawerEl.style.display = 'none';
      } else if (act === 'open-review') {
        sendBg({ type: 'OPEN_REVIEW_PAGE' }).catch(() => {});
      } else if (act === 'speak' && word) {
        const item = pageVocabMap.get(word);
        speakWord(word, item?.audioUrl);
      } else if (act === 'save' && word) {
        if (vocabMap[word]) {
          await sendBg({ type: 'REMOVE_VOCAB', word });
          delete vocabMap[word];
        } else {
          const item = pageVocabMap.get(word) || { word };
          let full = item;
          if (!item._hasFull) {
            try {
              full = Object.assign({}, item, await sendBg({ type: 'LOOKUP_WORD', word, fullDetails: true }));
              pageVocabMap.set(word, full);
            } catch (_e) {}
          }
          const saved = await sendBg({
            type: 'SAVE_VOCAB',
            payload: Object.assign({}, full, {
              sourceUrl: location.href,
              sourceTitle: document.title,
            }),
          });
          vocabMap[word] = saved;
        }
        rerenderAllTranslatedBlocks();
        renderDrawer();
      } else if (act === 'known' && word) {
        await sendBg({ type: 'MARK_KNOWN_WORD', word });
        knownSet.add(word);
        pageVocabMap.delete(word);
        rerenderAllTranslatedBlocks();
        renderToolbar();
        renderDrawer();
      }
    };
  }

  // -------------------- Dictionary Popover Card --------------------
  function positionPopover(rect) {
    const pad = 12;
    const popWidth = 340;
    const popEstHeight = 290;
    let left = rect.left;
    let top = rect.bottom + 8;

    if (left + popWidth > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - popWidth - pad);
    }
    if (left < pad) left = pad;

    if (top + popEstHeight > window.innerHeight - pad) {
      const aboveTop = rect.top - popEstHeight - 8;
      if (aboveTop >= pad) {
        top = aboveTop;
      } else {
        top = Math.max(pad, window.innerHeight - popEstHeight - pad);
      }
    }

    popoverEl.style.left = `${Math.round(left)}px`;
    popoverEl.style.top = `${Math.round(top)}px`;
  }

  function hidePopover() {
    if (popoverEl) popoverEl.style.display = 'none';
    currentPopoverWord = null;
  }

  async function openWordPopover(rawText, anchorRect, contextSentence = '') {
    ensureShadowUI();
    hideSelectionButton();

    const cleaned = String(rawText || '').trim();
    if (!cleaned) return;

    const isSingleWord = /^[A-Za-z][A-Za-z'-]{1,28}$/.test(cleaned);
    const wordKey = cleaned.toLowerCase();
    currentPopoverWord = wordKey;

    popoverEl.innerHTML = `<div class="vrl-loading">⏳ Đang tra từ "<strong>${escapeHtml(cleaned)}</strong>"...</div>`;
    popoverEl.style.display = 'block';
    positionPopover(anchorRect);

    try {
      let info;
      if (isSingleWord) {
        info = await sendBg({ type: 'LOOKUP_WORD', word: wordKey, fullDetails: true });
      } else {
        const tr = await sendBg({ type: 'TRANSLATE_TEXT', text: cleaned, sourceLang: 'auto', targetLang: 'vi' });
        info = {
          word: wordKey,
          displayWord: cleaned,
          viMeaning: tr.translatedText,
          altMeanings: [],
          pos: tr.detectedLang === 'en' ? 'cụm từ' : tr.detectedLang,
          phonetic: '',
          audioUrl: '',
          enDefinition: '',
          example: '',
        };
      }

      if (currentPopoverWord !== wordKey) return; // Stale lookup

      if (!info) {
        popoverEl.innerHTML = `<div class="vrl-loading">Không tìm thấy nghĩa cho "${escapeHtml(cleaned)}".</div>`;
        return;
      }

      const fullPayload = Object.assign({}, info, {
        contextSentence: contextSentence || info.example || '',
        sourceUrl: location.href,
        sourceTitle: document.title,
      });

      const isSaved = Boolean(vocabMap[wordKey]);
      const posLabel = VRL.POS_VI_LABELS[info.pos] ? `${info.pos} (${VRL.POS_VI_LABELS[info.pos]})` : info.pos;

      let posGroupsHtml = '';
      if (Array.isArray(info.posGroups) && info.posGroups.length > 0) {
        posGroupsHtml = info.posGroups
          .map((g) => `<div><strong>${escapeHtml(VRL.POS_VI_LABELS[g.pos] || g.pos)}:</strong> ${escapeHtml(g.terms.join(', '))}</div>`)
          .join('');
      } else if (Array.isArray(info.altMeanings) && info.altMeanings.length > 0) {
        posGroupsHtml = `<div><strong>Nghĩa khác:</strong> ${escapeHtml(info.altMeanings.join(', '))}</div>`;
      }

      popoverEl.innerHTML = `
        <div class="vrl-pop-header">
          <div>
            <div class="vrl-pop-word-wrap">
              <span class="vrl-pop-word">${escapeHtml(info.displayWord || cleaned)}</span>
              ${info.phonetic ? `<span class="vrl-pop-phonetic">${escapeHtml(info.phonetic)}</span>` : ''}
            </div>
            ${posLabel ? `<span class="vrl-pop-pos" style="margin-top:4px">${escapeHtml(posLabel)}</span>` : ''}
          </div>
          <div style="display:flex;gap:5px">
            <button class="vrl-icon-btn" data-pact="speak" title="Nghe phát âm">🔊</button>
            <button class="vrl-icon-btn" data-pact="close" title="Đóng">✕</button>
          </div>
        </div>

        <div class="vrl-pop-vi">${escapeHtml(info.viMeaning || '(Chưa có bản dịch)')}</div>
        ${posGroupsHtml ? `<div class="vrl-pop-alts">${posGroupsHtml}</div>` : ''}
        ${info.enDefinition ? `<div class="vrl-pop-def"><strong>EN:</strong> ${escapeHtml(info.enDefinition)}</div>` : ''}
        ${info.example ? `<div class="vrl-pop-example">"${escapeHtml(info.example)}"</div>` : ''}
        ${contextSentence && contextSentence !== info.example ? `<div class="vrl-pop-example"><strong>Ngữ cảnh trang:</strong> "${escapeHtml(contextSentence.slice(0, 170))}${contextSentence.length > 170 ? '…' : ''}"</div>` : ''}

        <div class="vrl-pop-actions">
          <button class="vrl-btn ${isSaved ? 'vrl-btn-saved' : 'vrl-btn-primary'}" data-pact="save">
            ${isSaved ? '★ Đã lưu vào sổ' : '☆ Lưu học từ này'}
          </button>
          ${isSingleWord ? `<button class="vrl-btn" data-pact="known" title="Không highlight từ này nữa">✓ Đã biết</button>` : ''}
        </div>
      `;

      // Auto-reposition if popover height exceeded estimate
      positionPopover(anchorRect);

      popoverEl.onclick = async (e) => {
        const btn = e.target.closest('[data-pact]');
        if (!btn) return;
        const pact = btn.getAttribute('data-pact');

        if (pact === 'close') {
          hidePopover();
        } else if (pact === 'speak') {
          speakWord(info.displayWord || cleaned, info.audioUrl);
        } else if (pact === 'save') {
          if (vocabMap[wordKey]) {
            await sendBg({ type: 'REMOVE_VOCAB', word: wordKey });
            delete vocabMap[wordKey];
            btn.className = 'vrl-btn vrl-btn-primary';
            btn.textContent = '☆ Lưu học từ này';
          } else {
            const saved = await sendBg({ type: 'SAVE_VOCAB', payload: fullPayload });
            vocabMap[wordKey] = saved;
            btn.className = 'vrl-btn vrl-btn-saved';
            btn.textContent = '★ Đã lưu vào sổ';
          }
          if (isTranslating) {
            rerenderAllTranslatedBlocks();
            if (drawerEl && drawerEl.style.display === 'flex') renderDrawer();
          }
        } else if (pact === 'known') {
          await sendBg({ type: 'MARK_KNOWN_WORD', word: wordKey });
          knownSet.add(wordKey);
          pageVocabMap.delete(wordKey);
          hidePopover();
          if (isTranslating) {
            rerenderAllTranslatedBlocks();
            renderToolbar();
            if (drawerEl && drawerEl.style.display === 'flex') renderDrawer();
          }
        }
      };
    } catch (err) {
      popoverEl.innerHTML = `<div class="vrl-loading" style="color:#dc2626">Không thể tra từ lúc này (${escapeHtml(err.message)}).</div>`;
    }
  }

  // -------------------- Text Selection Quick Lookup --------------------
  function hideSelectionButton() {
    if (selectionBtnEl) selectionBtnEl.style.display = 'none';
  }

  document.addEventListener('mouseup', (e) => {
    if (!settings.enableSelectionLookup) return;
    if (shadowHost && shadowHost.contains(e.target)) return;

    // Slight delay so browser finalizes selection
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        hideSelectionButton();
        return;
      }
      const text = sel.toString().trim();
      if (!text || text.length < 2 || text.length > 260) {
        hideSelectionButton();
        return;
      }
      if (VRL.vocabFilter.isAlreadyVietnamese(text)) {
        hideSelectionButton();
        return;
      }

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;

      ensureShadowUI();
      const btnTop = Math.max(8, rect.top - 36);
      const btnLeft = Math.min(window.innerWidth - 130, Math.max(8, rect.left + rect.width / 2 - 52));
      selectionBtnEl.style.left = `${Math.round(btnLeft)}px`;
      selectionBtnEl.style.top = `${Math.round(btnTop)}px`;
      selectionBtnEl.style.display = 'inline-flex';

      const anchorText = sel.anchorNode?.parentElement?.textContent || '';
      const ctx = extractSentenceContext(anchorText, text);

      selectionBtnEl.onclick = (ev) => {
        ev.stopPropagation();
        openWordPopover(text, rect, ctx);
      };
    }, 10);
  });

  // Alt + Double-click any English word for instant lookup
  document.addEventListener('dblclick', (e) => {
    if (!e.altKey) return;
    if (shadowHost && shadowHost.contains(e.target)) return;
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (text && /^[A-Za-z][A-Za-z'-]{1,28}$/.test(text)) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const ctx = extractSentenceContext(e.target?.textContent || '', text);
      openWordPopover(text, rect, ctx);
    }
  });

  // Click outside to close popover / selection button
  document.addEventListener('mousedown', (e) => {
    const path = e.composedPath ? e.composedPath() : [];
    const insideShadow = shadowHost && path.includes(shadowHost);
    if (!insideShadow) {
      hideSelectionButton();
      // Do not close if clicking directly on a highlighted vocab token (its click handler opens it)
      if (!e.target?.closest?.('.vrl-vocab, .vrl-inline-gloss, .vrl-mix-word, .vrl-chip')) {
        hidePopover();
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hidePopover();
      hideSelectionButton();
      if (drawerEl) drawerEl.style.display = 'none';
    }
  });

  // Delegate clicks on highlighted vocab words, inline glosses, immersion tokens & chips
  document.addEventListener('click', (e) => {
    const target = e.target?.closest?.('.vrl-vocab, .vrl-inline-gloss, .vrl-mix-word, .vrl-chip');
    if (target) {
      e.preventDefault();
      e.stopPropagation();
      const word = target.getAttribute('data-vrl-word');
      if (!word) return;
      const rect = target.getBoundingClientRect();
      const blockEl = target.closest('[data-vrl-block="true"]');
      const record = blockEl ? blockRecords.get(blockEl) : null;
      const ctx = record ? extractSentenceContext(record.originalText, word) : '';
      openWordPopover(word, rect, ctx);
      return;
    }

    // Reveal blurred Vietnamese translation on click
    const blurred = e.target?.closest?.('.vrl-bilingual-vi.vrl-blurred');
    if (blurred) {
      blurred.classList.toggle('vrl-revealed');
      return;
    }

    // Toggle original text peek button in Immersion / Vietnamese modes
    const peekBtn = e.target?.closest?.('.vrl-peek-btn');
    if (peekBtn) {
      e.preventDefault();
      e.stopPropagation();
      const blockEl = peekBtn.closest('[data-vrl-block="true"]');
      const origWrap = blockEl ? blockEl.querySelector(':scope > .vrl-orig-wrap') : null;
      if (origWrap) {
        origWrap.classList.toggle('vrl-orig-peek');
      }
    }
  });

  // -------------------- DOM Traversal & Block Detection --------------------
  function isElementVisible(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (el.getClientRects().length === 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function hasSkipAncestor(el) {
    let curr = el;
    while (curr && curr !== document.body) {
      if (SKIP_TAGS.has(curr.tagName)) return true;
      if (curr.getAttribute('contenteditable') === 'true') return true;
      if (curr.getAttribute('translate') === 'no') return true;
      if (curr.classList && curr.classList.contains('notranslate')) return true;
      if (curr.hasAttribute('data-vrl-injected') || curr.id === 'vrl-shadow-host') return true;
      curr = curr.parentElement;
    }
    return false;
  }

  function hasNestedBlockCandidate(el) {
    for (const child of el.children) {
      if (CANDIDATE_TAGS.has(child.tagName)) return true;
      if (child.children.length > 0 && hasNestedBlockCandidate(child)) return true;
    }
    return false;
  }

  function getDirectTextLength(el) {
    let len = 0;
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        len += node.nodeValue.trim().length;
      }
    }
    return len;
  }

  function extractCleanElementText(el) {
    // Collect visible text skipping code/pre/injected nodes
    let parts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest('[data-vrl-injected], code, pre, kbd, samp, svg')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = walker.nextNode())) {
      parts.push(n.nodeValue);
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  function shouldTranslateElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (observedElements.has(el) || blockRecords.has(el)) return false;
    if (SKIP_TAGS.has(el.tagName)) return false;
    if (hasSkipAncestor(el)) return false;
    if (!isElementVisible(el)) return false;

    const isSemanticCandidate = CANDIDATE_TAGS.has(el.tagName);
    const isContainerFallback = CONTAINER_FALLBACK_TAGS.has(el.tagName);
    if (!isSemanticCandidate && !isContainerFallback) return false;

    // Avoid translating parent container if it wraps semantic block children (e.g., <li><p>...</p></li> or <div><p>...</p></div>)
    if (hasNestedBlockCandidate(el)) return false;

    // For fallback containers (div/span/section), require substantial direct text so we don't translate UI wrapper chrome
    if (isContainerFallback && getDirectTextLength(el) < 24) return false;

    const text = extractCleanElementText(el);
    if (text.length < 6) return false;
    // Skip pure numbers, symbols, URLs
    const letters = text.match(/\p{L}/gu);
    if (!letters || letters.length < 4) return false;
    if (/^https?:\/\/\S+$/i.test(text)) return false;
    // Skip already Vietnamese text
    if (VRL.vocabFilter.isAlreadyVietnamese(text)) return false;

    return true;
  }

  function collectTranslatableBlocks(root = document.body) {
    if (!root) return [];
    const results = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (SKIP_TAGS.has(node.tagName)) return NodeFilter.FILTER_REJECT;
        if (node.hasAttribute('data-vrl-injected') || node.id === 'vrl-shadow-host') {
          return NodeFilter.FILTER_REJECT;
        }
        if (node.getAttribute('translate') === 'no' || node.classList?.contains('notranslate')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node = root;
    while (node) {
      if (shouldTranslateElement(node)) {
        results.push(node);
      }
      node = walker.nextNode();
    }
    return results;
  }

  // -------------------- Clean DOM Rendering & Restoration --------------------
  function unwrapVocabSpans(el) {
    const glosses = el.querySelectorAll('.vrl-inline-gloss');
    for (const g of glosses) g.remove();

    const spans = el.querySelectorAll('span.vrl-vocab');
    for (const sp of spans) {
      const textNode = document.createTextNode(sp.textContent || '');
      sp.replaceWith(textNode);
    }
    el.normalize();
  }

  function restoreElementToOriginal(el) {
    if (!el || !document.contains(el)) return;

    // If children were moved into .vrl-orig-wrap, restore them first
    const origWrap = el.querySelector(':scope > .vrl-orig-wrap');
    if (origWrap) {
      while (origWrap.firstChild) {
        el.insertBefore(origWrap.firstChild, origWrap);
      }
      origWrap.remove();
    }

    // Remove any injected blocks
    const injected = el.querySelectorAll(':scope > [data-vrl-injected="true"]');
    for (const node of injected) node.remove();

    unwrapVocabSpans(el);
    el.removeAttribute('data-vrl-block');
  }

  // Highlight selected English learning words inside live text nodes of el
  function highlightWordsInElement(el, targetWords, wordDict) {
    if (!targetWords || targetWords.length === 0) return;

    const targetMap = new Map();
    for (const tw of targetWords) {
      targetMap.set(tw.word.toLowerCase(), tw);
    }

    // Only highlight the first occurrence of each word inside a single paragraph so it stays clean
    const highlightedOnce = new Set();

    const textNodes = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest('[data-vrl-injected], .vrl-vocab, code, pre, kbd, samp, svg')) {
          return NodeFilter.FILTER_REJECT;
        }
        return node.nodeValue.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    let n;
    while ((n = walker.nextNode())) textNodes.push(n);

    const wordTokenRe = /\b[A-Za-z]{4,22}\b/g;

    for (const textNode of textNodes) {
      const content = textNode.nodeValue;
      wordTokenRe.lastIndex = 0;
      const matches = [];
      let m;
      while ((m = wordTokenRe.exec(content)) !== null) {
        const lower = m[0].toLowerCase();
        if (targetMap.has(lower) && !highlightedOnce.has(lower)) {
          highlightedOnce.add(lower);
          matches.push({ start: m.index, end: m.index + m[0].length, raw: m[0], lower });
        }
      }
      if (matches.length === 0) continue;

      const frag = document.createDocumentFragment();
      let cursor = 0;
      for (const hit of matches) {
        if (hit.start > cursor) {
          frag.appendChild(document.createTextNode(content.slice(cursor, hit.start)));
        }

        const isSaved = Boolean(vocabMap[hit.lower]);
        const dictEntry = wordDict[hit.lower];

        const span = document.createElement('span');
        span.className = `vrl-vocab${isSaved ? ' vrl-vocab-saved' : ''}`;
        span.setAttribute('data-vrl-word', hit.lower);
        span.title = dictEntry?.viMeaning
          ? `${hit.raw}: ${dictEntry.viMeaning} (nhấn để xem chi tiết & lưu)`
          : `Nhấn để tra từ "${hit.raw}"`;
        span.textContent = hit.raw;
        frag.appendChild(span);

        if (settings.showInlineGloss && dictEntry?.viMeaning) {
          const shortGloss = dictEntry.viMeaning.split(/[,;]/)[0].trim().slice(0, 26);
          if (shortGloss) {
            const gloss = document.createElement('span');
            gloss.className = 'vrl-inline-gloss';
            gloss.setAttribute('data-vrl-word', hit.lower);
            gloss.setAttribute('data-vrl-injected', 'true');
            gloss.textContent = shortGloss;
            frag.appendChild(gloss);
          }
        }

        cursor = hit.end;
      }

      if (cursor < content.length) {
        frag.appendChild(document.createTextNode(content.slice(cursor)));
      }
      textNode.replaceWith(frag);
    }
  }

  function renderBlock(record) {
    const { el, translatedText, detectedLang, originalText, wordDict } = record;
    if (!el || !document.contains(el)) return;

    // Reset element cleanly before rendering target mode
    restoreElementToOriginal(el);
    el.setAttribute('data-vrl-block', 'true');

    const isEn = detectedLang === 'en' || (detectedLang === 'auto' && VRL.vocabFilter.isLikelyEnglishText(originalText));

    // Recompute active target words based on current level, density, saved & known sets
    let activeTargetWords = [];
    if (isEn) {
      const savedSet = new Set(Object.keys(vocabMap));
      activeTargetWords = VRL.vocabFilter.extractLearningWords(originalText, {
        level: settings.level,
        maxWords: settings.vocabDensity,
        knownSet,
        savedSet,
      });
    }

    const effectiveMode = !isEn && settings.mode === VRL.MODES.IMMERSION
      ? VRL.MODES.VIETNAMESE
      : settings.mode;

    if (effectiveMode === VRL.MODES.BILINGUAL) {
      // 1) Highlight learning words inside English original text
      if (isEn && activeTargetWords.length > 0) {
        highlightWordsInElement(el, activeTargetWords, wordDict || {});
      }

      // 2) Append Vietnamese translation block below
      const viBox = document.createElement('span');
      viBox.className = `vrl-bilingual-vi${isEn && settings.blurTranslation ? ' vrl-blurred' : ''}`;
      viBox.setAttribute('data-vrl-injected', 'true');
      viBox.textContent = translatedText;
      if (isEn && settings.blurTranslation) {
        viBox.title = 'Di chuột hoặc nhấn để hiện bản dịch tiếng Việt';
      }
      el.appendChild(viBox);
      return;
    }

    // Replacement modes: IMMERSION or VIETNAMESE
    // Move existing children cleanly into .vrl-orig-wrap (preserving event listeners & structure!)
    const origWrap = document.createElement('span');
    origWrap.className = 'vrl-orig-wrap';
    while (el.firstChild) {
      origWrap.appendChild(el.firstChild);
    }
    el.appendChild(origWrap);

    const replaceSpan = document.createElement('span');
    replaceSpan.className = 'vrl-vi-replace';
    replaceSpan.setAttribute('data-vrl-injected', 'true');

    if (effectiveMode === VRL.MODES.IMMERSION && isEn && activeTargetWords.length > 0) {
      // Build word info array for immersion mixer
      const wordInfos = activeTargetWords
        .map((tw) => {
          const d = (wordDict && wordDict[tw.word]) || {};
          return {
            word: tw.word,
            displayWord: tw.word,
            viMeaning: d.viMeaning || '',
            altMeanings: d.altMeanings || [],
            phonetic: d.phonetic || '',
            isSaved: Boolean(vocabMap[tw.word]),
          };
        })
        .filter((info) => info.viMeaning);

      const { segments, unmatchedWords } = VRL.vocabFilter.planImmersionSegments(translatedText, wordInfos);

      for (const seg of segments) {
        if (seg.type === 'text') {
          replaceSpan.appendChild(document.createTextNode(seg.text));
        } else {
          const w = seg.wordInfo;
          const token = document.createElement('span');
          token.className = `vrl-mix-word${w.isSaved ? ' vrl-vocab-saved' : ''}`;
          token.setAttribute('data-vrl-word', w.word);
          token.title = `${w.word} = ${seg.matchedVi} (nhấn để nghe & lưu)`;
          token.textContent = w.displayWord;

          if (settings.showInlineGloss) {
            const gloss = document.createElement('span');
            gloss.className = 'vrl-mix-gloss';
            gloss.textContent = `(${seg.matchedVi})`;
            token.appendChild(gloss);
          }
          replaceSpan.appendChild(token);
        }
      }

      // Peek original English button
      const peekBtn = document.createElement('span');
      peekBtn.className = 'vrl-peek-btn';
      peekBtn.title = 'Xem / Ẩn câu tiếng Anh gốc';
      peekBtn.textContent = 'EN';
      replaceSpan.appendChild(peekBtn);

      // Compact chip bar for any key words whose exact Vietnamese phrase was paraphrased in context
      if (unmatchedWords.length > 0) {
        const strip = document.createElement('span');
        strip.className = 'vrl-chip-strip';
        const lbl = document.createElement('span');
        lbl.className = 'vrl-chip-label';
        lbl.textContent = 'Từ mới:';
        strip.appendChild(lbl);

        for (const w of unmatchedWords) {
          const shortVi = w.viMeaning.split(/[,;]/)[0].trim();
          const chip = document.createElement('span');
          chip.className = `vrl-chip${w.isSaved ? ' vrl-vocab-saved' : ''}`;
          chip.setAttribute('data-vrl-word', w.word);
          chip.title = `Nhấn để nghe phát âm & lưu "${w.word}"`;

          const enSpan = document.createElement('span');
          enSpan.className = 'vrl-chip-en';
          enSpan.textContent = w.displayWord;
          chip.appendChild(enSpan);

          if (settings.showInlineGloss && shortVi) {
            const viSpan = document.createElement('span');
            viSpan.className = 'vrl-chip-vi';
            viSpan.textContent = `· ${shortVi}`;
            chip.appendChild(viSpan);
          }
          strip.appendChild(chip);
        }
        replaceSpan.appendChild(strip);
      }
    } else {
      // Pure Vietnamese mode
      replaceSpan.appendChild(document.createTextNode(translatedText));
      const peekBtn = document.createElement('span');
      peekBtn.className = 'vrl-peek-btn';
      peekBtn.title = 'Xem / Ẩn câu gốc';
      peekBtn.textContent = detectedLang ? detectedLang.toUpperCase() : 'Gốc';
      replaceSpan.appendChild(peekBtn);
    }

    el.insertBefore(replaceSpan, origWrap);
  }

  async function rerenderAllTranslatedBlocks() {
    // If learner lowered difficulty or increased density, fetch any missing word meanings in one batch
    const missingWords = new Set();
    const savedSet = new Set(Object.keys(vocabMap));
    for (const record of blockRecords.values()) {
      const isEn = record.detectedLang === 'en' || (record.detectedLang === 'auto' && VRL.vocabFilter.isLikelyEnglishText(record.originalText));
      if (!isEn) continue;
      const targets = VRL.vocabFilter.extractLearningWords(record.originalText, {
        level: settings.level,
        maxWords: settings.vocabDensity,
        knownSet,
        savedSet,
      });
      for (const tw of targets) {
        if (!record.wordDict || !record.wordDict[tw.word]) {
          missingWords.add(tw.word);
        }
      }
    }

    if (missingWords.size > 0) {
      try {
        const fetched = await sendBg({
          type: 'LOOKUP_WORDS_BATCH',
          words: Array.from(missingWords),
          fullDetails: false,
        });
        for (const record of blockRecords.values()) {
          record.wordDict = Object.assign({}, record.wordDict || {}, fetched || {});
        }
      } catch (_err) {
        // Proceed with existing cached meanings
      }
    }

    for (const record of blockRecords.values()) {
      renderBlock(record);
    }
  }

  // -------------------- Translation Queue Execution --------------------
  async function processSingleElement(el) {
    if (!isTranslating || !document.contains(el)) return;
    if (blockRecords.has(el)) return;

    const originalText = extractCleanElementText(el);
    if (!originalText || originalText.length < 6) return;

    // Subtle loading marker
    const loader = document.createElement('span');
    loader.className = 'vrl-translating-indicator';
    loader.setAttribute('data-vrl-injected', 'true');
    loader.textContent = '…';
    el.appendChild(loader);

    try {
      const tr = await sendBg({
        type: 'TRANSLATE_TEXT',
        text: originalText,
        sourceLang: 'auto',
        targetLang: 'vi',
      });

      loader.remove();
      if (!isTranslating || !document.contains(el)) return;

      // Skip if source was actually Vietnamese
      if (tr.detectedLang === 'vi' || !tr.translatedText) return;

      if (!pageDetectedLang && tr.detectedLang && tr.detectedLang !== 'auto') {
        pageDetectedLang = tr.detectedLang;
        renderToolbar();
      }

      const isEn = tr.detectedLang === 'en' || (tr.detectedLang === 'auto' && VRL.vocabFilter.isLikelyEnglishText(originalText));
      let wordDict = {};

      if (isEn) {
        // Extract candidate words up to max density (5 so switching density later already has meanings!)
        const savedSet = new Set(Object.keys(vocabMap));
        const candidates = VRL.vocabFilter.extractLearningWords(originalText, {
          level: settings.level,
          maxWords: Math.max(5, Number(settings.vocabDensity) || 3),
          knownSet,
          savedSet,
        });

        if (candidates.length > 0) {
          wordDict = await sendBg({
            type: 'LOOKUP_WORDS_BATCH',
            words: candidates.map((c) => c.word),
            fullDetails: false,
          }).catch(() => ({}));

          // Collect into pageVocabMap for the Page Vocab Drawer & Instant Quiz
          for (const cand of candidates.slice(0, settings.vocabDensity)) {
            const info = wordDict[cand.word];
            if (!info || !info.viMeaning) continue;
            const prev = pageVocabMap.get(cand.word);
            if (prev) {
              prev.count = (prev.count || 1) + 1;
            } else {
              pageVocabMap.set(cand.word, Object.assign({}, info, {
                contextSentence: extractSentenceContext(originalText, cand.word),
                count: 1,
              }));
            }
          }
          renderToolbar();
          if (drawerEl && drawerEl.style.display === 'flex' && activeDrawerTab === 'words') {
            renderDrawer();
          }
        }
      }

      const record = {
        el,
        originalText,
        translatedText: tr.translatedText,
        detectedLang: tr.detectedLang,
        wordDict,
      };
      blockRecords.set(el, record);
      renderBlock(record);
    } catch (_err) {
      loader.remove();
    }
  }

  function pumpQueue() {
    while (isTranslating && activeWorkers < MAX_CONCURRENCY && taskQueue.length > 0) {
      const el = taskQueue.shift();
      queuedElements.delete(el);
      if (!document.contains(el) || blockRecords.has(el)) continue;
      activeWorkers++;
      processSingleElement(el).finally(() => {
        activeWorkers--;
        pumpQueue();
      });
    }
  }

  function enqueueElement(el) {
    if (!isTranslating || blockRecords.has(el) || queuedElements.has(el)) return;
    queuedElements.add(el);
    taskQueue.push(el);
    pumpQueue();
  }

  function observeBlocks(elements) {
    if (!intersectionObserver) {
      intersectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              intersectionObserver.unobserve(entry.target);
              enqueueElement(entry.target);
            }
          }
        },
        { rootMargin: '420px 0px' }
      );
    }

    for (const el of elements) {
      if (observedElements.has(el)) continue;
      observedElements.add(el);
      intersectionObserver.observe(el);
    }
  }

  // -------------------- Start / Stop Full Page Translation --------------------
  async function startPageTranslation() {
    if (isTranslating) return;
    await refreshStateFromStorage();

    isTranslating = true;
    pageDetectedLang = null;
    pageVocabMap.clear();
    quizState = null;

    renderToolbar();

    const blocks = collectTranslatableBlocks(document.body);
    observeBlocks(blocks);

    // Watch for dynamically appended content (SPA, infinite scroll)
    if (!mutationObserver) {
      mutationObserver = new MutationObserver(() => {
        if (!isTranslating) return;
        clearTimeout(mutationTimer);
        mutationTimer = setTimeout(() => {
          if (!isTranslating) return;
          const newBlocks = collectTranslatableBlocks(document.body);
          if (newBlocks.length > 0) observeBlocks(newBlocks);
        }, 500);
      });
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    }

    sendBg({ type: 'BUMP_PAGE_TRANSLATED' }).catch(() => {});
  }

  function stopPageTranslation() {
    isTranslating = false;
    taskQueue.length = 0;
    queuedElements.clear();

    if (intersectionObserver) {
      intersectionObserver.disconnect();
      intersectionObserver = null;
    }
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }

    for (const el of blockRecords.keys()) {
      restoreElementToOriginal(el);
    }
    blockRecords.clear();
    pageVocabMap.clear();
    pageDetectedLang = null;

    observedElements.clear();
    renderToolbar();
  }

  async function refreshStateFromStorage() {
    const [s, v, k] = await Promise.all([
      VRL.storage.getSettings(),
      VRL.storage.getVocabMap(),
      VRL.storage.getKnownWords(),
    ]);
    settings = s;
    vocabMap = v;
    knownSet = new Set(k);
  }

  // -------------------- Live Storage Sync & Messages --------------------
  chrome.storage.onChanged.addListener(async (changes) => {
    let needsRerender = false;
    if (changes[VRL.STORAGE_KEYS.SETTINGS]) {
      settings = Object.assign({}, VRL.DEFAULT_SETTINGS, changes[VRL.STORAGE_KEYS.SETTINGS].newValue || {});
      needsRerender = true;
    }
    if (changes[VRL.STORAGE_KEYS.VOCAB]) {
      vocabMap = changes[VRL.STORAGE_KEYS.VOCAB].newValue || {};
      needsRerender = true;
    }
    if (changes[VRL.STORAGE_KEYS.KNOWN_WORDS]) {
      knownSet = new Set(changes[VRL.STORAGE_KEYS.KNOWN_WORDS].newValue || []);
      needsRerender = true;
    }
    if (needsRerender && isTranslating) {
      rerenderAllTranslatedBlocks();
      renderToolbar();
      if (drawerEl && drawerEl.style.display === 'flex') renderDrawer();
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return false;

    (async () => {
      switch (msg.type) {
        case 'GET_PAGE_STATUS': {
          sendResponse({
            isTranslating,
            detectedLang: pageDetectedLang,
            translatedBlockCount: blockRecords.size,
            pageVocabCount: pageVocabMap.size,
            hostname: location.hostname,
          });
          break;
        }
        case 'TOGGLE_PAGE_TRANSLATION': {
          if (isTranslating) stopPageTranslation();
          else await startPageTranslation();
          sendResponse({ isTranslating });
          break;
        }
        case 'START_PAGE_TRANSLATION': {
          await startPageTranslation();
          sendResponse({ isTranslating: true });
          break;
        }
        case 'STOP_PAGE_TRANSLATION': {
          stopPageTranslation();
          sendResponse({ isTranslating: false });
          break;
        }
        case 'TOGGLE_BLUR_TRANSLATION': {
          settings = await VRL.storage.updateSettings({ blurTranslation: !settings.blurTranslation });
          if (isTranslating) {
            rerenderAllTranslatedBlocks();
            renderToolbar();
          }
          sendResponse({ blurTranslation: settings.blurTranslation });
          break;
        }
        case 'OPEN_PAGE_DRAWER': {
          if (!isTranslating) await startPageTranslation();
          activeDrawerTab = msg.tab || 'words';
          if (activeDrawerTab === 'quiz') quizState = buildPageQuiz();
          renderDrawer();
          drawerEl.style.display = 'flex';
          sendResponse({ ok: true });
          break;
        }
        case 'LOOKUP_SELECTION_FROM_MENU': {
          const text = msg.text || '';
          const sel = window.getSelection();
          let rect = { left: window.innerWidth / 2 - 170, top: 80, bottom: 110, width: 0, height: 0 };
          let ctx = '';
          if (sel && sel.rangeCount > 0) {
            const r = sel.getRangeAt(0).getBoundingClientRect();
            if (r.width > 0 || r.height > 0) rect = r;
            ctx = extractSentenceContext(sel.anchorNode?.parentElement?.textContent || '', text);
          }
          openWordPopover(text, rect, ctx);
          sendResponse({ ok: true });
          break;
        }
        default:
          sendResponse({ ok: false });
      }
    })();

    return true;
  });

  // Auto-init: load settings & check if current domain is in autoTranslateDomains
  (async function init() {
    await refreshStateFromStorage();
    const host = location.hostname.toLowerCase();
    const excluded = (settings.excludedDomains || []).some((d) => host === d || host.endsWith('.' + d));
    const autoOn = (settings.autoTranslateDomains || []).some((d) => host === d || host.endsWith('.' + d));
    if (autoOn && !excluded) {
      startPageTranslation();
    }
  })();
})();
