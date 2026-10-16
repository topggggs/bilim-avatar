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
type PendingView = 'sent' | 'code' | 'complete' | 'reset';
type AuthProgress = {
  view: PendingView;
  expiresAt: number;
  retryAt: number;
  channel: 'email' | 'phone';
  email: string;
  phone: string;
  sentKind: 'register' | 'forgot';
  challenge: string;
  grant: string;
  preview: string;
  previewCode: string;
};
const progressKey = 'bilim-auth-progress';
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
export function clearAuthFlow() {
  try {
    sessionStorage.removeItem(progressKey);
  } catch {}
}
function saveProgress(progress: AuthProgress) {
  try {
    sessionStorage.setItem(progressKey, JSON.stringify(progress));
  } catch {}
}
function readProgress(): AuthProgress | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(progressKey) ?? 'null');
    if (
      saved &&
      ['sent', 'code', 'complete', 'reset'].includes(saved.view) &&
      Number.isFinite(saved.expiresAt) &&
      saved.expiresAt > Date.now() &&
      saved.expiresAt <= Date.now() + 30 * 60000 &&
      Number.isFinite(saved.retryAt) &&
      ['email', 'phone'].includes(saved.channel) &&
      ['register', 'forgot'].includes(saved.sentKind) &&
      ['email', 'phone', 'challenge', 'grant', 'preview', 'previewCode'].every(
        (field) => typeof saved[field] === 'string',
      ) &&
      (!['complete', 'reset'].includes(saved.view) || tokenPattern.test(saved.grant))
    )
      return saved;
  } catch {}
  clearAuthFlow();
  return null;
}
export function readAuthLink(): AuthLink {
  const params = new URLSearchParams(location.hash.slice(1));
  const kind = params.has('verify') ? 'verify' : params.has('reset') ? 'reset' : null;
  if (!kind) {
    const saved = readProgress();
    return saved && ['complete', 'reset'].includes(saved.view)
      ? { kind: saved.view === 'complete' ? 'verify' : 'reset', token: saved.grant }
      : null;
  }
  const token = params.get(kind) ?? '';
  history.replaceState(null, '', location.pathname + location.search);
  clearAuthFlow();
  if (tokenPattern.test(token))
    saveProgress({
      view: kind === 'verify' ? 'complete' : 'reset',
      expiresAt: Date.now() + (kind === 'verify' ? 30 : 15) * 60000,
      retryAt: 0,
      channel: 'email',
      email: '',
      phone: '+7',
      sentKind: kind === 'verify' ? 'register' : 'forgot',
      challenge: '',
      grant: token,
      preview: '',
      previewCode: '',
    });
  return { kind, token };
}
type View = 'login' | 'register' | 'forgot' | 'updated' | 'invalid' | PendingView;
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
  const [restored] = useState(() => {
    const saved = readProgress();
    return !mode.local || (!mode.phone && saved?.channel === 'phone') ? null : saved;
  });
  const [view, setView] = useState<View>(
    link
      ? tokenPattern.test(link.token)
        ? link.kind === 'verify'
          ? 'complete'
          : 'reset'
        : 'invalid'
      : (restored?.view ?? 'login'),
  );
  const [channel, setChannel] = useState<'email' | 'phone'>(restored?.channel ?? 'email');
  const [phone, setPhone] = useState(restored?.phone ?? '+7');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState(restored?.challenge ?? '');
  const [previewCode, setPreviewCode] = useState(restored?.previewCode ?? '');
  const [grant, setGrant] = useState(link?.token ?? restored?.grant ?? '');
  const [email, setEmail] = useState(restored?.email ?? '');
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [consent, setConsent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState(initialError);
  const [preview, setPreview] = useState(restored?.preview ?? '');
  const [sentKind, setSentKind] = useState<'register' | 'forgot'>(
    link?.kind === 'reset' ? 'forgot' : (restored?.sentKind ?? 'register'),
  );
  const [retryAt, setRetryAt] = useState(restored?.retryAt ?? 0);
  const [expiresAt, setExpiresAt] = useState(restored?.expiresAt ?? 0);
  const [clock, setClock] = useState(Date.now);
  const cooldown = Math.max(0, Math.ceil((retryAt - clock) / 1000));
  const title = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const tick = () => setClock(Date.now());
    tick();
    if (!retryAt) return;
    const timer = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [retryAt]);
  useEffect(() => {
    if (!['sent', 'code', 'complete', 'reset'].includes(view)) {
      clearAuthFlow();
      return;
    }
    saveProgress({
      view: view as PendingView,
      expiresAt,
      retryAt,
      channel,
      email,
      phone,
      sentKind,
      challenge,
      grant,
      // Demo previews are never saved in production; passwords and entered codes never are.
      preview: mode.preview ? preview : '',
      previewCode: mode.preview ? previewCode : '',
    });
  }, [
    view,
    expiresAt,
    retryAt,
    channel,
    email,
    phone,
    sentKind,
    challenge,
    grant,
    preview,
    previewCode,
    mode.preview,
  ]);
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
    setCode('');
    if (['login', 'register', 'forgot', 'updated', 'invalid'].includes(next)) {
      clearAuthFlow();
      setGrant('');
      setChallenge('');
      setPreview('');
      setPreviewCode('');
    }
    setTimeout(() => title.current?.focus(), 0);
  }
  function changeChannel(next: 'email' | 'phone') {
    setChannel(next);
    setPassword('');
    setConfirmation('');
    setShowPassword(false);
    setErrors({});
    setError('');
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
    setRetryAt(Date.now() + (data.retryAfter ?? 60) * 1000);
    setExpiresAt(Date.now() + (kind === 'register' ? 30 : 15) * 60000);
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
    setRetryAt(Date.now() + (data.retryAfter ?? 60) * 1000);
    setExpiresAt(Date.now() + 5 * 60000);
    setCode('');
    go('code');
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
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
        clearAuthFlow();
        await onDone();
      } else if (view === 'code') {
        const data = await api('/auth/phone/verify', 'POST', { challengeId: challenge, code });
        setGrant(data.token);
        setExpiresAt(Date.now() + 10 * 60000);
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
        clearAuthFlow();
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
      else if (e instanceof HttpError && e.status === 400 && ['complete', 'reset'].includes(view)) {
        setView('invalid');
        clearAuthFlow();
      }
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
    invalid: t('auth.invalidLink'),
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
                onClick={() => changeChannel('email')}
              >
                {t('auth.byEmail')}
              </button>
              <button
                type="button"
                aria-pressed={channel === 'phone'}
                disabled={busy}
                onClick={() => changeChannel('phone')}
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
          {mode.local && !['sent', 'updated', 'invalid'].includes(view) && (
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
            <>
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
              <button
                className="text-button auth-back"
                disabled={busy}
                onClick={() => go(sentKind)}
              >
                {t('auth.changePhone')}
              </button>
            </>
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
          {view === 'invalid' && (
            <div className="auth-sent">
              {!error && <p role="status">{t('auth.invalidCaption')}</p>}
              <button className="button primary auth-submit" onClick={() => go(sentKind)}>
                {t('auth.requestAgain')}
              </button>
            </div>
          )}
          {mode.oidc && (
            <a className="button primary auth-submit" href="/api/auth/login">
              {t('auth.sso')}
            </a>
          )}
          {['forgot', 'complete', 'reset', 'sent', 'code', 'invalid'].includes(view) && (
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
