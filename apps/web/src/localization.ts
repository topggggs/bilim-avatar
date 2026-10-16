import dictionary from '../../../config/interface.ru.json';
/** All Russian interface copy lives in versioned JSON. Add a locale dictionary to enable Kazakh. */
export function t(key: keyof typeof dictionary, values: Record<string, unknown> = {}): string {
  return dictionary[key].replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
    String(values[name] ?? ''),
  );
}
