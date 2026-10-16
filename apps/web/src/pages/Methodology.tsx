import { Save } from 'lucide-react';
import { useState } from 'react';
import { configSchema, scaleIds, type TestConfig } from '../../../../packages/core/src/index';
import { api } from '../api';
import { t } from '../localization';
import { Disclaimer, levelLabels } from '../shared';
export default function Methodology({
  config,
  canEdit,
  onSave,
}: {
  config: TestConfig;
  canEdit: boolean;
  onSave: (c: TestConfig) => void;
}) {
  const [value, setValue] = useState(() => {
      const c = structuredClone(config);
      const parts = c.version.split('.').map(Number);
      c.version = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
      c.contentStatus = 'draft';
      return c;
    }),
    [tab, setTab] = useState('questions'),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [raw, setRaw] = useState('');
  function edit(fn: (c: TestConfig) => void) {
    const next = structuredClone(value);
    fn(next);
    setValue(next);
    setNotice('');
  }
  async function publish() {
    setBusy(true);
    setError('');
    try {
      const c = configSchema.parse(tab === 'json' ? JSON.parse(raw) : value);
      await api('/methodology/versions', 'POST', c);
      onSave(c);
      setNotice(t('text195', { v0: c.version }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('text196'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">{t('text197')}</div>
          <h1>
            {t('text198')}
            <span className="heading-dot">.</span>
          </h1>
          <p>{t('text199')}</p>
        </div>
        <span className="pill neutral">
          {t('text200')}
          {config.version}
        </span>
      </div>
      <div className="method-toolbar panel">
        <label className="form-label">
          {t('text201')}
          <input
            disabled={!canEdit}
            value={value.version}
            onChange={(e) =>
              edit((c) => {
                c.version = e.target.value;
              })
            }
          />
        </label>
        <label className="form-label">
          {t('text202')}
          <select
            disabled={!canEdit}
            value={value.contentStatus}
            onChange={(e) =>
              edit((c) => {
                c.contentStatus = e.target.value as TestConfig['contentStatus'];
              })
            }
          >
            <option value="draft">{t('text203')}</option>
            <option value="approved">{t('text204')}</option>
          </select>
        </label>
        <button
          className="button primary"
          disabled={!canEdit || busy}
          onClick={() => void publish()}
        >
          <Save size={17} />
          {t('text205')}
        </button>
      </div>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="success" role="status">
          {notice}
        </div>
      )}
      <div className="tabs">
        {[
          { id: 'questions', label: t('text206') },
          { id: 'interpretations', label: t('text207') },
          { id: 'recommendations', label: t('text208') },
          { id: 'settings', label: t('text209') },
          { id: 'json', label: 'JSON' },
        ].map((t) => (
          <button
            className={tab === t.id ? 'active' : ''}
            key={t.id}
            onClick={() => {
              if (t.id === 'json') setRaw(JSON.stringify(value, null, 2));
              setTab(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <fieldset disabled={!canEdit} className="method-fields">
        {tab === 'questions' &&
          value.questions.map((q, i) => (
            <div className="panel editor-row" key={q.id}>
              <div className="editor-label">
                <b>
                  {t('text210')}
                  {i + 1}
                </b>
                <span>
                  {q.scales.map((s) => value.scales[s].short).join(' + ')}
                  {q.reverse ? t('text211') : ''}
                </span>
              </div>
              <textarea
                aria-label={t('text212', { v0: i + 1 })}
                value={q.text}
                onChange={(e) =>
                  edit((c) => {
                    c.questions[i].text = e.target.value;
                  })
                }
              />
            </div>
          ))}
        {tab === 'interpretations' &&
          scaleIds.map((s) => (
            <section className="panel editor-row" key={s}>
              <h2>{value.scales[s].label}</h2>
              {(['low', 'medium', 'high'] as const).map((l) => (
                <label className="form-label" key={l}>
                  {levelLabels[l]}
                  {t('text213')}
                  <textarea
                    value={value.scales[s].interpretations[l]}
                    onChange={(e) =>
                      edit((c) => {
                        c.scales[s].interpretations[l] = e.target.value;
                      })
                    }
                  />
                </label>
              ))}
            </section>
          ))}
        {tab === 'recommendations' &&
          value.recommendations.map((r, i) => (
            <section key={r.id} className="panel editor-row">
              <span className="eyebrow">
                {value.scales[r.scale].label} · {levelLabels[r.level]}
              </span>
              <label className="form-label">
                {t('text214')}
                <input
                  value={r.title}
                  onChange={(e) =>
                    edit((c) => {
                      c.recommendations[i].title = e.target.value;
                    })
                  }
                />
              </label>
              <label className="form-label">
                {t('text215')}
                <textarea
                  value={r.text}
                  onChange={(e) =>
                    edit((c) => {
                      c.recommendations[i].text = e.target.value;
                    })
                  }
                />
              </label>
              <div className="two-columns">
                <label className="form-label">
                  {t('text216')}
                  <input
                    type="number"
                    value={r.durationDays}
                    onChange={(e) =>
                      edit((c) => {
                        c.recommendations[i].durationDays = Number(e.target.value);
                      })
                    }
                  />
                </label>
                <label className="form-label">
                  {t('text217')}
                  <input
                    value={r.link}
                    onChange={(e) =>
                      edit((c) => {
                        c.recommendations[i].link = e.target.value;
                      })
                    }
                  />
                </label>
              </div>
            </section>
          ))}
        {tab === 'settings' && (
          <div className="panel editor-row">
            <h2>{t('text218')}</h2>
            <label className="form-label">
              {t('text219')}
              <input
                type="number"
                value={value.thresholds.medium}
                onChange={(e) =>
                  edit((c) => {
                    c.thresholds.medium = Number(e.target.value);
                  })
                }
              />
            </label>
            <label className="form-label">
              {t('text220')}
              <input
                type="number"
                value={value.thresholds.high}
                onChange={(e) =>
                  edit((c) => {
                    c.thresholds.high = Number(e.target.value);
                  })
                }
              />
            </label>
            <label className="form-label">
              {t('text221')}
              <input
                type="number"
                value={value.retakeDays}
                onChange={(e) =>
                  edit((c) => {
                    c.retakeDays = Number(e.target.value);
                  })
                }
              />
            </label>
            <p className="muted">{t('text222')}</p>
          </div>
        )}
        {tab === 'json' && (
          <textarea
            className="json-editor"
            aria-label={t('text223')}
            spellCheck={false}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
        )}
      </fieldset>
      <Disclaimer />
    </>
  );
}
