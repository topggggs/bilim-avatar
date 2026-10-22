import { getLanguage, t, translateServer } from './localization';
export class HttpError extends Error {
  public data: Record<string, any>;
  constructor(
    public status: number,
    data: Record<string, any>,
  ) {
    super(data.error ? translateServer(data.error) : t('api.error'));
    this.data = data.fields
      ? {
          ...data,
          fields: Object.fromEntries(
            Object.entries(data.fields).map(([field, text]) => [
              field,
              translateServer(String(text)),
            ]),
          ),
        }
      : data;
  }
}
export async function api<T = any>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(`/api${url}`, {
    method,
    credentials: 'same-origin',
    headers: {
      'Accept-Language': getLanguage(),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => {
    throw new Error(t('api.offline'));
  });
  const data = await r.json();
  if (!r.ok) throw new HttpError(r.status, data);
  return data;
}
