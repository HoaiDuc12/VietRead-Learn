'use strict';

importScripts(
  '/src/shared/constants.js',
  '/src/shared/vocab-filter.js',
  '/src/shared/srs.js',
  '/src/shared/storage.js'
);

const VRL = globalThis.VRL;

// In-memory LRU caches for fast responses within service worker lifetime
const translationMemCache = new Map();
const wordMemCache = new Map();
const MAX_TRANS_CACHE = 800;

function setTransCache(key, val) {
  if (translationMemCache.size >= MAX_TRANS_CACHE) {
    const oldest = translationMemCache.keys().next().value;
    translationMemCache.delete(oldest);
  }
  translationMemCache.set(key, val);
}

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// Primary translator: Google Translate free gtx endpoint
async function translateViaGoogle(text, sourceLang = 'auto', targetLang = 'vi') {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: sourceLang,
    tl: targetLang,
    dt: 't',
    q: text,
  });
  const url = `https://translate.googleapis.com/translate_a/single?${params.toString()}`;
  const res = await fetchWithTimeout(url, 8000);
  if (!res.ok) {
    throw new Error(`Google Translate HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('Unexpected Google Translate response');
  }
  const translatedText = data[0]
    .map((chunk) => (Array.isArray(chunk) && typeof chunk[0] === 'string' ? chunk[0] : ''))
    .join('')
    .trim();
  const detectedLang = typeof data[2] === 'string' ? data[2].toLowerCase() : 'auto';
  return {
    translatedText,
    detectedLang,
    provider: 'google',
  };
}

// Fallback translator: MyMemory free API (only used if Google fails/rate-limits)
async function translateViaMyMemory(text, sourceLang = 'en', targetLang = 'vi') {
  const sl = !sourceLang || sourceLang === 'auto' ? 'en' : sourceLang;
  const params = new URLSearchParams({
    q: text.slice(0, 480),
    langpair: `${sl}|${targetLang}`,
  });
  const url = `https://api.mymemory.translated.net/get?${params.toString()}`;
  const res = await fetchWithTimeout(url, 8000);
  if (!res.ok) {
    throw new Error(`MyMemory HTTP ${res.status}`);
  }
  const data = await res.json();
  const translatedText = data?.responseData?.translatedText || '';
  if (!translatedText) throw new Error('Empty MyMemory response');
  return {
    translatedText,
    detectedLang: sl,
    provider: 'mymemory',
  };
}

async function translateText(text, sourceLang = 'auto', targetLang = 'vi') {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return { translatedText: '', detectedLang: 'unknown', provider: 'none' };
  }

  const cacheKey = `${sourceLang}|${targetLang}|${trimmed}`;
  if (translationMemCache.has(cacheKey)) {
    return translationMemCache.get(cacheKey);
  }

  let result;
  try {
    result = await translateViaGoogle(trimmed, sourceLang, targetLang);
  } catch (err) {
    // Try MyMemory fallback for shorter texts
    try {
      const guessedSrc = VRL.vocabFilter.isLikelyEnglishText(trimmed) ? 'en' : (sourceLang === 'auto' ? 'en' : sourceLang);
      result = await translateViaMyMemory(trimmed, guessedSrc, targetLang);
    } catch (fallbackErr) {
      throw new Error(`Translation failed: ${err.message}; fallback: ${fallbackErr.message}`);
    }
  }

  setTransCache(cacheKey, result);
  return result;
}

