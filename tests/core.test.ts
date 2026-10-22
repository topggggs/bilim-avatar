import { describe, it, expect } from 'vitest';
import raw from '../config/test.legacy.ru.json';
import {
  configSchema,
  score,
  profile,
  level,
  choices,
  avatarConfig,
  buildAvatar,
  avatarName,
  lookOptions,
  lookSchema,
  resolveLook,
  scaleIds,
  validateAnswers,
  type TestConfig,
  type AvatarConfig,
  type Scale,
} from '../packages/core/src/index';
const c = configSchema.parse(raw);
const vector = (direct: number, reverse: number) =>
  Object.fromEntries(c.questions.map((q) => [q.id, q.reverse ? reverse : direct]));
describe('версионированная методика', () => {
  it('15 вопросов, четыре вклада и один обратный на шкалу; комплексный №15', () => {
    expect(c.questions).toHaveLength(15);
    for (const s of scaleIds) {
      expect(c.questions.filter((q) => q.scales.includes(s))).toHaveLength(4);
      expect(c.questions.filter((q) => q.scales.includes(s) && q.reverse)).toHaveLength(1);
    }
    expect(c.questions[14].scales).toEqual(['critical', 'confidence']);
  });
  it.each([
    [
      (x: TestConfig) => {
        x.thresholds.medium = 80;
        x.thresholds.high = 70;
      },
    ],
    [
      (x: TestConfig) => {
        x.questions[1].id = '1';
      },
    ],
    [
      (x: TestConfig) => {
        x.questions[0].scales = ['critical'];
      },
    ],
    [
      (x: TestConfig) => {
        x.questions[4].reverse = false;
      },
    ],
    [
      (x: TestConfig) => {
        x.recommendations = x.recommendations.filter((r) => r.scale !== 'critical');
      },
    ],
    [
      (x: TestConfig) => {
        x.recommendations.push(x.recommendations[0]);
      },
    ],
  ])('отклоняет некорректную конфигурацию', (fn) => {
    const copy = structuredClone(c);
    fn(copy);
    expect(configSchema.safeParse(copy).success).toBe(false);
  });
});
it('отклоняет дубли шкалы внутри вопроса', () => {
  const duplicate = structuredClone(c);
  duplicate.questions[0].scales = ['discipline', 'discipline'];
  expect(configSchema.safeParse(duplicate).success).toBe(false);
});
describe('scoring', () => {
  it.each([
    [4, 4, 50],
    [7, 1, 100],
    [1, 7, 0],
  ])('вектор %i/%i → %i%%', (direct, reverse, value) => {
    expect(score(vector(direct, reverse), c.questions)).toEqual(
      Object.fromEntries(scaleIds.map((s) => [s, value])),
    );
  });
  it('вопрос 15 одинаково влияет на КМ и УС, не меняет другие шкалы', () => {
    const answers = vector(4, 4);
    answers['15'] = 7;
    expect(score(answers, c.questions)).toEqual({
      critical: 63,
      confidence: 63,
      discipline: 50,
      engagement: 50,
    });
  });
  it('инверсия каждого ответа даёт дополнительный процент с погрешностью округления 1', () => {
    let seed = 47;
    for (let n = 0; n < 400; n++) {
      const answers = Object.fromEntries(
        c.questions.map((q) => {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          return [q.id, (seed % 7) + 1];
        }),
      );
      const reversed = Object.fromEntries(Object.entries(answers).map(([id, v]) => [id, 8 - v]));
      const a = score(answers, c.questions),
        b = score(reversed, c.questions);
      for (const s of scaleIds) {
        expect(a[s]).toBeGreaterThanOrEqual(0);
        expect(a[s]).toBeLessThanOrEqual(100);
        expect(Math.abs(a[s] + b[s] - 100)).toBeLessThanOrEqual(1);
      }
    }
  });
  it.each([{}, { '1': 0 }, { '1': 8 }, { '1': 3.2 }, { '1': NaN }, { '99': 4 }])(
    'не допускает неполные или неверные ответы %j',
    (answers) => {
      expect(() => score(answers as Record<string, number>, c.questions)).toThrow();
    },
  );
  it('частичное сохранение разрешает корректный поднабор', () => {
    expect(() => validateAnswers({ '1': 2 }, c.questions, false)).not.toThrow();
    expect(() => score({}, [])).toThrow('Пустая шкала');
  });
  it.each([
    [0, 'low'],
    [39, 'low'],
    [40, 'medium'],
    [69, 'medium'],
    [70, 'high'],
    [100, 'high'],
  ])('граница %i → %s', (p, l) => expect(level(p as number, c.thresholds)).toBe(l));
});
describe('результат и рекомендации', () => {
  it('нейтральный профиль: сильная и слабая сторона, один совет и применение сильного', () => {
    const r = profile(vector(4, 4), c, 300);
    expect(r.strong).toHaveLength(1);
    expect(r.growth).toHaveLength(1);
    expect(r.recommendations).toHaveLength(1);
    expect(r.strongUse).toBeTruthy();
    expect(r.qualityFlags).toEqual(['neutral_answers']);
  });
  it('все низкие: сохраняет по два совета на каждое качество, а не обрезает до четырёх', () => {
    const r = profile(vector(1, 7), c, 59);
    expect(r.recommendations).toHaveLength(8);
    expect(r.strong).toHaveLength(1);
    expect(r.growth).toHaveLength(4);
    expect(r.strongUse).toBeNull();
    expect(r.qualityFlags).toEqual(['too_fast']);
    for (const s of scaleIds)
      expect(r.recommendations.filter((x) => x.scale === s)).toHaveLength(2);
  });
  it('высокий профиль и граница времени 60 секунд', () => {
    const r = profile(vector(7, 1), c, 60);
    expect(r.strong).toHaveLength(4);
    expect(r.growth).toHaveLength(1);
    expect(r.qualityFlags).toEqual([]);
  });
  it('порог 12 нейтральных и настраиваемые уровни', () => {
    const a = vector(4, 4);
    a['1'] = 3;
    a['2'] = 3;
    a['3'] = 3;
    expect(profile(a, c, 100).qualityFlags).toContain('neutral_answers');
    a['4'] = 3;
    expect(profile(a, c, 100).qualityFlags).not.toContain('neutral_answers');
    const custom = structuredClone(c);
    custom.thresholds.high = 50;
    expect(profile(vector(4, 4), custom, 100).levels.discipline).toBe('high');
  });
  it('советы отсортированы от самого низкого показателя', () => {
    const a = vector(3, 5);
    a['1'] = 1;
    a['9'] = 1;
    const r = profile(a, c, 100);
    expect(r.weakest).toBe('discipline');
    expect(r.recommendations[0].scale).toBe('discipline');
  });
});
describe('выбор архетипа', () => {
  const appearance = { universe: 'animals', gender: 'neutral', style: 'tech' } as const;
  it('просит выбрать оба равных качества и отклоняет произвольный выбор', () => {
    const s = { critical: 50, confidence: 50, discipline: 50, engagement: 50 };
    expect(choices(s).primaryOptions).toHaveLength(4);
    expect(() => avatarConfig(appearance, s, c)).toThrow('главное');
    expect(() => avatarConfig(appearance, s, c, 'critical')).toThrow('второе');
    expect(avatarConfig(appearance, s, c, 'critical', 'confidence')).toMatchObject({
      archetype: 'strategist',
      accessory: 'confidence',
      boosted: false,
    });
    expect(() =>
      avatarConfig(appearance, { ...s, critical: 100 }, c, 'discipline', 'confidence'),
    ).toThrow();
    expect(() => avatarConfig(appearance, s, c, 'critical', 'critical')).toThrow();
  });
  it('уникальные максимумы выбираются автоматически, >=70 усиливает', () => {
    expect(
      avatarConfig(appearance, { critical: 70, confidence: 60, discipline: 50, engagement: 20 }, c),
    ).toMatchObject({ archetype: 'strategist', accessory: 'confidence', boosted: true });
  });
});
describe('buildAvatar', () => {
  it('все 1920 допустимых сочетаний детерминированы и сохраняют элементы безопасности', () => {
    for (const universe of ['cinema', 'anime', 'animals', 'sport', 'fantasy'] as const)
      for (const gender of ['male', 'female', 'neutral'] as const)
        for (const style of ['bright', 'strict', 'calm', 'tech'] as const)
          for (const archetype of ['strategist', 'leader', 'master', 'mentor'] as const)
            for (const accessory of scaleIds)
              for (const boosted of [false, true]) {
                const conf: AvatarConfig = {
                  universe,
                  gender,
                  style,
                  archetype,
                  accessory,
                  boosted,
                };
                const a = buildAvatar(conf);
                expect(buildAvatar(conf)).toEqual(a);
                expect(a.prompt).toContain('safety helmet');
                expect(a.prompt).toContain('high-visibility vest');
                expect(a.prompt).toContain(gender);
                expect(a.prompt).toContain(archetype);
                expect(a.fallbackSvg).toContain('<svg');
                expect(a.fallbackSvg).not.toContain('<script');
                expect(avatarName(conf)).toBeTruthy();
              }
  });
  it('отклоняет неверный архетип, палитру или аксессуар', () => {
    for (const bad of [{ archetype: 'unknown' }, { style: 'unknown' }, { accessory: 'unknown' }])
      expect(() =>
        buildAvatar({
          ...{
            universe: 'animals',
            gender: 'neutral',
            style: 'tech',
            archetype: 'strategist',
            accessory: 'confidence',
            boosted: true,
          },
          ...bad,
        } as AvatarConfig),
      ).toThrow();
  });
  it('создаёт отдельный образ соискателя для минимальных ответов', () => {
    const avatar = avatarConfig(
      { universe: 'animals', gender: 'neutral', style: 'tech' },
      { critical: 0, confidence: 0, discipline: 0, engagement: 0 },
      c,
      undefined,
      undefined,
      true,
    );
    const illustration = buildAvatar(avatar);
    expect(avatar).toMatchObject({ archetype: 'jobseeker', accessory: 'critical', boosted: false });
    expect(avatarName(avatar)).toBe('Панда-безработный');
    expect(illustration.prompt).toContain('no hard hat and no safety vest');
    expect(illustration.prompt).toContain('portfolio folder');
    expect(illustration.fallbackSvg).toContain('#282b32');
  });
  it('«Ещё вариант» даёт восемь разных образов: очки, часы, эмоции, наушники, фон', () => {
    const avatar: AvatarConfig = {
      universe: 'animals',
      gender: 'neutral',
      style: 'tech',
      archetype: 'master',
      accessory: 'discipline',
      boosted: false,
    };
    const variants = Array.from({ length: 8 }, (_, i) => buildAvatar(avatar, i));
    expect(variants[0].fallbackSvg).toContain('data-part="headwear-helmet"');
    expect(variants[0].prompt).toContain('safety helmet');
    expect(variants[1].fallbackSvg).toContain('data-part="eyewear-sunglasses"');
    expect(variants[1].prompt).toContain('stylish glossy black sunglasses');
    expect(variants[2].fallbackSvg).toContain('data-part="extra-watch"');
    expect(variants[2].prompt).toContain('fastened securely around a clearly visible wrist');
    expect(variants[3].fallbackSvg).toContain('data-part="expression-focused"');
    expect(variants[4].fallbackSvg).toContain('data-part="expression-wink"');
    expect(variants[5].fallbackSvg).toContain('data-part="extra-headphones"');
    expect(variants[5].prompt).toContain('leave the front headwear and BI emblem unobstructed');
    expect(variants[6].fallbackSvg).toContain('data-part="background-sunset"');
    expect(variants[7].fallbackSvg).toContain('data-part="eyewear-round"');
    expect(new Set(variants.map((x) => x.fallbackSvg)).size).toBe(8);
    expect(new Set(variants.map((x) => x.prompt)).size).toBe(8);
    expect(buildAvatar(avatar, 8).fallbackSvg).toBe(variants[0].fallbackSvg);
  });
  it('сохранённый образ важнее номера варианта и проходит схему', () => {
    const look = {
      headwear: 'cap',
      eyewear: 'goggles',
      extra: 'medal',
      expression: 'grin',
      background: 'night',
      skin: 'deep',
    } as const;
    const avatar: AvatarConfig = {
      universe: 'cinema',
      gender: 'female',
      style: 'calm',
      archetype: 'leader',
      accessory: 'engagement',
      boosted: true,
      look,
    };
    expect(resolveLook(avatar, 5)).toEqual(look);
    expect(buildAvatar(avatar, 0)).toEqual(buildAvatar(avatar, 5));
    for (const part of [
      'headwear-cap',
      'eyewear-goggles',
      'extra-medal',
      'expression-grin',
      'background-night',
    ])
      expect(buildAvatar(avatar).fallbackSvg).toContain(`data-part="${part}"`);
    expect(buildAvatar(avatar).prompt).toContain('deep skin tone');
    expect(lookSchema.parse(look)).toEqual(look);
    expect(() => lookSchema.parse({ ...look, headwear: 'crown' })).toThrow();
    expect(() => lookSchema.parse({ ...look, script: '<script>' })).toThrow();
  });
  it('каждый аксессуар на каждом герое даёт корректный SVG без NaN и undefined', () => {
    const wellFormed = (svg: string) => {
      const stack: string[] = [];
      for (const [, closing, name, selfClosing] of svg.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)) {
        if (selfClosing) continue;
        if (!closing) stack.push(name);
        else if (stack.pop() !== name) return false;
      }
      return stack.length === 0;
    };
    const parts = Object.keys(lookOptions) as (keyof typeof lookOptions)[];
    for (const universe of ['animals', 'cinema', 'anime', 'sport', 'fantasy'] as const)
      for (const archetype of ['strategist', 'leader', 'master', 'mentor', 'jobseeker'] as const)
        for (const part of parts)
          for (const value of lookOptions[part]) {
            const conf: AvatarConfig = {
              universe,
              gender: archetype === 'leader' ? 'female' : 'male',
              style: 'strict',
              archetype,
              accessory: 'critical',
              boosted: archetype === 'mentor',
              look: { ...resolveLook({ universe, archetype } as AvatarConfig), [part]: value },
            };
            const { fallbackSvg, prompt } = buildAvatar(conf);
            expect(wellFormed(fallbackSvg), `${universe}/${archetype}/${part}=${value}`).toBe(true);
            expect(fallbackSvg).not.toMatch(/NaN|undefined|<script/);
            expect(prompt).not.toMatch(/NaN|undefined/);
          }
  });
});
