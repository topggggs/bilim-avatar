import { z } from 'zod';
export const scaleIds = ['critical', 'confidence', 'discipline', 'engagement'] as const;
export type Scale = (typeof scaleIds)[number];
export type Level = 'low' | 'medium' | 'high';
export type Scores = Record<Scale, number>;
export type Answers = Record<string, number>;
export const appearanceSchema = z
  .object({
    universe: z.enum(['cinema', 'anime', 'animals', 'sport', 'fantasy']),
    gender: z.enum(['male', 'female', 'neutral']),
    style: z.enum(['bright', 'strict', 'calm', 'tech']),
  })
  .strict();
export type Appearance = z.infer<typeof appearanceSchema>;
export type Archetype = 'strategist' | 'leader' | 'master' | 'mentor';
export type AvatarConfig = Appearance & {
  archetype: Archetype;
  accessory: Scale;
  boosted: boolean;
};
export const questionSchema = z
  .object({
    id: z.string().regex(/^\d+$/),
    text: z.string().min(10).max(1200),
    scales: z.array(z.enum(scaleIds)).min(1).max(2),
    reverse: z.boolean(),
  })
  .strict();
const interpretationSchema = z
  .object({ low: z.string().min(5), medium: z.string().min(5), high: z.string().min(5) })
  .strict();
export const recommendationSchema = z
  .object({
    id: z.string(),
    scale: z.enum(scaleIds),
    level: z.enum(['low', 'medium', 'high']),
    format: z.enum(['practice', 'microcourse', 'mentor', 'checklist']),
    durationDays: z.number().int().positive(),
    title: z.string().min(3),
    text: z.string().min(5),
    link: z.string().regex(/^\/(bilim|buildex|biu)\/[a-z0-9/-]+$/),
  })
  .strict();
export const configSchema = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    contentStatus: z.enum(['draft', 'approved']),
    retakeDays: z.number().int().min(1).max(365),
    thresholds: z
      .object({ medium: z.number().int().min(1).max(98), high: z.number().int().min(2).max(99) })
      .strict(),
    quality: z
      .object({
        neutralCount: z.number().int().min(1).max(15),
        minimumSeconds: z.number().min(0).max(3600),
      })
      .strict(),
    consentVersion: z.string(),
    scales: z.record(
      z.enum(scaleIds),
      z
        .object({
          label: z.string(),
          short: z.string(),
          archetype: z.enum(['strategist', 'leader', 'master', 'mentor']),
          interpretations: interpretationSchema,
        })
        .strict(),
    ),
    questions: z.array(questionSchema).length(15),
    recommendations: z.array(recommendationSchema),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.thresholds.medium >= c.thresholds.high)
      ctx.addIssue({ code: 'custom', message: 'Пороги должны возрастать' });
    if (new Set(c.questions.map((q) => q.id)).size !== 15)
      ctx.addIssue({ code: 'custom', message: 'ID вопросов не уникальны' });
    if (c.questions.some((q) => new Set(q.scales).size !== q.scales.length))
      ctx.addIssue({ code: 'custom', message: 'Шкалы вопроса не должны повторяться' });
    for (const s of scaleIds) {
      const qs = c.questions.filter((q) => q.scales.includes(s));
      if (qs.length !== 4 || qs.filter((q) => q.reverse).length !== 1)
        ctx.addIssue({
          code: 'custom',
          message: `Шкала ${s}: нужно четыре вопроса, один обратный`,
        });
      if (c.recommendations.filter((r) => r.scale === s && r.level === 'low').length < 2)
        ctx.addIssue({ code: 'custom', message: `Недостаточно рекомендаций ${s}` });
      for (const l of ['medium', 'high'])
        if (!c.recommendations.some((r) => r.scale === s && r.level === l))
          ctx.addIssue({ code: 'custom', message: `Нет рекомендации ${s}/${l}` });
    }
    if (new Set(c.recommendations.map((r) => r.id)).size !== c.recommendations.length)
      ctx.addIssue({ code: 'custom', message: 'ID рекомендаций не уникальны' });
  });
