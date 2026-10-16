import { describe, it, expect } from 'vitest';
import raw from '../config/test.ru.json';
import {
  configSchema,
  score,
  profile,
  level,
  choices,
  avatarConfig,
  buildAvatar,
  avatarName,
  avatarCatalog,
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
  it('отклоняет все неизвестные значения конфигурации и попытки вставить разметку', () => {
    for (const bad of [
      { universe: 'unknown' },
      { archetype: 'unknown' },
      { style: 'unknown' },
      { accessory: 'unknown' },
      { gender: 'unknown' },
      { boosted: 'false' },
      { universe: 'constructor' },
      { archetype: '__proto__' },
      { gender: '<script>alert(1)</script>' },
      { style: '#fff\" onload=\"alert(1)' },
    ])
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
    expect(() => buildAvatar(null as unknown as AvatarConfig)).toThrow();
    expect(() => avatarName(undefined as unknown as AvatarConfig)).toThrow();
  });
  it('каталог содержит 20 различных оригинальных персонажей и безопасные превью', () => {
    expect(avatarCatalog).toHaveLength(20);
    expect(new Set(avatarCatalog.map((entry) => entry.id)).size).toBe(20);
    expect(new Set(avatarCatalog.map((entry) => entry.name)).size).toBe(20);
    const images = new Set<string>();
    for (const entry of avatarCatalog) {
      expect(avatarName(entry.config)).toBe(entry.name);
      const { fallbackSvg, prompt } = buildAvatar(entry.config);
      images.add(fallbackSvg);
      expect(fallbackSvg).toContain(`<title>${entry.name}</title>`);
      expect(fallbackSvg).not.toMatch(/<script|<foreignObject|<image|onload=|(?:href|src)=/i);
      expect(fallbackSvg).not.toContain('FACE');
      expect(prompt).toContain('no floating stickers');
      expect(Object.isFrozen(entry.config)).toBe(true);
    }
    expect(images.size).toBe(20);
    expect(Object.isFrozen(avatarCatalog)).toBe(true);
    for (const universe of ['cinema', 'anime', 'animals', 'sport', 'fantasy'])
      expect(avatarCatalog.filter((entry) => entry.universe === universe)).toHaveLength(4);
  });
});
