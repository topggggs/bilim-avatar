import { ChevronRight } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import type { User } from '../../../api/src/store';
import { api } from '../api';
import { t } from '../localization';
export default function Admin() {
  const [users, setUsers] = useState<User[]>([]),
    [logs, setLogs] = useState<any[]>([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [form, setForm] = useState({
      id: '',
      sub: '',
      name: '',
      position: '',
      role: 'employee',
      managerId: '',
    });
  async function load() {
    try {
      const [u, a] = await Promise.all([api('/admin/users'), api('/admin/audit')]);
      setUsers(u);
      setLogs(a);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/admin/users', 'POST', {
        ...form,
        sub: form.sub || undefined,
        managerId: form.managerId || undefined,
      });
      setNotice(t('text224'));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="page-title">
        <div>
          <h1>{t('text226')}</h1>
        </div>
      </div>
      {error && (
        <div role="alert" className="alert">
          {error}
        </div>
      )}
      {notice && <div className="success">{notice}</div>}
      <div className="admin-grid">
        <section className="panel editor-row">
          <h2>{t('text228')}</h2>
          <div className="user-list">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() =>
                  setForm({
                    id: u.id,
                    sub: u.sub ?? '',
                    name: u.name,
                    position: u.position,
                    role: u.role,
                    managerId: u.managerId ?? '',
                  })
                }
              >
                <span>
                  <strong>{u.name}</strong>
                  <small>
                    {u.role} · {u.id}
                  </small>
                </span>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        </section>
        <form className="panel editor-row" onSubmit={(e) => void save(e)}>
          <h2>{t('text229')}</h2>
          {[
            { id: 'id', label: t('text230') },
            { id: 'sub', label: 'OIDC subject' },
            { id: 'name', label: t('text231') },
            { id: 'position', label: t('text232') },
          ].map((f) => (
            <label className="form-label" key={f.id}>
              {f.label}
              <input
                required={f.id !== 'sub'}
                value={form[f.id as keyof typeof form]}
                onChange={(e) => setForm({ ...form, [f.id]: e.target.value })}
              />
            </label>
          ))}
          <label className="form-label">
            {t('text233')}
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="employee">{t('text234')}</option>
              <option value="manager">{t('text235')}</option>
              <option value="methodologist">{t('text236')}</option>
              <option value="admin">{t('text237')}</option>
            </select>
          </label>
          <label className="form-label">
            {t('text238')}
            <select
              value={form.managerId}
              onChange={(e) => setForm({ ...form, managerId: e.target.value })}
            >
              <option value="">{t('text239')}</option>
              {users
                .filter((u) => u.role === 'manager')
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </label>
          <button className="button primary" type="submit">
            {t('text240')}
          </button>
        </form>
      </div>
      <section className="panel editor-row audit-panel">
        <div className="panel-top">
          <h2>{t('text241')}</h2>
          <button className="text-button" onClick={() => void load()}>
            {t('text242')}
          </button>
        </div>
        <div className="history-scroll">
          <table>
            <thead>
              <tr>
                <th>{t('text243')}</th>
                <th>{t('text244')}</th>
                <th>{t('text245')}</th>
                <th>{t('text246')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{new Date(l.at).toLocaleString('ru-RU')}</td>
                  <td>{users.find((u) => u.id === l.actorId)?.name ?? l.actorId}</td>
                  <td>{l.action}</td>
                  <td>{l.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!logs.length && <p className="muted">{t('text247')}</p>}
      </section>
    </>
  );
}
