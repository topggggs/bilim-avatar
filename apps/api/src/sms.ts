import { z } from 'zod';
export const phoneSchema = z
  .string()
  .trim()
  .max(32)
  .transform((v) => v.replace(/[\s()-]/g, ''))
  .pipe(
    z.string().regex(/^\+[1-9]\d{7,14}$/, 'Укажите номер с кодом страны, например +77011234567'),
  );
export type SendAuthSms = (sms: { to: string; code: string }) => Promise<void>;
export function smsConfigured() {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM
  );
}
export function twilioSender(): SendAuthSms {
  return async ({ to, code }) => {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: to,
          From: process.env.TWILIO_FROM!,
          Body: `Bilim: ${code}. Код действует 5 минут. Никому его не сообщайте.`,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) throw Error('SMS delivery failed');
    const result = await response.json();
    if (['failed', 'undelivered'].includes(result.status)) throw Error('SMS delivery failed');
  };
}
