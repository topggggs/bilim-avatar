import { useEffect, useState } from 'react';
import type { User } from '../../../api/src/store';
import { api } from '../api';
import features from '../../../../config/features.ru.json';
const copy = features.account;
export default function Account({
  user,
  onUpdate,
  onSignOut,
}: {
  user: User;
  onUpdate: (u: User) => void;
  onSignOut: () => void;
}) {
  const [data, setData] = useState<{
    contact: { email?: string; phone?: string };
    passwordEnabled: boolean;
  } | null>(null);
  const [name, setName] = useState(user.name),
    [position, setPosition] = useState(user.position);
  const [currentPassword, setCurrentPassword] = useState(''),
    [password, setPassword] = useState(''),
    [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  useEffect(() => {
    void api('/account')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="account-page">
      <div className="page-title">
        <h1>{copy.title}</h1>
      </div>
      {user.access && user.access !== 'active' && (
        <div className="access-notice" role="status">
          <h2>{user.access === 'pending' ? copy.pendingTitle : copy.suspendedTitle}</h2>
          <p>{user.access === 'pending' ? copy.pendingDescription : copy.suspendedDescription}</p>
          <button className="text-button" onClick={() => location.reload()}>
            {copy.checkStatus}
          </button>
        </div>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      <div className="account-grid">
        <form
          className="panel account-panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            setNotice('');
            try {
              const r = await api('/account', 'PUT', { name, position });
              onUpdate(r.user);
              setNotice(copy.saved);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>{copy.personalData}</h2>
          <fieldset disabled={busy}>
            <label className="form-label">
              {copy.name}
              <input
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="form-label">
              {copy.position}
              <input
                maxLength={100}
                autoComplete="organization-title"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              />
            </label>
            {data?.contact && (
              <div className="account-contact">
                <span>{copy.verifiedContact}</span>
                <strong>{data.contact.email ?? data.contact.phone}</strong>
              </div>
            )}
            <button className="button primary" type="submit">
              {copy.save}
            </button>
          </fieldset>
        </form>
        {data?.passwordEnabled && (
          <form
            className="panel account-panel"
            onSubmit={async (e) => {
              e.preventDefault();
              setError('');
              if (password !== repeat) {
                setError(copy.passwordMismatch);
                return;
              }
              setBusy(true);
              try {
                await api('/account/password', 'POST', { currentPassword, password });
                onSignOut();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>{copy.changePassword}</h2>
            <fieldset disabled={busy}>
              <label className="form-label">
                {copy.currentPassword}
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </label>
              <label className="form-label">
                {copy.newPassword}
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={15}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label className="form-label">
                {copy.repeatPassword}
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={15}
                  maxLength={128}
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                />
              </label>
              <p className="muted">{copy.passwordNotice}</p>
              <button className="button secondary" type="submit">
                {copy.updatePassword}
              </button>
            </fieldset>
          </form>
        )}
      </div>
    </div>
  );
}
