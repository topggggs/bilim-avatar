import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ru from '../config/interface.ru.json';
import en from '../config/interface.en.json';
import kk from '../config/interface.kk.json';
import uiRu from '../config/ui.ru.json';
import uiEn from '../config/ui.en.json';
import uiKk from '../config/ui.kk.json';
import seed from '../config/test.ru.json';
import testEn from '../config/test.en.json';
import testKk from '../config/test.kk.json';
const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
const source = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? source(file) : entry.name.endsWith('.ts') ? [file] : [];
  });
describe('переводы интерфейса', () => {
  for (const [name, dictionary] of [
    ['en', en],
    ['kk', kk],
  ] as const)
    it(`${name}: те же ключи и подстановки, что в русском`, () => {
      expect(Object.keys(dictionary)).toEqual(Object.keys(ru));
      for (const [key, text] of Object.entries(ru))
        expect(placeholders(dictionary[key as keyof typeof ru]), key).toEqual(placeholders(text));
      expect(Object.keys(name === 'en' ? uiEn : uiKk)).toEqual(Object.keys(uiRu));
    });
  it('контент теста переведён для всех шкал, вопросов и рекомендаций', () => {
    for (const translation of [testEn, testKk]) {
      expect(Object.keys(translation.scales).sort()).toEqual(Object.keys(seed.scales).sort());
      expect(Object.keys(translation.questions).sort()).toEqual(
        seed.questions.map((q) => q.id).sort(),
      );
      expect(Object.keys(translation.recommendations).sort()).toEqual(
        seed.recommendations.map((r) => r.id).sort(),
      );
    }
  });
  it('каждое переводимое сообщение сервера дословно есть в коде API', () => {
    const code = [...source('apps/api/src'), ...source('packages/core/src')]
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    const missing = Object.entries(ru)
      .filter(([key, text]) => key.startsWith('server.') && !code.includes(text))
      .map(([key]) => key);
    expect(missing).toEqual([]);
  });
});
