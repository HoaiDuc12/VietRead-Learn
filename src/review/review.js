(function () {
  'use strict';

  const VRL = globalThis.VRL;

  let vocabMap = {};
  let knownWords = [];
  let settings = Object.assign({}, VRL.DEFAULT_SETTINGS);
  let stats = Object.assign({}, VRL.DEFAULT_STATS);

  // Flashcard session state
  let fcQueue = [];
  let fcIndex = 0;
  let fcFlipped = false;
  let fcPracticeAll = false;

  // Quiz state
  let quizState = null;

  // Notebook filter state
  let currentFilter = 'all';
  let searchQuery = '';

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

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

  function speakWord(word, audioUrl) {
    const clean = String(word || '').trim();
    if (!clean) return;
    const fallback = () => {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(clean);
        u.lang = settings.speechAccent || 'en-US';
        u.rate = Number(settings.speechRate) || 0.95;
        window.speechSynthesis.speak(u);
      } catch (_e) {}
    };
    if (audioUrl) {
      const a = new Audio(audioUrl);
      a.play().catch(fallback);
    } else {
      fallback();
    }
  }

  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function loadAllData() {
    [vocabMap, knownWords, settings, stats] = await Promise.all([
      VRL.storage.getVocabMap(),
      VRL.storage.getKnownWords(),
      VRL.storage.getSettings(),
      VRL.storage.getStats(),
    ]);
    renderTopStats();
  }

  function renderTopStats() {
    const all = Object.values(vocabMap);
    const due = VRL.srs.getDueVocab(vocabMap);
    const mastered = all.filter((w) => w.status === 'mastered');

    document.getElementById('stTotal').textContent = String(all.length);
    document.getElementById('stDue').textContent = String(due.length);
    document.getElementById('stMastered').textContent = String(mastered.length);
    document.getElementById('stStreak').textContent = `${stats.streakDays || 0} 🔥`;
  }

  // ==================== Tab 1: Flashcards (SRS) ====================
  function buildFlashcardQueue(practiceAll = false) {
    fcPracticeAll = practiceAll;
    const list = practiceAll
      ? Object.values(vocabMap).sort(() => Math.random() - 0.5)
      : VRL.srs.getDueVocab(vocabMap);
    fcQueue = list;
    fcIndex = 0;
    fcFlipped = false;
    renderFlashcards();
  }

  function renderFlashcards() {
    const stage = document.getElementById('flashcardStage');
    const allCount = Object.keys(vocabMap).length;

    if (allCount === 0) {
      stage.innerHTML = `
        <div class="empty-state">
          <div style="font-size:40px;margin-bottom:8px">📚</div>
          <h2>Sổ từ vựng chưa có từ nào</h2>
          <p>Hãy dịch một trang web tiếng Anh, bấm vào các từ được gạch chân và chọn <strong>"Lưu học từ này"</strong> — hoặc thêm từ nhanh ở tab <strong>Sổ từ vựng</strong>!</p>
        </div>
      `;
      return;
    }

    if (fcQueue.length === 0 || fcIndex >= fcQueue.length) {
      stage.innerHTML = `
        <div class="empty-state">
          <div style="font-size:44px;margin-bottom:8px">🎉</div>
          <h2>Tuyệt vời! Bạn đã ôn hết từ đến hạn hôm nay</h2>
          <p style="margin-bottom:16px">Tổng cộng bạn đang lưu <strong>${allCount}</strong> từ trong sổ.</p>
          <button class="btn btn-indigo" id="btnPracticeAll">🔄 Luyện lại toàn bộ ${allCount} từ</button>
        </div>
      `;
      document.getElementById('btnPracticeAll')?.addEventListener('click', () => buildFlashcardQueue(true));
      return;
    }

    const entry = fcQueue[fcIndex];
    const posLabel = VRL.POS_VI_LABELS[entry.pos] ? `${entry.pos} · ${VRL.POS_VI_LABELS[entry.pos]}` : entry.pos;

    stage.innerHTML = `
      <div class="fc-wrap">
        <div class="fc-meta">
          <span>${fcPracticeAll ? 'Chế độ ôn tự do' : 'Từ đến hạn ôn tập (SRS)'}</span>
          <span>Thẻ <strong>${fcIndex + 1} / ${fcQueue.length}</strong></span>
        </div>

        <div class="fc-card" id="fcCard">
          ${posLabel ? `<span class="fc-pos">${escapeHtml(posLabel)}</span>` : ''}
          <div class="fc-word">${escapeHtml(entry.displayWord || entry.word)}</div>
          ${entry.phonetic ? `<div class="fc-phonetic">${escapeHtml(entry.phonetic)}</div>` : ''}
          <button class="btn" id="btnFcSpeak" type="button">🔊 Nghe phát âm (R)</button>

          ${fcFlipped ? `
            <div class="fc-back">
              <div class="fc-vi">${escapeHtml(entry.viMeaning || '(Chưa có nghĩa)')}</div>
              ${entry.altMeanings?.length ? `<div style="text-align:center;font-size:12.5px;color:#64748b;margin-bottom:10px">Nghĩa khác: ${escapeHtml(entry.altMeanings.join(', '))}</div>` : ''}
              ${entry.enDefinition ? `<div class="fc-def"><strong>EN:</strong> ${escapeHtml(entry.enDefinition)}</div>` : ''}
              ${entry.contextSentence ? `<div class="fc-ctx">"${escapeHtml(entry.contextSentence)}"</div>` : (entry.example ? `<div class="fc-ctx">"${escapeHtml(entry.example)}"</div>` : '')}
              ${entry.sourceUrl ? `<a class="fc-source" href="${escapeHtml(entry.sourceUrl)}" target="_blank" rel="noopener">🔗 Xem lại bài đọc: ${escapeHtml(entry.sourceTitle || entry.sourceUrl)}</a>` : ''}
            </div>
          ` : `
            <div class="fc-hint">Nhấn vào thẻ hoặc phím <kbd>Space</kbd> để lật xem nghĩa tiếng Việt</div>
          `}
        </div>

        ${fcFlipped ? `
          <div class="fc-ratings">
            <button class="rate-btn r1" data-rate="1">
              <strong>1 · Quên rồi</strong>
              <span>${escapeHtml(VRL.srs.formatIntervalLabel(1, entry))}</span>
            </button>
            <button class="rate-btn r2" data-rate="2">
              <strong>2 · Hơi khó</strong>
              <span>${escapeHtml(VRL.srs.formatIntervalLabel(2, entry))}</span>
            </button>
            <button class="rate-btn r3" data-rate="3">
              <strong>3 · Nhớ tốt</strong>
              <span>${escapeHtml(VRL.srs.formatIntervalLabel(3, entry))}</span>
            </button>
            <button class="rate-btn r4" data-rate="4">
              <strong>4 · Quá dễ</strong>
              <span>${escapeHtml(VRL.srs.formatIntervalLabel(4, entry))}</span>
            </button>
          </div>
        ` : ''}

        <div class="fc-shortcuts">Phím tắt: <strong>Space</strong> lật thẻ · <strong>R</strong> nghe phát âm · <strong>1–4</strong> đánh giá mức độ nhớ</div>
      </div>
    `;

    document.getElementById('btnFcSpeak')?.addEventListener('click', (e) => {
      e.stopPropagation();
      speakWord(entry.displayWord || entry.word, entry.audioUrl);
    });

    document.getElementById('fcCard')?.addEventListener('click', () => {
      if (!fcFlipped) {
        fcFlipped = true;
        renderFlashcards();
      }
    });

    stage.querySelectorAll('.rate-btn[data-rate]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const rating = Number(btn.getAttribute('data-rate'));
        await handleFlashcardRate(rating);
      });
    });
  }

  async function handleFlashcardRate(rating) {
    const entry = fcQueue[fcIndex];
    if (!entry) return;
    const updated = await VRL.storage.recordVocabReview(entry.word, rating);
    if (updated) vocabMap[entry.word] = updated;
    stats = await VRL.storage.getStats();
    renderTopStats();

    if (rating === 1) {
      // Re-queue forgotten word near end of session
      fcQueue.push(updated || entry);
    }
    fcIndex += 1;
    fcFlipped = false;
    renderFlashcards();
  }

  // ==================== Tab 2: Quiz ====================
  function startQuiz() {
    const dir = document.getElementById('selQuizDir').value;
    const savedList = Object.values(vocabMap).filter((w) => w.viMeaning);
    if (savedList.length === 0) {
      quizState = { empty: true };
      renderQuiz();
      return;
    }

    const picked = [...savedList].sort(() => Math.random() - 0.5).slice(0, Math.min(10, savedList.length));
    const pool = [
      ...savedList.map((w) => ({ word: w.displayWord || w.word, vi: w.viMeaning })),
      ...VRL.QUIZ_FALLBACK_POOL,
    ];

    const questions = picked.map((item) => {
      const prompt = dir === 'en-vi' ? (item.displayWord || item.word) : item.viMeaning;
      const answer = dir === 'en-vi' ? item.viMeaning : (item.displayWord || item.word);
      const used = new Set([answer.toLowerCase()]);
      const distractors = [];
      for (const p of [...pool].sort(() => Math.random() - 0.5)) {
        if (distractors.length >= 3) break;
        const cand = dir === 'en-vi' ? p.vi : p.word;
        if (!used.has(cand.toLowerCase())) {
          used.add(cand.toLowerCase());
          distractors.push(cand);
        }
      }
      const options = [answer, ...distractors].sort(() => Math.random() - 0.5);
      return { item, prompt, answer, options, chosen: null, dir };
    });

    quizState = { questions, index: 0, score: 0, finished: false };
    renderQuiz();
  }

  function renderQuiz() {
    const stage = document.getElementById('quizStage');
    if (!quizState || quizState.empty) {
      stage.innerHTML = `
        <div class="empty-state">
          <div style="font-size:40px;margin-bottom:8px">⚡</div>
          <h2>Chưa có từ vựng để làm trắc nghiệm</h2>
          <p>Hãy lưu ít nhất 1 từ vựng tiếng Anh vào sổ để bắt đầu kiểm tra nhanh.</p>
        </div>
      `;
      return;
    }

    if (quizState.finished) {
      const total = quizState.questions.length;
      const pct = Math.round((quizState.score / total) * 100);
      stage.innerHTML = `
        <div class="quiz-card" style="text-align:center">
          <div style="font-size:46px;margin-bottom:8px">${pct >= 80 ? '🏆' : pct >= 50 ? '👍' : '💪'}</div>
          <h2>Hoàn thành bài trắc nghiệm!</h2>
          <p style="font-size:18px;font-weight:700;color:#059669;margin:10px 0 18px">Bạn trả lời đúng ${quizState.score} / ${total} câu (${pct}%)</p>
          <button class="btn btn-indigo" id="btnRetryQuiz">🔄 Làm bộ đề mới</button>
        </div>
      `;
      document.getElementById('btnRetryQuiz')?.addEventListener('click', startQuiz);
      return;
    }

    const q = quizState.questions[quizState.index];
    stage.innerHTML = `
      <div class="quiz-card">
        <div class="fc-meta">
          <span>Câu <strong>${quizState.index + 1} / ${quizState.questions.length}</strong></span>
          <span>Điểm: <strong>${quizState.score}</strong></span>
        </div>

        <div class="quiz-q">
          <div class="quiz-q-main">${escapeHtml(q.prompt)}</div>
          ${q.dir === 'en-vi' ? `<button class="btn" id="btnQuizSpeak" style="margin-top:6px">🔊 Nghe phát âm</button>` : ''}
          ${q.item.contextSentence && q.dir === 'en-vi' ? `<div style="margin-top:10px;font-size:12.5px;color:#64748b;font-style:italic">"${escapeHtml(q.item.contextSentence)}"</div>` : ''}
        </div>

        <div class="quiz-opts">
          ${q.options.map((opt, idx) => {
            let cls = 'quiz-opt';
            if (q.chosen !== null) {
              if (opt === q.answer) cls += ' correct';
              else if (idx === q.chosen) cls += ' wrong';
            }
            return `<button class="${cls}" data-qidx="${idx}" ${q.chosen !== null ? 'disabled' : ''}>${escapeHtml(opt)}</button>`;
          }).join('')}
        </div>

        ${q.chosen !== null ? `
          <div style="text-align:right;margin-top:16px">
            <button class="btn btn-primary" id="btnQuizNext">${quizState.index + 1 >= quizState.questions.length ? 'Xem kết quả →' : 'Câu tiếp theo →'}</button>
          </div>
        ` : ''}
      </div>
    `;

    document.getElementById('btnQuizSpeak')?.addEventListener('click', () => {
      speakWord(q.item.displayWord || q.item.word, q.item.audioUrl);
    });

    stage.querySelectorAll('.quiz-opt[data-qidx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (q.chosen !== null) return;
        const idx = Number(btn.getAttribute('data-qidx'));
        q.chosen = idx;
        if (q.options[idx] === q.answer) {
          quizState.score += 1;
        }
        renderQuiz();
      });
    });

    document.getElementById('btnQuizNext')?.addEventListener('click', () => {
      if (quizState.index + 1 >= quizState.questions.length) {
        quizState.finished = true;
      } else {
        quizState.index += 1;
      }
      renderQuiz();
    });
  }

  // ==================== Tab 3: Notebook ====================
  function renderNotebook() {
    const listEl = document.getElementById('notebookList');
    const q = searchQuery.trim().toLowerCase();
    const now = Date.now();

    let items = Object.values(vocabMap).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (currentFilter === 'due') {
      items = items.filter((w) => VRL.srs.isDueForReview(w, now));
    } else if (currentFilter !== 'all') {
      items = items.filter((w) => w.status === currentFilter);
    }

    if (q) {
      items = items.filter((w) =>
        (w.word || '').toLowerCase().includes(q) ||
        (w.viMeaning || '').toLowerCase().includes(q) ||
        (w.enDefinition || '').toLowerCase().includes(q)
      );
    }

    if (items.length === 0) {
      listEl.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>Không tìm thấy từ vựng phù hợp</h3><p>Thử đổi bộ lọc hoặc lưu thêm từ mới khi đọc báo tiếng Anh nhé.</p></div>`;
      return;
    }

    const statusBadge = {
      new: '<span class="badge badge-new">Mới</span>',
      learning: '<span class="badge badge-learning">Đang học</span>',
      mastered: '<span class="badge badge-mastered">Đã thuộc</span>',
    };

    listEl.innerHTML = items.map((w) => {
      const nextDate = w.nextReviewAt <= now
        ? 'Đến hạn ôn ngay'
        : `Ôn lại: ${new Date(w.nextReviewAt).toLocaleDateString('vi-VN')}`;
      return `
        <article class="vocab-item" data-word="${escapeHtml(w.word)}">
          <div class="vi-head">
            <div>
              <span class="vi-word">${escapeHtml(w.displayWord || w.word)}</span>
              ${w.phonetic ? `<span class="vi-phonetic">${escapeHtml(w.phonetic)}</span>` : ''}
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              ${statusBadge[w.status] || ''}
              <button class="btn" data-nact="speak" data-word="${escapeHtml(w.word)}" style="padding:4px 8px">🔊</button>
              <button class="btn btn-danger" data-nact="delete" data-word="${escapeHtml(w.word)}" style="padding:4px 8px" title="Xóa từ này">🗑</button>
            </div>
          </div>
          <div class="vi-meaning">${escapeHtml(w.viMeaning || '(Chưa có nghĩa)')}</div>
          ${w.enDefinition ? `<div class="vi-def">${escapeHtml(w.enDefinition)}</div>` : ''}
          ${w.contextSentence ? `<div class="vi-ctx">"${escapeHtml(w.contextSentence)}"</div>` : ''}
          <div class="vi-footer">
            <span>${escapeHtml(nextDate)} · Lần ôn: ${w.repetitions || 0}</span>
            ${w.sourceUrl ? `<a class="fc-source" href="${escapeHtml(w.sourceUrl)}" target="_blank" rel="noopener">Nguồn ↗</a>` : ''}
          </div>
        </article>
      `;
    }).join('');
  }

  // ==================== Tab 4: Settings & Known Words ====================
  function renderSettingsTab() {
    document.getElementById('selAccent').value = settings.speechAccent || 'en-US';
    document.getElementById('rngRate').value = String(settings.speechRate || 0.95);
    document.getElementById('lblRate').textContent = `${Number(settings.speechRate || 0.95).toFixed(2)}x`;

    const domainsEl = document.getElementById('autoDomainsList');
    const domains = settings.autoTranslateDomains || [];
    domainsEl.innerHTML = domains.length === 0
      ? '<span class="muted">Chưa có tên miền nào. Bạn có thể bật trong popup khi truy cập trang web.</span>'
      : domains.map((d) => `<span class="tag">${escapeHtml(d)} <button data-rm-domain="${escapeHtml(d)}">✕</button></span>`).join('');

    document.getElementById('knownCount').textContent = String(knownWords.length);
    const knownEl = document.getElementById('knownWordsList');
    knownEl.innerHTML = knownWords.length === 0
      ? '<span class="muted">Chưa có từ nào được đánh dấu "Đã biết".</span>'
      : [...knownWords].sort().map((w) => `<span class="tag">${escapeHtml(w)} <button data-rm-known="${escapeHtml(w)}">✕</button></span>`).join('');
  }

  // ==================== Event Bindings ====================
  document.getElementById('mainTabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab[data-tab]');
    if (!tab) return;
    const target = tab.getAttribute('data-tab');
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${target}`));

    if (target === 'flashcard') buildFlashcardQueue(false);
    else if (target === 'quiz') startQuiz();
    else if (target === 'notebook') renderNotebook();
    else if (target === 'settings') renderSettingsTab();
  });

  // Keyboard shortcuts for Flashcard tab
  document.addEventListener('keydown', (e) => {
    const fcPanel = document.getElementById('panel-flashcard');
    if (!fcPanel.classList.contains('active')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (fcQueue.length === 0 || fcIndex >= fcQueue.length) return;

    const entry = fcQueue[fcIndex];
    if (e.code === 'Space') {
      e.preventDefault();
      if (!fcFlipped) {
        fcFlipped = true;
        renderFlashcards();
      }
    } else if (e.key.toLowerCase() === 'r') {
      speakWord(entry.displayWord || entry.word, entry.audioUrl);
    } else if (fcFlipped && ['1', '2', '3', '4'].includes(e.key)) {
      handleFlashcardRate(Number(e.key));
    }
  });

  // Quiz controls
  document.getElementById('btnStartQuiz').addEventListener('click', startQuiz);
  document.getElementById('selQuizDir').addEventListener('change', startQuiz);

  // Add new word manually
  document.getElementById('addWordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('inputNewWord');
    const word = input.value.trim();
    if (!word) return;
    const btn = document.getElementById('btnAddWord');
    btn.disabled = true;
    btn.textContent = 'Đang tra...';
    try {
      const info = await sendBg({ type: 'LOOKUP_WORD', word, fullDetails: true });
      if (!info || !info.viMeaning) {
        showToast(`Không tìm thấy nghĩa cho "${word}".`);
      } else {
        const saved = await sendBg({ type: 'SAVE_VOCAB', payload: info });
        vocabMap[saved.word] = saved;
        input.value = '';
        renderTopStats();
        renderNotebook();
        showToast(`Đã lưu "${saved.displayWord}" — ${saved.viMeaning}`);
      }
    } catch (err) {
      showToast(`Lỗi tra từ: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = '+ Tra & Lưu';
    }
  });

  // Notebook search, filters & item actions
  document.getElementById('inputSearch').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderNotebook();
  });

  document.getElementById('filterPills').addEventListener('click', (e) => {
    const pill = e.target.closest('.filter-pill[data-filter]');
    if (!pill) return;
    currentFilter = pill.getAttribute('data-filter');
    document.querySelectorAll('.filter-pill').forEach((p) => p.classList.toggle('active', p === pill));
    renderNotebook();
  });

  document.getElementById('notebookList').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-nact]');
    if (!btn) return;
    const act = btn.getAttribute('data-nact');
    const word = btn.getAttribute('data-word');
    if (act === 'speak') {
      const item = vocabMap[word];
      speakWord(item?.displayWord || word, item?.audioUrl);
    } else if (act === 'delete') {
      await sendBg({ type: 'REMOVE_VOCAB', word });
      delete vocabMap[word];
      renderTopStats();
      renderNotebook();
      showToast(`Đã xóa "${word}" khỏi sổ từ.`);
    }
  });

  // Export & Import
  document.getElementById('btnExportAnki').addEventListener('click', () => {
    const list = Object.values(vocabMap);
    if (list.length === 0) return showToast('Sổ từ đang trống!');
    downloadFile('vietread-anki.tsv', VRL.srs.exportToAnkiTsv(list), 'text/tab-separated-values;charset=utf-8');
    showToast(`Đã xuất ${list.length} từ định dạng Anki (.tsv)`);
  });

  document.getElementById('btnExportCsv').addEventListener('click', () => {
    const list = Object.values(vocabMap);
    if (list.length === 0) return showToast('Sổ từ đang trống!');
    downloadFile('vietread-vocab.csv', VRL.srs.exportToCsv(list), 'text/csv;charset=utf-8');
    showToast(`Đã xuất ${list.length} từ định dạng CSV`);
  });

  document.getElementById('btnExportJson').addEventListener('click', () => {
    const list = Object.values(vocabMap);
    downloadFile('vietread-backup.json', JSON.stringify(list, null, 2), 'application/json;charset=utf-8');
    showToast(`Đã sao lưu ${list.length} từ ra file JSON`);
  });

  document.getElementById('fileImportJson').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const entries = Array.isArray(parsed) ? parsed : Object.values(parsed || {});
      const res = await VRL.storage.importVocabEntries(entries);
      await loadAllData();
      renderNotebook();
      showToast(`Nhập thành công! Thêm mới ${res.added} từ (tổng ${res.total} từ).`);
    } catch (err) {
      showToast(`File JSON không hợp lệ: ${err.message}`);
    } finally {
      e.target.value = '';
    }
  });

  // Settings actions
  document.getElementById('selAccent').addEventListener('change', async (e) => {
    settings = await VRL.storage.updateSettings({ speechAccent: e.target.value });
    showToast('Đã cập nhật giọng đọc');
  });

  document.getElementById('rngRate').addEventListener('input', (e) => {
    document.getElementById('lblRate').textContent = `${Number(e.target.value).toFixed(2)}x`;
  });
  document.getElementById('rngRate').addEventListener('change', async (e) => {
    settings = await VRL.storage.updateSettings({ speechRate: Number(e.target.value) });
    showToast('Đã lưu tốc độ phát âm');
  });

  document.getElementById('autoDomainsList').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-rm-domain]');
    if (!btn) return;
    const domain = btn.getAttribute('data-rm-domain');
    const next = (settings.autoTranslateDomains || []).filter((d) => d !== domain);
    settings = await VRL.storage.updateSettings({ autoTranslateDomains: next });
    renderSettingsTab();
    showToast(`Đã bỏ tự động dịch cho ${domain}`);
  });

  document.getElementById('knownWordsList').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-rm-known]');
    if (!btn) return;
    const word = btn.getAttribute('data-rm-known');
    knownWords = await VRL.storage.removeKnownWord(word);
    renderSettingsTab();
    showToast(`Đã bỏ "${word}" khỏi danh sách đã biết`);
  });

  // Init
  (async function init() {
    await loadAllData();
    buildFlashcardQueue(false);
  })();
})();
