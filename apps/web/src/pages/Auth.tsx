import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, HttpError } from '../api';
import { t } from '../localization';
export type AuthMode = {
  demo: boolean;
  local: boolean;
  oidc: boolean;
  preview: boolean;
  phone: boolean;
};
export type AuthLink = { kind: 'verify' | 'reset'; token: string } | null;
export function readAuthLink(): AuthLink {
  const params = new URLSearchParams(location.hash.slice(1));
  const kind = params.has('verify') ? 'verify' : params.has('reset') ? 'reset' : null;
  if (!kind) return null;
  const token = params.get(kind) ?? '';
  history.replaceState(null, '', location.pathname + location.search);
  return { kind, token };
}
type View = 'login' | 'register' | 'sent' | 'complete' | 'forgot' | 'reset' | 'updated' | 'code';
export default function Auth({
  mode,
  link,
  onDone,
  initialError = '',
}: {
  mode: AuthMode;
  link: AuthLink;
  onDone: () => Promise<void>;
  initialError?: string;
}) {
  const [view, setView] = useState<View>(
    link ? (link.kind === 'verify' ? 'complete' : 'reset') : 'login',
  );
  const [channel, setChannel] = useState<'email' | 'phone'>('email');
  const [phone, setPhone] = useState('+7');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState('');
  const [previewCode, setPreviewCode] = useState('');
  const [grant, setGrant] = useState(link?.token ?? '');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [consent, setConsent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState(initialError);
  const [preview, setPreview] = useState('');
  const [sentKind, setSentKind] = useState<'register' | 'forgot'>('register');
  const [cooldown, setCooldown] = useState(0);
  const title = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  const needsPassword = ['login', 'complete', 'reset'].includes(view);
  const isNewPassword = view === 'complete' || view === 'reset';
  function go(next: View) {
    setView(next);
    setPassword('');
    setConfirmation('');
    setConsent(false);
    setErrors({});
    setError('');
    setShowPassword(false);
    setTimeout(() => title.current?.focus(), 0);
  }
  function clearField(field: string) {
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setError('');
  }
  function validate() {
    const fields: Record<string, string> = {};
    if (
      ['login', 'register', 'forgot'].includes(view) &&
      channel === 'email' &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    )
      fields.email = t('auth.emailError');
    if (
      ['login', 'register', 'forgot'].includes(view) &&
      channel === 'phone' &&
      !/^\+[1-9]\d{7,14}$/.test(phone.replace(/[\s()-]/g, ''))
    )
      fields.phone = t('auth.phoneError');
    if (view === 'code' && !/^\d{6}$/.test(code)) fields.code = t('auth.codeError');
    if (view === 'complete' && name.trim().length < 2) fields.name = t('auth.nameError');
    if (needsPassword && (!password || (isNewPassword && password.trim().length < 15)))
      fields.password = isNewPassword ? t('auth.passwordHint') : t('auth.passwordRequired');
    if (isNewPassword && password !== confirmation) fields.confirmation = t('auth.mismatch');
    if (view === 'complete' && !consent) fields.consent = t('auth.consentError');
    setErrors(fields);
    if (Object.keys(fields).length)
      setTimeout(
        () => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
        0,
      );
    return Object.keys(fields).length === 0;
  }
  async function requestMail(kind: 'register' | 'forgot') {
    const data = await api(
      kind === 'register' ? '/auth/register/request' : '/auth/password/request',
      'POST',
      { email },
    );
    setPreview(mode.preview ? (data.previewLink ?? '') : '');
    setSentKind(kind);
    setCooldown(data.retryAfter ?? 60);
    go('sent');
  }
  async function requestContact(kind: 'register' | 'forgot') {
    if (channel === 'email') return requestMail(kind);
    const data = await api('/auth/phone/request', 'POST', {
      phone,
      kind: kind === 'register' ? 'signup' : 'reset',
    });
    setChallenge(data.challengeId);
    setPreviewCode(mode.preview ? (data.previewCode ?? '') : '');
    setSentKind(kind);
    setCooldown(data.retryAfter ?? 60);
    setCode('');
    go('code');
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true);
    setError('');
    try {
      if (view === 'register' || view === 'forgot') await requestContact(view);
      else if (view === 'login') {
        await api('/auth/password/login', 'POST', {
          ...(channel === 'email' ? { email } : { phone }),
          password,
        });
        setPassword('');
        await onDone();
      } else if (view === 'code') {
        const data = await api('/auth/phone/verify', 'POST', { challengeId: challenge, code });
        setGrant(data.token);
        go(data.kind === 'signup' ? 'complete' : 'reset');
      } else if (view === 'complete') {
        await api('/auth/register/complete', 'POST', {
          token: grant,
          name,
          position,
          password,
          consent,
        });
        setPassword('');
        setConfirmation('');
        await onDone();
      } else if (view === 'reset') {
        const contact = await api('/auth/password/reset', 'POST', { token: grant, password });
        if (contact.email) {
          setEmail(contact.email);
          setChannel('email');
        }
        if (contact.phone) {
          setPhone(contact.phone);
          setChannel('phone');
        }
        go('updated');
      }
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof HttpError && e.data.fields) setErrors(e.data.fields);
    } finally {
      setBusy(false);
    }
  }
  const titles: Record<View, string> = {
    login: t('auth.welcome'),
    register: t('auth.create'),
    sent: t('auth.checkMail'),
    complete: t('auth.finish'),
    forgot: t('auth.recover'),
    reset: t('auth.newPassword'),
    updated: t('auth.updated'),
    code: t('auth.enterCode'),
  };
  const invalid = (field: string) => ({
    'aria-invalid': !!errors[field],
    'aria-describedby': errors[field] ? `error-${field}` : undefined,
  });
  const message = (field: string) =>
    errors[field] && (
      <span className="auth-field-error" id={`error-${field}`}>
        {errors[field]}
      </span>
    );
  return (
    <main className="auth-page">
      <aside className="auth-visual" aria-label={t('auth.academy')}>
        <a className="brand auth-brand" href="/">
          <span className="brand-badge">BI</span>
          <strong>BILIM</strong>
        </a>
        <div className="auth-visual-copy">
          <span>BI ACADEMY</span>
          <h2>{t('auth.hero')}</h2>
          <p>{t('auth.heroCaption')}</p>
        </div>
        <span className="auth-visual-footer">Bilim · BuildEX · BIU</span>
      </aside>
      <section className="auth-form-side">
        <div className="auth-top">
          <span>{t('auth.academy')}</span>
          <span>RU</span>
        </div>
        <div className="auth-card">
          {mode.local && ['login', 'register'].includes(view) && (
            <div className="auth-tabs" aria-label={t('auth.navigation')}>
              <button
                className={view === 'login' ? 'active' : ''}
                aria-pressed={view === 'login'}
                disabled={busy}
                onClick={() => go('login')}
              >
                {t('auth.login')}
              </button>
              <button
                className={view === 'register' ? 'active' : ''}
                aria-pressed={view === 'register'}
                disabled={busy}
                onClick={() => go('register')}
              >
                {t('auth.register')}
              </button>
            </div>
          )}
          {['register', 'complete'].includes(view) && (
            <span className="auth-step">
              {t('auth.step', { number: view === 'register' ? 1 : 2 })}
            </span>
          )}
          <h1 ref={title} tabIndex={-1}>
            {titles[view]}
          </h1>
          {view === 'code' && <p className="auth-subtitle">{t('auth.codeCaption', { phone })}</p>}
          {view === 'login' && <p className="auth-subtitle">{t('auth.loginCaption')}</p>}
          {view === 'register' && <p className="auth-subtitle">{t('auth.registerCaption')}</p>}
          {view === 'complete' && <p className="auth-subtitle">{t('auth.verified')}</p>}
          {view === 'forgot' && <p className="auth-subtitle">{t('auth.recoverCaption')}</p>}
          {mode.phone && ['login', 'register', 'forgot'].includes(view) && (
            <div className="auth-channel" aria-label={t('auth.channel')}>
              <button
                type="button"
                aria-pressed={channel === 'email'}
                disabled={busy}
                onClick={() => {
                  setChannel('email');
                  setErrors({});
                  setError('');
                }}
              >
                {t('auth.byEmail')}
              </button>
              <button
                type="button"
                aria-pressed={channel === 'phone'}
                disabled={busy}
                onClick={() => {
                  setChannel('phone');
                  setErrors({});
                  setError('');
                }}
              >
                {t('auth.byPhone')}
              </button>
            </div>
          )}
          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}
          {mode.local && !['sent', 'updated'].includes(view) && (
            <form ref={form} onSubmit={(e) => void submit(e)} noValidate aria-busy={busy}>
              <fieldset disabled={busy}>
                {['login', 'register', 'forgot'].includes(view) && channel === 'email' && (
                  <label className="auth-label" htmlFor="auth-email">
                    {t('auth.email')}
                    <input
                      id="auth-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                      maxLength={254}
                      placeholder="name@company.kz"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearField('email');
                      }}
                      {...invalid('email')}
                    />
                    {message('email')}
                  </label>
                )}
                {['login', 'register', 'forgot'].includes(view) && channel === 'phone' && (
                  <label className="auth-label" htmlFor="auth-phone">
                    {t('auth.phone')}
                    <input
                      id="auth-phone"
                      name="tel"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      required
                      maxLength={32}
                      placeholder="+7 701 123 45 67"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        clearField('phone');
                      }}
                      {...invalid('phone')}
                    />
                    {message('phone')}
                  </label>
                )}
                {view === 'code' && (
                  <>
                    {mode.preview && previewCode && (
                      <div className="auth-preview">
                        <span>{t('auth.smsPreview')}</span>
                        <strong>{previewCode}</strong>
                      </div>
                    )}
                    <label className="auth-label" htmlFor="auth-code">
                      {t('auth.code')}
                      <input
                        className="auth-code-input"
                        id="auth-code"
                        name="one-time-code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                        pattern="[0-9]{6}"
                        maxLength={6}
                        value={code}
                        onChange={(e) => {
                          setCode(e.target.value.replace(/[^0-9]/g, ''));
                          clearField('code');
                        }}
                        {...invalid('code')}
                      />
                      {message('code')}
                    </label>
                  </>
                )}
                {view === 'complete' && (
                  <>
                    <label className="auth-label" htmlFor="auth-name">
                      {t('auth.name')}
                      <input
                        id="auth-name"
                        name="name"
                        autoComplete="name"
                        required
                        maxLength={100}
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          clearField('name');
                        }}
                        {...invalid('name')}
                      />
                      {message('name')}
                    </label>
                    <label className="auth-label" htmlFor="auth-position">
                      {t('auth.position')}
                      <input
                        id="auth-position"
                        name="organization-title"
                        autoComplete="organization-title"
                        maxLength={100}
                        value={position}
                        onChange={(e) => {
                          setPosition(e.target.value);
                          clearField('position');
                        }}
                      />
                    </label>
                  </>
                )}
                {needsPassword && (
                  <label className="auth-label" htmlFor="auth-password">
                    {t('auth.password')}
                    <div className="auth-password">
                      <input
                        id="auth-password"
                        aria-label={t('auth.password')}
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={isNewPassword ? 'new-password' : 'current-password'}
                        required
                        minLength={isNewPassword ? 15 : undefined}
                        maxLength={128}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          clearField('password');
                        }}
                        {...invalid('password')}
                        aria-describedby={
                          errors.password
                            ? 'error-password'
                            : isNewPassword
                              ? 'password-hint'
                              : undefined
                        }
                      />
                      <button
                        type="button"
                        aria-controls="auth-password"
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {t(showPassword ? 'auth.hide' : 'auth.show')}
                      </button>
                    </div>
                    {isNewPassword && (
                      <span className="auth-hint" id="password-hint">
                        {t('auth.passwordHint')}
                      </span>
                    )}
                    {message('password')}
                  </label>
                )}
                {isNewPassword && (
                  <label className="auth-label" htmlFor="auth-confirmation">
                    {t('auth.confirm')}
                    <input
                      id="auth-confirmation"
                      name="password-confirmation"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      maxLength={128}
                      value={confirmation}
                      onChange={(e) => {
                        setConfirmation(e.target.value);
                        clearField('confirmation');
                      }}
                      {...invalid('confirmation')}
                    />
                    {message('confirmation')}
                  </label>
                )}
                {view === 'login' && (
                  <button
                    type="button"
                    className="text-button auth-forgot"
                    onClick={() => go('forgot')}
                  >
                    {t('auth.forgot')}
                  </button>
                )}
                {view === 'complete' && (
                  <div className="auth-consent">
                    <label>
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => {
                          setConsent(e.target.checked);
                          clearField('consent');
                        }}
                        {...invalid('consent')}
                      />
                      {t('auth.consent')}
                    </label>
                    {message('consent')}
                    <details>
                      <summary>{t('auth.terms')}</summary>
                      <p>{t('auth.termsText')}</p>
                    </details>
                  </div>
                )}
                {view === 'register' && (
                  <details className="auth-consent">
                    <summary>{t('auth.terms')}</summary>
                    <p>{t('auth.termsText')}</p>
                  </details>
                )}
                <button className="button primary auth-submit" type="submit">
                  {busy
                    ? t('auth.wait')
                    : view === 'code'
                      ? t('auth.verifyCode')
                      : view === 'login'
                        ? t('auth.login')
                        : view === 'register' || view === 'forgot'
                          ? t(channel === 'phone' ? 'auth.sendCode' : 'auth.sendLink')
                          : view === 'complete'
                            ? t('auth.createAccount')
                            : t('auth.savePassword')}
                </button>
              </fieldset>
            </form>
          )}
          {view === 'code' && (
            <button
              className="text-button auth-back"
              disabled={busy || cooldown > 0}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await requestContact(sentKind);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {cooldown ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resendCode')}
            </button>
          )}
          {view === 'sent' && (
            <div className="auth-sent" role="status">
              <p>{t('auth.sentCaption')}</p>
              <strong>{email}</strong>
              {mode.preview && preview && (
                <div className="auth-preview">
                  <span>{t('auth.preview')}</span>
                  <a href={preview}>{t('auth.previewLink')}</a>
                </div>
              )}
              <button
                className="button secondary auth-submit"
                disabled={busy || cooldown > 0}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await requestMail(sentKind);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend')}
              </button>
              <button className="text-button" disabled={busy} onClick={() => go(sentKind)}>
                {t('auth.changeEmail')}
              </button>
            </div>
          )}
          {view === 'updated' && (
            <div className="auth-sent">
              <p role="status">{t('auth.updatedCaption')}</p>
              <button className="button primary auth-submit" onClick={() => go('login')}>
                {t('auth.login')}
              </button>
            </div>
          )}
          {mode.oidc && (
            <a className="button primary auth-submit" href="/api/auth/login">
              {t('auth.sso')}
            </a>
          )}
          {['forgot', 'complete', 'reset', 'sent', 'code'].includes(view) && (
            <button className="text-button auth-back" disabled={busy} onClick={() => go('login')}>
              {t('auth.back')}
            </button>
          )}
          {mode.demo && view === 'login' && (
            <button
              className="text-button auth-demo"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await api('/auth/demo', 'POST', { userId: 'employee' });
                  await onDone();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('auth.demo')}
            </button>
          )}
        </div>
        <footer className="auth-footer">BI Academy · {new Date().getFullYear()}</footer>
      </section>
    </main>
  );
}