// Rich English -> Vietnamese dictionary lookup (Google dt=bd + Free Dictionary API)
async function fetchGoogleWordDict(word) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&dt=bd&q=${encodeURIComponent(word)}`;
  const res = await fetchWithTimeout(url, 6500);
  if (!res.ok) throw new Error(`Google Dict HTTP ${res.status}`);
  const data = await res.json();

  const primary = Array.isArray(data[0])
    ? data[0].map((c) => (Array.isArray(c) ? c[0] || '' : '')).join('').trim()
    : '';

  const altMeanings = [];
  const posGroups = [];
  if (Array.isArray(data[1])) {
    for (const group of data[1]) {
      const pos = typeof group[0] === 'string' ? group[0].toLowerCase() : '';
      const terms = Array.isArray(group[1]) ? group[1].filter((t) => typeof t === 'string') : [];
      if (terms.length > 0) {
        posGroups.push({ pos, terms: terms.slice(0, 5) });
        for (const t of terms.slice(0, 4)) {
          if (t.toLowerCase() !== primary.toLowerCase() && !altMeanings.includes(t)) {
            altMeanings.push(t);
          }
        }
      }
    }
  }

  return {
    viMeaning: primary || (altMeanings[0] || ''),
    altMeanings: altMeanings.slice(0, 6),
    pos: posGroups[0]?.pos || '',
    posGroups: posGroups.slice(0, 3),
  };
}

async function fetchFreeDictionaryEn(word) {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const res = await fetchWithTimeout(url, 5500);
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data) || !data[0]) return null;

  const entry = data[0];
  let phonetic = entry.phonetic || '';
  let audioUrl = '';

  if (Array.isArray(entry.phonetics)) {
    for (const p of entry.phonetics) {
      if (!phonetic && p.text) phonetic = p.text;
      if (!audioUrl && p.audio) {
        audioUrl = p.audio.startsWith('//') ? `https:${p.audio}` : p.audio;
      }
      // Prefer US audio if available
      if (p.audio && /-us\.mp3/i.test(p.audio)) {
        audioUrl = p.audio.startsWith('//') ? `https:${p.audio}` : p.audio;
        if (p.text) phonetic = p.text;
        break;
      }
    }
  }

  let pos = '';
  let enDefinition = '';
  let example = '';
  if (Array.isArray(entry.meanings) && entry.meanings.length > 0) {
    const firstMeaning = entry.meanings[0];
    pos = firstMeaning.partOfSpeech || '';
    if (Array.isArray(firstMeaning.definitions) && firstMeaning.definitions.length > 0) {
      enDefinition = firstMeaning.definitions[0].definition || '';
      for (const m of entry.meanings) {
        for (const d of m.definitions || []) {
          if (d.example) {
            example = d.example;
            break;
          }
        }
        if (example) break;
      }
    }
  }

  return { phonetic, audioUrl, pos, enDefinition, example };
}

async function lookupWord(rawWord, options = {}) {
  const word = String(rawWord || '').trim().toLowerCase().replace(/^[^a-z]+|[^a-z-]+$/g, '');
  if (!word) return null;

  const fullDetails = Boolean(options.fullDetails);

  // Check in-memory cache
  const memHit = wordMemCache.get(word);
  if (memHit && (!fullDetails || memHit._hasFull)) {
    return memHit;
  }

  // Check persistent storage cache
  const persistentCache = await VRL.storage.getWordCache();
  const storedHit = persistentCache[word];
  if (storedHit && (!fullDetails || storedHit._hasFull)) {
    wordMemCache.set(word, storedHit);
    return storedHit;
  }

  // Fetch dictionary data (only call Free Dictionary API when fullDetails is true or we want phonetic/audio)
  const tasks = [fetchGoogleWordDict(word).catch(() => null)];
  if (fullDetails) {
    tasks.push(fetchFreeDictionaryEn(word).catch(() => null));
  }

  const [viData, enData] = await Promise.all(tasks);

  const merged = {
    word,
    displayWord: word,
    viMeaning: viData?.viMeaning || storedHit?.viMeaning || '',
    altMeanings: viData?.altMeanings || storedHit?.altMeanings || [],
    posGroups: viData?.posGroups || storedHit?.posGroups || [],
    pos: enData?.pos || viData?.pos || storedHit?.pos || '',
    phonetic: enData?.phonetic || storedHit?.phonetic || '',
    audioUrl: enData?.audioUrl || storedHit?.audioUrl || '',
    enDefinition: enData?.enDefinition || storedHit?.enDefinition || '',
    example: enData?.example || storedHit?.example || '',
    _hasFull: Boolean(fullDetails || storedHit?._hasFull),
  };

  if (merged.viMeaning || merged.enDefinition) {
    wordMemCache.set(word, merged);
    VRL.storage.putWordCache({ [word]: merged }).catch(() => {});
  }
  return merged;
}

async function lookupWordsBatch(words, fullDetails = false) {
  const unique = Array.from(
    new Set(
      (words || [])
        .map((w) => String(w || '').trim().toLowerCase())
        .filter((w) => w.length >= 2)
    )
  );

  const persistentCache = await VRL.storage.getWordCache();
  const results = {};
  const toFetch = [];

  for (const w of unique) {
    const hit = wordMemCache.get(w) || persistentCache[w];
    if (hit && hit.viMeaning && (!fullDetails || hit._hasFull)) {
      wordMemCache.set(w, hit);
      results[w] = hit;
    } else {
      toFetch.push(w);
    }
  }

  // Fetch missing words with concurrency = 5
  const concurrency = 5;
  let idx = 0;
  const newlyFetched = {};

  async function worker() {
    while (idx < toFetch.length) {
      const currentWord = toFetch[idx++];
      try {
        const viData = await fetchGoogleWordDict(currentWord);
        let enData = null;
        if (fullDetails) {
          enData = await fetchFreeDictionaryEn(currentWord).catch(() => null);
        }
        const merged = {
          word: currentWord,
          displayWord: currentWord,
          viMeaning: viData?.viMeaning || '',
          altMeanings: viData?.altMeanings || [],
          posGroups: viData?.posGroups || [],
          pos: enData?.pos || viData?.pos || '',
          phonetic: enData?.phonetic || '',
          audioUrl: enData?.audioUrl || '',
          enDefinition: enData?.enDefinition || '',
          example: enData?.example || '',
          _hasFull: Boolean(fullDetails),
        };
        if (merged.viMeaning) {
          wordMemCache.set(currentWord, merged);
          newlyFetched[currentWord] = merged;
          results[currentWord] = merged;
        }
      } catch (_err) {
        // Ignore single-word network failures gracefully
      }
    }
  }

  if (toFetch.length > 0) {
    await Promise.all(Array.from({ length: Math.min(concurrency, toFetch.length) }, worker));
    if (Object.keys(newlyFetched).length > 0) {
      VRL.storage.putWordCache(newlyFetched).catch(() => {});
    }
  }

  return results;
}

// Badge showing how many saved words are due for spaced-repetition review
async function refreshDueBadge() {
  try {
    const vocabMap = await VRL.storage.getVocabMap();
    const due = VRL.srs.getDueVocab(vocabMap);
    if (due.length > 0) {
      const text = due.length > 99 ? '99+' : String(due.length);
      chrome.action.setBadgeText({ text });
      chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (_err) {
    // Non-fatal
  }
}

// Ensure content script is injected on tabs that were open before extension load
async function sendMessageToTabWithInjection(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (_err) {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['src/content/content.css'],
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        'src/shared/constants.js',
        'src/shared/vocab-filter.js',
        'src/shared/srs.js',
        'src/shared/storage.js',
        'src/content/content.js',
      ],
    });
    return await chrome.tabs.sendMessage(tabId, message);
  }
}

// Lifecycle: context menus + badge
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'vrl-lookup-selection',
      title: 'Dịch & Học từ "%s" (VietRead Learn)',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: 'vrl-toggle-page',
      title: 'Dịch trang này sang Tiếng Việt (VietRead Learn)',
      contexts: ['page'],
    });
  });
  refreshDueBadge();
});

chrome.runtime.onStartup.addListener(() => {
  refreshDueBadge();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes[VRL.STORAGE_KEYS.VOCAB]) {
    refreshDueBadge();
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;
  if (info.menuItemId === 'vrl-lookup-selection' && info.selectionText) {
    await sendMessageToTabWithInjection(tab.id, {
      type: 'LOOKUP_SELECTION_FROM_MENU',
      text: info.selectionText.trim(),
    }).catch(() => {});
  } else if (info.menuItemId === 'vrl-toggle-page') {
    await sendMessageToTabWithInjection(tab.id, {
      type: 'TOGGLE_PAGE_TRANSLATION',
    }).catch(() => {});
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  if (command === 'toggle-translate') {
    await sendMessageToTabWithInjection(tab.id, { type: 'TOGGLE_PAGE_TRANSLATION' }).catch(() => {});
  } else if (command === 'toggle-blur') {
    await sendMessageToTabWithInjection(tab.id, { type: 'TOGGLE_BLUR_TRANSLATION' }).catch(() => {});
  }
});

// Message router
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return false;

  (async () => {
    switch (msg.type) {
      case 'TRANSLATE_TEXT': {
        const res = await translateText(msg.text, msg.sourceLang || 'auto', msg.targetLang || 'vi');
        sendResponse({ ok: true, data: res });
        break;
      }
      case 'LOOKUP_WORD': {
        const res = await lookupWord(msg.word, { fullDetails: msg.fullDetails !== false });
        sendResponse({ ok: true, data: res });
        break;
      }
      case 'LOOKUP_WORDS_BATCH': {
        const res = await lookupWordsBatch(msg.words || [], Boolean(msg.fullDetails));
        sendResponse({ ok: true, data: res });
        break;
      }
      case 'SAVE_VOCAB': {
        const entry = await VRL.storage.saveVocabWord(msg.payload);
        await refreshDueBadge();
        sendResponse({ ok: true, data: entry });
        break;
      }
      case 'REMOVE_VOCAB': {
        const removed = await VRL.storage.removeVocabWord(msg.word);
        await refreshDueBadge();
        sendResponse({ ok: true, data: removed });
        break;
      }
      case 'MARK_KNOWN_WORD': {
        const list = await VRL.storage.addKnownWord(msg.word);
        sendResponse({ ok: true, data: list });
        break;
      }
      case 'BUMP_PAGE_TRANSLATED': {
        const stats = await VRL.storage.bumpStat('pagesTranslated', 1);
        sendResponse({ ok: true, data: stats });
        break;
      }
      case 'OPEN_REVIEW_PAGE': {
        const url = chrome.runtime.getURL('src/review/review.html');
        await chrome.tabs.create({ url });
        sendResponse({ ok: true });
        break;
      }
      case 'SEND_TO_ACTIVE_TAB': {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id) {
          sendResponse({ ok: false, error: 'No active tab' });
          break;
        }
        const res = await sendMessageToTabWithInjection(tab.id, msg.payload);
        sendResponse({ ok: true, data: res });
        break;
      }
      default:
        sendResponse({ ok: false, error: `Unknown message type: ${msg.type}` });
    }
  })().catch((err) => {
    sendResponse({ ok: false, error: err?.message || String(err) });
  });

  return true; // keep channel open for async response
});
