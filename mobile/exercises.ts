import { normalizeWord } from './wordIdentity.ts';

export type ExerciseWord = { id: number; word: string; meaning: string };
export type ExerciseDraft = { cardId: number; sentence: string; explanation: string };
export type ExerciseQuestion = ExerciseDraft & { options: ExerciseWord[] };
export type ExerciseAnswer = { selectedId: number; excluded: boolean };

export function eligibleExerciseWords<T extends ExerciseWord>(cards: T[]): T[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = normalizeWord(card.word);
    if (!Number.isSafeInteger(card.id) || card.id <= 0 || card.word.length > 100 ||
        !/^[a-zA-Z]+(?:[ '\u2019-][a-zA-Z]+)*$/.test(card.word.trim()) ||
        !card.meaning.trim() || card.meaning.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(card.meaning) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseExerciseDrafts(value: unknown, words: ExerciseWord[]): ExerciseDraft[] {
  const invalid = () => new Error('AI 练习题格式不符合预期，请重新生成。');
  if (words.length < 4 || words.length > 5 || eligibleExerciseWords(words).length !== words.length ||
      new Set(words.map((word) => word.id)).size !== words.length ||
      !value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).join(',') !== 'questions') throw invalid();
  const questions = (value as { questions: unknown }).questions;
  if (!Array.isArray(questions) || questions.length > words.length) throw invalid();
  const ids = new Set<number>();
  const sentences = new Set<string>();
  return questions.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
    const row = value as Record<string, unknown>;
    if (Object.keys(row).sort().join(',') !== 'cardId,explanation,sentence' ||
        !Number.isSafeInteger(row.cardId) || !words.some((word) => word.id === row.cardId) || ids.has(row.cardId as number) ||
        typeof row.sentence !== 'string' || row.sentence.length > 350 || /[\r\n\u0000-\u001f]/.test(row.sentence) ||
        (row.sentence.match(/_{2,}/g) ?? []).join(',') !== '_____' || !/[a-zA-Z]/.test(row.sentence) ||
        typeof row.explanation !== 'string' || !row.explanation.trim() || row.explanation.length > 500 || /[\u0000-\u001f]/.test(row.explanation)) throw invalid();
    const sentence = row.sentence.trim();
    const key = normalizeWord(sentence);
    if (sentences.has(key)) throw invalid();
    ids.add(row.cardId as number);
    sentences.add(key);
    return { cardId: row.cardId as number, sentence, explanation: row.explanation.trim() };
  });
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function randomExerciseWords<T extends ExerciseWord>(cards: T[], random = Math.random): T[] {
  const eligible = eligibleExerciseWords(cards);
  return eligible.length < 4 ? [] : shuffle(eligible, random).slice(0, 5);
}

export function buildExerciseQuestions(drafts: ExerciseDraft[], words: ExerciseWord[], random = Math.random): ExerciseQuestion[] {
  return parseExerciseDrafts({ questions: drafts }, words).map((draft) => {
    const correct = words.find((word) => word.id === draft.cardId)!;
    const others = shuffle(words.filter((word) => word.id !== draft.cardId), random).slice(0, 3);
    return { ...draft, options: shuffle([correct, ...others], random) };
  });
}

export function gradeExercise(question: ExerciseQuestion, selectedId: number): boolean {
  if (!question.options.some((option) => option.id === selectedId)) throw new Error('请选择当前题目的选项。');
  return selectedId === question.cardId;
}

export function summarizeExercises(questions: ExerciseQuestion[], answers: Record<number, ExerciseAnswer>) {
  let correct = 0;
  let wrong = 0;
  let excluded = 0;
  for (const question of questions) {
    const answer = answers[question.cardId];
    if (!answer) continue;
    if (answer.excluded) excluded++;
    else if (gradeExercise(question, answer.selectedId)) correct++;
    else wrong++;
  }
  return { correct, wrong, excluded, total: correct + wrong };
}

export function exerciseSourcesMatch(sources: (ExerciseWord & { createdAt: number })[], current: (ExerciseWord & { createdAt: number })[]): boolean {
  return sources.every((source) => current.some((card) => card.id === source.id && card.word === source.word && card.meaning === source.meaning && card.createdAt === source.createdAt));
}
