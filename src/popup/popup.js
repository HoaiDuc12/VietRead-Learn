(function () {
  'use strict';

  const VRL = globalThis.VRL;

  const els = {
    siteHost: document.getElementById('siteHost'),
    pageStatusBadge: document.getElementById('pageStatusBadge'),
    btnToggleTranslate: document.getElementById('btnToggleTranslate'),
    btnToggleIcon: document.getElementById('btnToggleIcon'),
    btnToggleLabel: document.getElementById('btnToggleLabel'),
    btnAutoDomain: document.getElementById('btnAutoDomain'),
    btnPageVocab: document.getElementById('btnPageVocab'),
    pageVocabCount: document.getElementById('pageVocabCount'),
    statusHint: document.getElementById('statusHint'),
    modeGrid: document.getElementById('modeGrid'),
    chkBlurTranslation: document.getElementById('chkBlurTranslation'),
    chkInlineGloss: document.getElementById('chkInlineGloss'),
    chkSelectionLookup: document.getElementById('chkSelectionLookup'),
    selLevel: document.getElementById('selLevel'),
    selDensity: document.getElementById('selDensity'),
    statSaved: document.getElementById('statSaved'),
    statDue: document.getElementById('statDue'),
    statStreak: document.getElementById('statStreak'),
    btnOpenReview: document.getElementById('btnOpenReview'),
    btnOpenReviewTop: document.getElementById('btnOpenReviewTop'),
  };

  let currentSettings = Object.assign({}, VRL.DEFAULT_SETTINGS);
  let currentTab = null;
  let currentHost = '';
  let pageState = { isTranslating: false, detectedLang: null, pageVocabCount: 0 };

  function sendBg(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!res || !res.ok) {
          reject(new Error(res?.error || 'Request failed'));
          return;
        }
        resolve(res.data);
      });
    });
  }

  function isTranslatableUrl(url) {
    return typeof url === 'string' && /^https?:\/\//i.test(url);
  }

  function renderSettingsUI() {
    const cards = els.modeGrid.querySelectorAll('.mode-card');
    for (const card of cards) {
      card.classList.toggle('active', card.getAttribute('data-mode') === currentSettings.mode);
    }

    els.chkBlurTranslation.checked = Boolean(currentSettings.blurTranslation);
    els.chkInlineGloss.checked = Boolean(currentSettings.showInlineGloss);
    els.chkSelectionLookup.checked = Boolean(currentSettings.enableSelectionLookup);
    els.selLevel.value = currentSettings.level || VRL.LEVELS.INTERMEDIATE;
    els.selDensity.value = String(currentSettings.vocabDensity || 3);

    const autoOn = Boolean(
      currentHost && (currentSettings.autoTranslateDomains || []).includes(currentHost)
    );
    els.btnAutoDomain.classList.toggle('on', autoOn);
    els.btnAutoDomain.textContent = autoOn ? '⚡ Đang tự dịch trang này' : '⚡ Tự động dịch trang này';
  }

  function renderPageStatusUI() {
    if (!currentTab || !isTranslatableUrl(currentTab.url)) {
      els.siteHost.textContent = 'Trang hệ thống trình duyệt';
      els.pageStatusBadge.textContent = 'Không hỗ trợ';
      els.pageStatusBadge.classList.remove('active');
      els.btnToggleTranslate.disabled = true;
      els.btnAutoDomain.disabled = true;
      els.btnPageVocab.disabled = true;
      els.statusHint.textContent = 'Hãy mở một trang web (http/https) để bắt đầu dịch và học từ.';
      return;
    }

    els.siteHost.textContent = currentHost || currentTab.url;
    els.btnToggleTranslate.disabled = false;
    els.btnAutoDomain.disabled = false;
    els.btnPageVocab.disabled = false;
    els.statusHint.textContent = '';

    if (pageState.isTranslating) {
      const langTxt = pageState.detectedLang ? `${pageState.detectedLang.toUpperCase()} → VI` : 'Đang dịch';
      els.pageStatusBadge.textContent = `● ${langTxt}`;
      els.pageStatusBadge.classList.add('active');
      els.btnToggleTranslate.classList.add('stop');
      els.btnToggleIcon.textContent = '↩️';
      els.btnToggleLabel.textContent = 'Hiển thị lại bản gốc';
    } else {
      els.pageStatusBadge.textContent = 'Chưa dịch';
      els.pageStatusBadge.classList.remove('active');
      els.btnToggleTranslate.classList.remove('stop');
      els.btnToggleIcon.textContent = '🌐';
      els.btnToggleLabel.textContent = 'Dịch trang này sang Tiếng Việt';
    }

    els.pageVocabCount.textContent = String(pageState.pageVocabCount || 0);
  }

  async function renderStatsUI() {
    const [vocabMap, stats] = await Promise.all([
      VRL.storage.getVocabMap(),
      VRL.storage.getStats(),
    ]);
    const total = Object.keys(vocabMap).length;
    const due = VRL.srs.getDueVocab(vocabMap).length;

    els.statSaved.textContent = String(total);
    els.statDue.textContent = String(due);
    els.statStreak.textContent = `${stats.streakDays || 0} 🔥`;

    if (due > 0) {
      els.btnOpenReview.textContent = `🧠 Ôn ngay ${due} từ đến hạn!`;
    } else {
      els.btnOpenReview.textContent = '🧠 Mở Sổ Từ & Flashcard';
    }
  }

  async function queryCurrentPageStatus() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab || null;
    if (currentTab && isTranslatableUrl(currentTab.url)) {
      try {
        currentHost = new URL(currentTab.url).hostname.toLowerCase();
      } catch (_e) {
        currentHost = '';
      }
      try {
        const res = await chrome.tabs.sendMessage(currentTab.id, { type: 'GET_PAGE_STATUS' });
        if (res) pageState = res;
      } catch (_err) {
        // Content script not injected yet on pre-existing tab
        pageState = { isTranslating: false, detectedLang: null, pageVocabCount: 0 };
      }
    }
    renderPageStatusUI();
    renderSettingsUI();
  }

  // Event listeners
  els.btnToggleTranslate.addEventListener('click', async () => {
    if (!currentTab || !isTranslatableUrl(currentTab.url)) return;
    els.btnToggleTranslate.disabled = true;
    try {
      const res = await sendBg({
        type: 'SEND_TO_ACTIVE_TAB',
        payload: { type: 'TOGGLE_PAGE_TRANSLATION' },
      });
      pageState.isTranslating = Boolean(res?.isTranslating);
      renderPageStatusUI();
    } catch (err) {
      els.statusHint.textContent = `Không thể thao tác trên trang này: ${err.message}`;
    } finally {
      els.btnToggleTranslate.disabled = false;
    }
  });

  els.btnPageVocab.addEventListener('click', async () => {
    if (!currentTab || !isTranslatableUrl(currentTab.url)) return;
    try {
      await sendBg({
        type: 'SEND_TO_ACTIVE_TAB',
        payload: { type: 'OPEN_PAGE_DRAWER', tab: 'words' },
      });
      window.close();
    } catch (err) {
      els.statusHint.textContent = `Không thể mở bảng từ: ${err.message}`;
    }
  });

  els.btnAutoDomain.addEventListener('click', async () => {
    if (!currentHost) return;
    const list = new Set(currentSettings.autoTranslateDomains || []);
    if (list.has(currentHost)) {
      list.delete(currentHost);
    } else {
      list.add(currentHost);
    }
    currentSettings = await VRL.storage.updateSettings({
      autoTranslateDomains: Array.from(list),
    });
    renderSettingsUI();
  });

  els.modeGrid.addEventListener('click', async (e) => {
    const card = e.target.closest('.mode-card[data-mode]');
    if (!card) return;
    const mode = card.getAttribute('data-mode');
    currentSettings = await VRL.storage.updateSettings({ mode });
    renderSettingsUI();
  });

  els.chkBlurTranslation.addEventListener('change', async () => {
    currentSettings = await VRL.storage.updateSettings({
      blurTranslation: els.chkBlurTranslation.checked,
    });
  });

  els.chkInlineGloss.addEventListener('change', async () => {
    currentSettings = await VRL.storage.updateSettings({
      showInlineGloss: els.chkInlineGloss.checked,
    });
  });

  els.chkSelectionLookup.addEventListener('change', async () => {
    currentSettings = await VRL.storage.updateSettings({
      enableSelectionLookup: els.chkSelectionLookup.checked,
    });
  });

  els.selLevel.addEventListener('change', async () => {
    currentSettings = await VRL.storage.updateSettings({
      level: els.selLevel.value,
    });
  });

  els.selDensity.addEventListener('change', async () => {
    currentSettings = await VRL.storage.updateSettings({
      vocabDensity: Number(els.selDensity.value) || 3,
    });
  });

  function openReviewTab() {
    sendBg({ type: 'OPEN_REVIEW_PAGE' }).catch(() => {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/review/review.html') });
    });
  }

  els.btnOpenReview.addEventListener('click', openReviewTab);
  els.btnOpenReviewTop.addEventListener('click', openReviewTab);

  // Init
  (async function init() {
    currentSettings = await VRL.storage.getSettings();
    await Promise.all([queryCurrentPageStatus(), renderStatsUI()]);
  })();
})();