export type TestConfig = z.infer<typeof configSchema>;
export type Question = z.infer<typeof questionSchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
export function validateAnswers(answers: Answers, questions: Question[], complete = true) {
  const ids = new Set(questions.map((q) => q.id));
  if (
    Object.keys(answers).some((id) => !ids.has(id)) ||
    Object.values(answers).some((v) => !Number.isInteger(v) || v < 1 || v > 7)
  )
    throw new Error('Ответы должны быть целыми числами от 1 до 7');
  if (complete && questions.some((q) => answers[q.id] === undefined))
    throw new Error('Ответьте на все вопросы');
}
export function score(answers: Answers, questions: Question[]): Scores {
  validateAnswers(answers, questions);
  const acc = Object.fromEntries(scaleIds.map((s) => [s, { sum: 0, n: 0 }])) as Record<
    Scale,
    { sum: number; n: number }
  >;
  for (const q of questions) {
    const x = q.reverse ? 8 - answers[q.id] : answers[q.id];
    for (const s of q.scales) {
      acc[s].sum += x;
      acc[s].n++;
    }
  }
  return Object.fromEntries(
    scaleIds.map((s) => {
      const { sum, n } = acc[s];
      if (!n) throw new Error('Пустая шкала');
      return [s, Math.round(((sum - n) / (6 * n)) * 100)];
    }),
  ) as Scores;
}
export function level(p: number, thresholds: TestConfig['thresholds']): Level {
  return p >= thresholds.high ? 'high' : p >= thresholds.medium ? 'medium' : 'low';
}
export function rank(scores: Scores): Scale[] {
  return [...scaleIds].sort((a, b) => scores[b] - scores[a]);
}
export function choices(scores: Scores, primary?: Scale) {
  const sorted = rank(scores);
  const primaryOptions = sorted.filter((s) => scores[s] === scores[sorted[0]]);
  const remaining = sorted.filter((s) => s !== (primary ?? primaryOptions[0]));
  return {
    primaryOptions,
    secondaryOptions: remaining.filter((s) => scores[s] === scores[remaining[0]]),
  };
}
export function profile(answers: Answers, c: TestConfig, elapsedSeconds: number) {
  const percentages = score(answers, c.questions),
    sorted = rank(percentages),
    weakest = sorted[sorted.length - 1];
  const levels = Object.fromEntries(
    scaleIds.map((s) => [s, level(percentages[s], c.thresholds)]),
  ) as Record<Scale, Level>;
  const strong = sorted.filter((s) => levels[s] === 'high'),
    low = [...sorted].reverse().filter((s) => levels[s] === 'low');
  const recommendations = low.length
    ? low.flatMap((s) =>
        c.recommendations.filter((r) => r.scale === s && r.level === 'low').slice(0, 2),
      )
    : [c.recommendations.find((r) => r.scale === weakest && r.level === levels[weakest])!];
  const qualityFlags: string[] = [];
  if (Object.values(answers).filter((x) => x === 4).length >= c.quality.neutralCount)
    qualityFlags.push('neutral_answers');
  if (elapsedSeconds < c.quality.minimumSeconds) qualityFlags.push('too_fast');
  return {
    percentages,
    levels,
    strong: strong.length ? strong : [sorted[0]],
    growth: low.length ? low : [weakest],
    recommendations,
    qualityFlags,
    weakest,
    strongUse: !low.length
      ? `Поделитесь опытом: ${c.scales[sorted[0]].label.toLowerCase()}. Обсудите роль наставника.`
      : null,
    nextStep: recommendations[0],
    testVersion: c.version,
  };
}
export type Result = ReturnType<typeof profile>;
export function avatarConfig(
  appearance: Appearance,
  scores: Scores,
  c: TestConfig,
  primary?: Scale,
  secondary?: Scale,
): AvatarConfig {
  appearanceSchema.parse(appearance);
  const options = choices(scores, primary);
  if (
    (primary && !options.primaryOptions.includes(primary)) ||
    (!primary && options.primaryOptions.length > 1)
  )
    throw new Error('Выберите главное качество из равных');
  const p = primary ?? options.primaryOptions[0];
  const secondOptions = choices(scores, p).secondaryOptions;
  if ((secondary && !secondOptions.includes(secondary)) || (!secondary && secondOptions.length > 1))
    throw new Error('Выберите второе качество из равных');
  return {
    ...appearance,
    archetype: c.scales[p].archetype,
    accessory: secondary ?? secondOptions[0],
    boosted: scores[p] >= c.thresholds.high,
  };
}
export { buildAvatar, avatarName, avatarCatalog } from './avatar.js';
