import { describe, expect, it } from 'vitest';
import raw from '../config/test.ru.json';
import { configSchema, scaleIds } from '../packages/core/src/index';
import {
  validateWrittenAnswers,
  writtenProfile,
  InsufficientAnswersError,
} from '../packages/core/src/written';
import { reportFor, writtenAnswer } from './fixtures/written';
const c = configSchema.parse(raw);
it('новая методика: 15 открытых вопросов, четыре вклада на шкалу, без инверсии', () => {
  expect(c.responseFormat).toBe('written');
  expect(c.questions).toHaveLength(15);
  expect(c.questions.every((q) => !q.reverse)).toBe(true);
  for (const scale of scaleIds)
    expect(c.questions.filter((q) => q.scales.includes(scale))).toHaveLength(4);
  expect(
    configSchema.safeParse({
      ...c,
      questions: c.questions.map((q, i) => ({ ...q, reverse: i === 0 })),
    }).success,
  ).toBe(false);
});
it('сохраняет черновик даже короче минимума, но требует содержательные полные ответы', () => {
  expect(() => validateWrittenAnswers({ '1': '' }, c, false)).not.toThrow();
  expect(() => validateWrittenAnswers({}, c)).toThrow('каждый');
  expect(() => validateWrittenAnswers({ '1': 'а'.repeat(2001) }, c, false)).toThrow('2000');
  expect(() => validateWrittenAnswers({ '99': writtenAnswer }, c, false)).toThrow();
  expect(() => validateWrittenAnswers({ '1': 5 } as any, c, false)).toThrow();
  const answers = Object.fromEntries(c.questions.map((q) => [q.id, writtenAnswer]));
  expect(() => validateWrittenAnswers(answers, c)).not.toThrow();
  answers['15'] = ' '.repeat(40);
  expect(() => validateWrittenAnswers(answers, c)).toThrow();
});
describe('подсчёт по оценкам действий, без инверсии', () => {
  it.each([
    [1, 0],
    [4, 50],
    [7, 100],
  ])('%i → %i%%', (value, percent) => {
    const result = writtenProfile(reportFor(c, value), c);
    expect(result.percentages).toEqual(Object.fromEntries(scaleIds.map((s) => [s, percent])));
    expect(result.strong.length).toBeGreaterThan(0);
    expect(result.growth.length).toBeGreaterThan(0);
    expect(result.qualityFlags).toEqual([]);
  });
  it('комплексный вопрос оценивается отдельно по двум качествам', () => {
    const report = reportFor(c);
    report.ratings.find((r) => r.questionId === '15' && r.scale === 'critical')!.value = 7;
    report.ratings.find((r) => r.questionId === '15' && r.scale === 'confidence')!.value = 1;
    expect(writtenProfile(report, c).percentages).toEqual({
      critical: 63,
      confidence: 38,
      discipline: 50,
      engagement: 50,
    });
    report.limitedEvidence = true;
    expect(writtenProfile(report, c).qualityFlags).toEqual(['limited_evidence']);
  });
  it('недостаток данных требует уточнения и не превращается в ноль', () => {
    const report = reportFor(c);
    report.ratings.filter((r) => r.questionId === '15').forEach((r) => (r.value = null));
    try {
      writtenProfile(report, c);
      throw Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientAnswersError);
      expect((error as InsufficientAnswersError).questionIds).toEqual(['15']);
    }
  });
  it.each(['duplicate', 'unknown', 'scales', 'range'])(
    'отклоняет недостоверный ответ модели: %s',
    (kind) => {
      const report = reportFor(c);
      if (kind === 'duplicate') report.ratings[0] = { ...report.ratings[1] };
      if (kind === 'unknown') report.ratings[0].questionId = '99';
      if (kind === 'scales') report.scales[0] = { ...report.scales[1] };
      if (kind === 'range') report.ratings[0].value = 101;
      expect(() => writtenProfile(report, c)).toThrow();
    },
  );
});
