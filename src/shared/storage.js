(function (root) {
  'use strict';

  const VRL = (root.VRL = root.VRL || {});

  function getArea() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return chrome.storage.local;
    }
    return null;
  }

  async function storageGet(keys) {
    const area = getArea();
    if (!area) return {};
    return new Promise((resolve) => {
      area.get(keys, (res) => resolve(res || {}));
    });
  }

  async function storageSet(items) {
    const area = getArea();
    if (!area) return;
    return new Promise((resolve) => {
      area.set(items, () => resolve());
    });
  }

  async function getSettings() {
    const key = VRL.STORAGE_KEYS.SETTINGS;
    const data = await storageGet([key]);
    return Object.assign({}, VRL.DEFAULT_SETTINGS, data[key] || {});
  }

  async function updateSettings(partial) {
    const current = await getSettings();
    const merged = Object.assign({}, current, partial || {});
    await storageSet({ [VRL.STORAGE_KEYS.SETTINGS]: merged });
    return merged;
  }

  async function getVocabMap() {
    const key = VRL.STORAGE_KEYS.VOCAB;
    const data = await storageGet([key]);
    return data[key] && typeof data[key] === 'object' ? data[key] : {};
  }

  async function saveVocabWord(payload) {
    const map = await getVocabMap();
    const normalized = String(payload.word || '').trim().toLowerCase();
    if (!normalized) return null;

    const existing = map[normalized];
    let entry;
    if (existing) {
      entry = Object.assign({}, existing, {
        displayWord: payload.displayWord || existing.displayWord,
        phonetic: payload.phonetic || existing.phonetic,
        audioUrl: payload.audioUrl || existing.audioUrl,
        pos: payload.pos || existing.pos,
        viMeaning: payload.viMeaning || existing.viMeaning,
        altMeanings: (payload.altMeanings && payload.altMeanings.length) ? payload.altMeanings : existing.altMeanings,
        enDefinition: payload.enDefinition || existing.enDefinition,
        example: payload.example || existing.example,
        contextSentence: payload.contextSentence || existing.contextSentence,
        sourceUrl: payload.sourceUrl || existing.sourceUrl,
        sourceTitle: payload.sourceTitle || existing.sourceTitle,
        note: payload.note !== undefined ? payload.note : existing.note,
        updatedAt: Date.now(),
      });
    } else {
      entry = VRL.srs.createVocabEntry(payload);
    }

    map[normalized] = entry;
    await storageSet({ [VRL.STORAGE_KEYS.VOCAB]: map });

    // Also remove from known words if re-saved
    await removeKnownWord(normalized);

    if (!existing) {
      await bumpStat('wordsLearnedTotal', 1);
    }
    return entry;
  }

  async function removeVocabWord(word) {
    const normalized = String(word || '').trim().toLowerCase();
    const map = await getVocabMap();
    if (map[normalized]) {
      delete map[normalized];
      await storageSet({ [VRL.STORAGE_KEYS.VOCAB]: map });
      return true;
    }
    return false;
  }

  async function recordVocabReview(word, rating) {
    const normalized = String(word || '').trim().toLowerCase();
    const map = await getVocabMap();
    if (!map[normalized]) return null;
    const updated = VRL.srs.reviewVocabEntry(map[normalized], rating);
    map[normalized] = updated;
    await storageSet({ [VRL.STORAGE_KEYS.VOCAB]: map });
    await bumpStat('reviewsCompleted', 1);
    return updated;
  }

  async function importVocabEntries(entries) {
    const map = await getVocabMap();
    let added = 0;
    for (const raw of entries || []) {
      const w = String(raw.word || '').trim().toLowerCase();
      if (!w) continue;
      if (!map[w]) {
        map[w] = VRL.srs.createVocabEntry(raw);
        added++;
      } else {
        map[w] = Object.assign({}, map[w], raw, { word: w, updatedAt: Date.now() });
      }
    }
    await storageSet({ [VRL.STORAGE_KEYS.VOCAB]: map });
    return { added, total: Object.keys(map).length };
  }

  async function getKnownWords() {
    const key = VRL.STORAGE_KEYS.KNOWN_WORDS;
    const data = await storageGet([key]);
    return Array.isArray(data[key]) ? data[key] : [];
  }

  async function addKnownWord(word) {
    const normalized = String(word || '').trim().toLowerCase();
    if (!normalized) return [];
    const list = await getKnownWords();
    if (!list.includes(normalized)) {
      list.push(normalized);
      await storageSet({ [VRL.STORAGE_KEYS.KNOWN_WORDS]: list });
    }
    return list;
  }

  async function removeKnownWord(word) {
    const normalized = String(word || '').trim().toLowerCase();
    const list = await getKnownWords();
    const filtered = list.filter((item) => item !== normalized);
    if (filtered.length !== list.length) {
      await storageSet({ [VRL.STORAGE_KEYS.KNOWN_WORDS]: filtered });
    }
    return filtered;
  }

  async function getStats() {
    const key = VRL.STORAGE_KEYS.STATS;
    const data = await storageGet([key]);
    return Object.assign({}, VRL.DEFAULT_STATS, data[key] || {});
  }

  async function bumpStat(field, delta = 1) {
    const current = await getStats();
    const updated = VRL.srs.computeStreakUpdate(current);
    updated[field] = (Number(updated[field]) || 0) + delta;
    await storageSet({ [VRL.STORAGE_KEYS.STATS]: updated });
    return updated;
  }

  // LRU persistent word dictionary cache (max 1500 entries)
  async function getWordCache() {
    const key = VRL.STORAGE_KEYS.WORD_CACHE;
    const data = await storageGet([key]);
    return data[key] && typeof data[key] === 'object' ? data[key] : {};
  }

  async function putWordCache(entriesObj) {
    const cache = await getWordCache();
    const now = Date.now();
    for (const [k, v] of Object.entries(entriesObj || {})) {
      cache[k.toLowerCase()] = Object.assign({}, v, { _ts: now });
    }
    const keys = Object.keys(cache);
    if (keys.length > 1500) {
      keys.sort((a, b) => (cache[a]._ts || 0) - (cache[b]._ts || 0));
      const toRemove = keys.slice(0, keys.length - 1200);
      for (const rm of toRemove) delete cache[rm];
    }
    await storageSet({ [VRL.STORAGE_KEYS.WORD_CACHE]: cache });
  }

  VRL.storage = {
    getSettings,
    updateSettings,
    getVocabMap,
    saveVocabWord,
    removeVocabWord,
    recordVocabReview,
    importVocabEntries,
    getKnownWords,
    addKnownWord,
    removeKnownWord,
    getStats,
    bumpStat,
    getWordCache,
    putWordCache,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = VRL.storage;
  }
})(typeof globalThis !== 'undefined' ? globalThis : self);
