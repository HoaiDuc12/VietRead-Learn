import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(import.meta.dirname, '..');

require(path.join(ROOT, 'src', 'shared', 'constants.js'));
const vocabFilter = require(path.join(ROOT, 'src', 'shared', 'vocab-filter.js'));
const srs = require(path.join(ROOT, 'src', 'shared', 'srs.js'));

test('manifest.json is valid MV3 and all referenced files exist', () => {
  const manifestPath = path.join(ROOT, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.name);
  assert.ok(manifest.background?.service_worker);

  const filesToCheck = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action.default_icon || {}),
    ...(manifest.content_scripts || []).flatMap((cs) => [...(cs.js || []), ...(cs.css || [])]),
  ];

  for (const rel of filesToCheck) {
    const abs = path.join(ROOT, rel);
    assert.ok(fs.existsSync(abs), `Referenced file missing: ${rel}`);
  }
});

test('vocabFilter detects Vietnamese vs English text accurately', () => {
  assert.equal(vocabFilter.isAlreadyVietnamese('Học từ vựng tiếng Anh hiệu quả khi đọc báo hàng ngày.'), true);
  assert.equal(vocabFilter.isAlreadyVietnamese('Artificial intelligence is becoming ubiquitous in modern industry.'), false);
  assert.equal(vocabFilter.isLikelyEnglishText('Artificial intelligence is becoming ubiquitous in modern industry.'), true);
  assert.equal(vocabFilter.isLikelyEnglishText('日本語のテキストをベトナム語に翻訳します。'), false);
});

test('vocabFilter lemmatizes inflected basic words and extracts high-value vocabulary', () => {
  assert.equal(vocabFilter.isCommonWord('companies', 'intermediate'), true);
  assert.equal(vocabFilter.isCommonWord('running', 'intermediate'), true);
  assert.equal(vocabFilter.isCommonWord('stopped', 'intermediate'), true);
  assert.equal(vocabFilter.isCommonWord('ubiquitous', 'intermediate'), false);
  assert.equal(vocabFilter.isCommonWord('resilience', 'intermediate'), false);

  const sample = 'Although many companies are making important products, unprecedented resilience and ubiquitous algorithms remain vital in Silicon Valley.';
  const extracted = vocabFilter.extractLearningWords(sample, {
    level: 'intermediate',
    maxWords: 4,
    knownWords: ['algorithms'],
    savedWords: ['resilience'],
  });

  const words = extracted.map((w) => w.word);
  // Saved word prioritized first
  assert.equal(words[0], 'resilience');
  assert.equal(extracted[0].isSaved, true);
  // Known word excluded
  assert.ok(!words.includes('algorithms'));
  // Common words & mid-sentence proper nouns excluded
  assert.ok(!words.includes('companies'));
  assert.ok(!words.includes('important'));
  assert.ok(!words.includes('silicon'));
  // High-value words included
  assert.ok(words.includes('unprecedented'));
  assert.ok(words.includes('ubiquitous'));
});

test('planImmersionSegments embeds English words at exact Unicode boundaries without corrupting partial words', () => {
  const viText = 'Trí tuệ nhân tạo đang trở nên phổ biến khắp nơi và mang lại khả năng phục hồi phi thường cho doanh nghiệp.';
  const wordInfos = [
    { word: 'ubiquitous', displayWord: 'ubiquitous', viMeaning: 'phổ biến khắp nơi', altMeanings: ['phổ biến'], isSaved: false },
    { word: 'resilience', displayWord: 'resilience', viMeaning: 'khả năng phục hồi', altMeanings: ['kiên cường'], isSaved: true },
    { word: 'unprecedented', displayWord: 'unprecedented', viMeaning: 'chưa từng có', altMeanings: [], isSaved: false },
  ];

  const { segments, unmatchedWords } = vocabFilter.planImmersionSegments(viText, wordInfos);
  const mixSegments = segments.filter((s) => s.type === 'mix');

  assert.equal(mixSegments.length, 2);
  assert.equal(mixSegments[0].wordInfo.word, 'ubiquitous');
  assert.equal(mixSegments[0].matchedVi, 'phổ biến khắp nơi');
  assert.equal(mixSegments[1].wordInfo.word, 'resilience');
  assert.equal(mixSegments[1].matchedVi, 'khả năng phục hồi');

  // Unmatched paraphrased word goes cleanly to unmatchedWords strip
  assert.equal(unmatchedWords.length, 1);
  assert.equal(unmatchedWords[0].word, 'unprecedented');

  // Reconstructed text preserves every Vietnamese character outside matches
  const reconstructed = segments.map((s) => (s.type === 'text' ? s.text : s.matchedVi)).join('');
  assert.equal(reconstructed, viText);
});

test('SRS spaced repetition schedules reviews and exports Anki TSV & CSV cleanly', () => {
  const baseTime = 1_700_000_000_000;
  let entry = srs.createVocabEntry({
    word: 'Resilient',
    phonetic: '/rɪˈzɪl.jənt/',
    pos: 'adjective',
    viMeaning: 'kiên cường, dễ phục hồi',
    enDefinition: 'Able to recover quickly from difficulties.',
    contextSentence: 'Teams need to stay resilient under pressure.',
  }, baseTime);

  assert.equal(entry.word, 'resilient');
  assert.equal(entry.status, 'new');
  assert.equal(srs.isDueForReview(entry, baseTime), true);

  // Rating 1 (Again) -> 10 minutes
  const forgotten = srs.reviewVocabEntry(entry, 1, baseTime);
  assert.equal(forgotten.repetitions, 0);
  assert.equal(forgotten.nextReviewAt - baseTime, 10 * 60 * 1000);

  // Rating 3 (Good) repeated -> 1d -> 3d -> >7d -> mastered
  let step = srs.reviewVocabEntry(entry, 3, baseTime);
  assert.equal(step.intervalDays, 1);
  step = srs.reviewVocabEntry(step, 3, baseTime);
  assert.equal(step.intervalDays, 3);
  step = srs.reviewVocabEntry(step, 3, baseTime);
  assert.ok(step.intervalDays >= 7);
  step = srs.reviewVocabEntry(step, 3, baseTime);
  assert.equal(step.status, 'mastered');

  // Export Anki TSV & CSV
  const tsv = srs.exportToAnkiTsv([entry]);
  assert.ok(tsv.includes('Resilient (/rɪˈzɪl.jənt/)\t[adjective] kiên cường, dễ phục hồi'));

  const csv = srs.exportToCsv([entry]);
  assert.ok(csv.startsWith('\uFEFFWord,Phonetic,PartOfSpeech'));
  assert.ok(csv.includes('"kiên cường, dễ phục hồi"'));

  // Streak update
  const s1 = srs.computeStreakUpdate({ streakDays: 0, lastActiveDate: null }, Date.UTC(2026, 10, 24, 12, 0));
  assert.equal(s1.streakDays, 1);
  const s2 = srs.computeStreakUpdate(s1, Date.UTC(2026, 10, 25, 12, 0));
  assert.equal(s2.streakDays, 2);
  const s3 = srs.computeStreakUpdate(s2, Date.UTC(2026, 10, 28, 12, 0));
  assert.equal(s3.streakDays, 1);
});
