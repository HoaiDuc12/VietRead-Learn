(function (root) {
  'use strict';

  const VRL = (root.VRL = root.VRL || {});

  const MINUTE_MS = 60 * 1000;
  const DAY_MS = 24 * 60 * MINUTE_MS;

  // Rating grades: 1 = Quên (Again), 2 = Khó (Hard), 3 = Nhớ (Good), 4 = Rất dễ (Easy)
  function createVocabEntry(payload, now = Date.now()) {
    const word = String(payload.word || '').trim().toLowerCase();
    return {
      word,
      displayWord: String(payload.displayWord || payload.word || word).trim(),
      phonetic: payload.phonetic || '',
      audioUrl: payload.audioUrl || '',
      pos: payload.pos || '',
      viMeaning: String(payload.viMeaning || '').trim(),
      altMeanings: Array.isArray(payload.altMeanings) ? payload.altMeanings.slice(0, 6) : [],
      enDefinition: payload.enDefinition || '',
      example: payload.example || '',
      contextSentence: payload.contextSentence || '',
      sourceUrl: payload.sourceUrl || '',
      sourceTitle: payload.sourceTitle || '',
      note: payload.note || '',
      createdAt: now,
      updatedAt: now,
      // SRS fields (SM-2 inspired)
      repetitions: 0,
      intervalDays: 0,
      easeFactor: 2.5,
      nextReviewAt: now, // Due immediately for initial reinforcement or short review
      lastReviewedAt: null,
      status: 'new', // 'new' | 'learning' | 'mastered'
    };
  }

  function reviewVocabEntry(entry, rating, now = Date.now()) {
    const grade = Math.min(4, Math.max(1, Number(rating) || 3));
    const next = Object.assign({}, entry);

    let reps = Number(next.repetitions) || 0;
    let interval = Number(next.intervalDays) || 0;
    let ef = Number(next.easeFactor) || 2.5;
    let nextReviewAt = now;

    if (grade === 1) {
      // Again: reset streak, review again in 10 minutes
      reps = 0;
      interval = 0;
      ef = Math.max(1.3, ef - 0.2);
      nextReviewAt = now + 10 * MINUTE_MS;
      next.status = 'learning';
    } else if (grade === 2) {
      // Hard: short increment
      reps = Math.max(1, reps);
      interval = interval < 1 ? 0.5 : Math.max(1, Math.round(interval * 1.2 * 10) / 10);
      ef = Math.max(1.3, ef - 0.15);
      nextReviewAt = now + Math.round(interval * DAY_MS);
      next.status = 'learning';
    } else if (grade === 3) {
      // Good
      reps += 1;
      if (reps === 1) interval = 1;
      else if (reps === 2) interval = 3;
      else interval = Math.round(interval * ef);
      nextReviewAt = now + interval * DAY_MS;
      next.status = reps >= 4 && interval >= 14 ? 'mastered' : 'learning';
    } else {
      // Easy
      reps += 1;
      if (reps === 1) interval = 3;
      else if (reps === 2) interval = 7;
      else interval = Math.round(interval * ef * 1.3);
      ef = Math.min(3.0, ef + 0.15);
      nextReviewAt = now + interval * DAY_MS;
      next.status = reps >= 3 && interval >= 10 ? 'mastered' : 'learning';
    }

    next.repetitions = reps;
    next.intervalDays = interval;
    next.easeFactor = Math.round(ef * 100) / 100;
    next.nextReviewAt = nextReviewAt;
    next.lastReviewedAt = now;
    next.updatedAt = now;
    return next;
  }

  function isDueForReview(entry, now = Date.now()) {
    if (!entry) return false;
    return (Number(entry.nextReviewAt) || 0) <= now;
  }

  function getDueVocab(vocabMap, now = Date.now()) {
    return Object.values(vocabMap || {})
      .filter((item) => isDueForReview(item, now))
      .sort((a, b) => (a.nextReviewAt || 0) - (b.nextReviewAt || 0));
  }

  function formatIntervalLabel(rating, entry) {
    const simulated = reviewVocabEntry(entry || createVocabEntry({ word: 'sample' }), rating, 0);
    const diffMs = simulated.nextReviewAt;
    if (diffMs < 60 * MINUTE_MS) {
      return `${Math.max(1, Math.round(diffMs / MINUTE_MS))} phút`;
    }
    if (diffMs < DAY_MS) {
      return `${Math.round(diffMs / (60 * MINUTE_MS))} giờ`;
    }
    const days = Math.round(diffMs / DAY_MS);
    return `${days} ngày`;
  }

  function escapeCsvCell(value) {
    const text = String(value == null ? '' : value).replace(/\r?\n/g, ' ');
    if (/[",\t]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function exportToAnkiTsv(vocabList) {
    const lines = [];
    for (const item of vocabList || []) {
      const front = [item.displayWord || item.word, item.phonetic ? `(${item.phonetic})` : '']
        .filter(Boolean)
        .join(' ');
      const backParts = [
        item.pos ? `[${item.pos}]` : '',
        item.viMeaning || '',
        item.enDefinition ? `— ${item.enDefinition}` : '',
        item.contextSentence ? `| Ví dụ: ${item.contextSentence}` : (item.example ? `| Ví dụ: ${item.example}` : ''),
      ].filter(Boolean);
      const cleanFront = front.replace(/\t|\r?\n/g, ' ').trim();
      const cleanBack = backParts.join(' ').replace(/\t|\r?\n/g, ' ').trim();
      lines.push(`${cleanFront}\t${cleanBack}`);
    }
    return lines.join('\n');
  }

  function exportToCsv(vocabList) {
    const header = ['Word', 'Phonetic', 'PartOfSpeech', 'Vietnamese', 'EnglishDefinition', 'Context', 'Status', 'SourceURL'];
    const rows = [header.join(',')];
    for (const item of vocabList || []) {
      rows.push([
        escapeCsvCell(item.displayWord || item.word),
        escapeCsvCell(item.phonetic),
        escapeCsvCell(item.pos),
        escapeCsvCell(item.viMeaning),
        escapeCsvCell(item.enDefinition),
        escapeCsvCell(item.contextSentence || item.example),
        escapeCsvCell(item.status),
        escapeCsvCell(item.sourceUrl),
      ].join(','));
    }
    return '\uFEFF' + rows.join('\n'); // UTF-8 BOM for Excel Vietnamese compatibility
  }

  function computeStreakUpdate(stats, now = Date.now()) {
    const next = Object.assign({}, stats || {});
    const d = new Date(now);
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (next.lastActiveDate === todayStr) {
      return next;
    }
    if (next.lastActiveDate) {
      const prevParts = next.lastActiveDate.split('-').map(Number);
      const prevDate = new Date(prevParts[0], prevParts[1] - 1, prevParts[2]);
      const currDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const diffDays = Math.round((currDate - prevDate) / DAY_MS);
      next.streakDays = diffDays === 1 ? (Number(next.streakDays) || 0) + 1 : 1;
    } else {
      next.streakDays = 1;
    }
    next.lastActiveDate = todayStr;
    return next;
  }

  VRL.srs = {
    createVocabEntry,
    reviewVocabEntry,
    isDueForReview,
    getDueVocab,
    formatIntervalLabel,
    exportToAnkiTsv,
    exportToCsv,
    computeStreakUpdate,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = VRL.srs;
  }
})(typeof globalThis !== 'undefined' ? globalThis : self);
