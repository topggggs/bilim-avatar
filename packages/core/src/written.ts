import { z } from 'zod';
import { scaleIds, profileFromScores, type Scores, type TestConfig } from './index.js';
export type WrittenAnswers = Record<string, string>;
export const MIN_ANSWER_LENGTH = 30;
export const MAX_ANSWER_LENGTH = 2000;
export function validateWrittenAnswers(answers: WrittenAnswers, c: TestConfig, complete = true) {
  const ids = new Set(c.questions.map((q) => q.id));
  if (
    Object.entries(answers).some(
      ([id, text]) => !ids.has(id) || typeof text !== 'string' || text.length > MAX_ANSWER_LENGTH,
    )
  )
    throw new Error('Проверьте номера вопросов и длину ответов (до 2000 символов)');
  if (complete && c.questions.some((q) => (answers[q.id]?.trim().length ?? 0) < MIN_ANSWER_LENGTH))
    throw new Error('Ответьте на каждый вопрос: не менее 30 символов');
}
export const analysisSchema = z
  .object({
    summary: z.string().min(10).max(600),
    scales: z
      .array(
        z
          .object({
            scale: z.enum(scaleIds),
            explanation: z.string().min(10).max(400),
          })
          .strict(),
      )
      .length(4),
    ratings: z
      .array(
        z
          .object({
            questionId: z.string().regex(/^\d+$/),
            scale: z.enum(scaleIds),
            value: z.number().int().min(1).max(7).nullable(),
            evidence: z.string().min(5).max(300),
          })
          .strict(),
      )
      .length(16),
    limitedEvidence: z.boolean(),
  })
  .strict();
export type AnalysisReport = z.infer<typeof analysisSchema> & {
  model: string;
  rubricVersion: string;
  analyzedAt: string;
};
export function writtenProfile(report: AnalysisReport, c: TestConfig) {
  analysisSchema.parse({
    summary: report.summary,
    scales: report.scales,
    ratings: report.ratings,
    limitedEvidence: report.limitedEvidence,
  });
  const expected = new Set(c.questions.flatMap((q) => q.scales.map((s) => `${q.id}:${s}`)));
  const actual = report.ratings.map((r) => `${r.questionId}:${r.scale}`);
  if (
    new Set(actual).size !== expected.size ||
    actual.some((key) => !expected.has(key)) ||
    new Set(report.scales.map((s) => s.scale)).size !== 4
  )
    throw new Error('Некорректная структура анализа');
  const missing = report.ratings.filter((r) => r.value === null).map((r) => r.questionId);
  if (missing.length) throw new InsufficientAnswersError([...new Set(missing)]);
  const percentages = Object.fromEntries(
    scaleIds.map((scale) => {
      const ratings = report.ratings.filter((r) => r.scale === scale);
      const sum = ratings.reduce((s, r) => s + r.value!, 0);
      return [scale, Math.round(((sum - ratings.length) / (6 * ratings.length)) * 100)];
    }),
  ) as Scores;
  return profileFromScores(percentages, c, report.limitedEvidence ? ['limited_evidence'] : []);
}
export class InsufficientAnswersError extends Error {
  constructor(public questionIds: string[]) {
    super('Дополните ответы на отмеченные вопросы конкретными действиями');
  }
}
