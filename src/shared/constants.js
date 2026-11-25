(function (root) {
  'use strict';

  const VRL = (root.VRL = root.VRL || {});

  VRL.MODES = {
    BILINGUAL: 'bilingual',   // Song ngữ + highlight từ vựng đáng học
    IMMERSION: 'immersion',   // Dịch sang tiếng Việt, giữ/trộn từ tiếng Anh quan trọng
    VIETNAMESE: 'vietnamese', // Dịch thuần tiếng Việt (hover xem bản gốc)
  };

  VRL.LEVELS = {
    BEGINNER: 'beginner',         // A2+
    INTERMEDIATE: 'intermediate', // B1-B2
    ADVANCED: 'advanced',         // C1+
  };

  VRL.STORAGE_KEYS = {
    SETTINGS: 'vrl_settings',
    VOCAB: 'vrl_vocab_notebook',
    KNOWN_WORDS: 'vrl_known_words',
    WORD_CACHE: 'vrl_word_cache',
    STATS: 'vrl_learning_stats',
  };

  VRL.DEFAULT_SETTINGS = {
    mode: VRL.MODES.BILINGUAL,
    level: VRL.LEVELS.INTERMEDIATE,
    blurTranslation: false,
    showInlineGloss: true,
    vocabDensity: 3, // max target words highlighted/mixed per paragraph
    enableSelectionLookup: true,
    autoTranslateDomains: [],
    excludedDomains: [],
    speechAccent: 'en-US',
    speechRate: 0.95,
  };

  VRL.DEFAULT_STATS = {
    wordsLearnedTotal: 0,
    reviewsCompleted: 0,
    pagesTranslated: 0,
    streakDays: 0,
    lastActiveDate: null,
  };

  VRL.POS_VI_LABELS = {
    noun: 'danh từ',
    verb: 'động từ',
    adjective: 'tính từ',
    adverb: 'trạng từ',
    pronoun: 'đại từ',
    preposition: 'giới từ',
    conjunction: 'liên từ',
    interjection: 'thán từ',
    determiner: 'từ hạn định',
    abbreviation: 'viết tắt',
  };

  // Fallback distractors so quiz works even when user has < 4 saved words
  VRL.QUIZ_FALLBACK_POOL = [
    { word: 'resilient', vi: 'kiên cường, dễ phục hồi' },
    { word: 'ubiquitous', vi: 'phổ biến khắp nơi' },
    { word: 'pragmatic', vi: 'thực tế, thực dụng' },
    { word: 'meticulous', vi: 'tỉ mỉ, kỹ lưỡng' },
    { word: 'eloquent', vi: 'hùng biện, lưu loát' },
    { word: 'ambiguous', vi: 'mơ hồ, đa nghĩa' },
    { word: 'catalyst', vi: 'chất xúc tác, động lực' },
    { word: 'ephemeral', vi: 'ngắn ngủi, phù du' },
  ];

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = VRL;
  }
})(typeof globalThis !== 'undefined' ? globalThis : self);
