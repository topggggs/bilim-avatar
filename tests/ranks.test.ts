import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { developmentRank } from '../packages/core/src/ranks';
import { FileStore, initialState } from '../apps/api/src/store';

describe('ранги развития', () => {
  it.each([
    [false, 0, 'start', 1],
    [true, 0, 'practitioner', 1],
    [true, 1, 'specialist', 2],
    [true, 2, 'specialist', 1],
    [true, 3, 'expert', 2],
    [true, 4, 'expert', 1],
    [true, 5, 'mentor', 0],
    [true, 9, 'mentor', 0],
  ] as const)('assessment %s, approved %s → %s', (assessment, count, id, remaining) => {
    const rank = developmentRank(
      assessment,
      Array.from({ length: count }, (_, i) => `practice-${i}`),
    );
    expect(rank.current.id).toBe(id);
    expect(rank.remaining).toBe(remaining);
    expect(rank.progress).toBeGreaterThanOrEqual(0);
    expect(rank.progress).toBeLessThanOrEqual(100);
    expect(rank.ranks).toHaveLength(5);
  });
  it('прогресс соответствует числу практик для следующего ранга', () => {
    expect(developmentRank(true, ['a']).progress).toBe(33);
    expect(developmentRank(true, ['a', 'b', 'c']).progress).toBe(60);
  });
  it('повторное подтверждение одного задания не увеличивает ранг', () => {
    expect(developmentRank(true, ['a', 'a', 'a']).completed).toBe(1);
    expect(developmentRank(true, ['a', 'a', 'a']).current.id).toBe('specialist');
    expect(developmentRank(false, ['a', 'b', 'c']).current.id).toBe('start');
  });
  it('обновляет старое файловое хранилище и сохраняет практики после перезапуска', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bilim-ranks-'));
    try {
      const filename = path.join(dir, 'state.json');
      const legacy = initialState(true) as Partial<ReturnType<typeof initialState>>;
      delete legacy.development;
      delete legacy.accounts;
      delete legacy.authTokens;
      delete legacy.phoneChallenges;
      await writeFile(filename, JSON.stringify(legacy));
      const store = await FileStore.open(filename, true);
      expect((await store.read()).development).toEqual([]);
      expect((await store.read()).accounts).toEqual([]);
      expect((await store.read()).authTokens).toEqual([]);
      expect((await store.read()).phoneChallenges).toEqual([]);
      await store.tx((s) =>
        s.development.push({
          id: 'a',
          userId: 'employee',
          recommendationId: 'rec-1',
          title: 'Практика',
          evidence: 'Результат выполнения практики',
          status: 'pending',
          submittedAt: new Date().toISOString(),
        }),
      );
      const reopened = await FileStore.open(filename, true);
      expect((await reopened.read()).development[0].status).toBe('pending');
      expect(JSON.parse(await readFile(filename, 'utf8')).development).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
