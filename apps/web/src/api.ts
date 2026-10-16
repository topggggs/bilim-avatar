export class HttpError extends Error {
  constructor(
    public status: number,
    public data: Record<string, any>,
  ) {
    super(data.error ?? 'Ошибка запроса');
  }
}
export async function api<T = any>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(`/api${url}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new HttpError(r.status, data);
  return data;
}
