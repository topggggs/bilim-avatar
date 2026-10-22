import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  buildAvatar,
  lookOptions,
  resolveLook,
  type AvatarConfig,
  type Look,
} from '../../../packages/core/src/index';
import { api } from './api';
import { hasKey, t, type Key } from './localization';
import type { AvatarView } from './shared';
const styles = ['bright', 'strict', 'calm', 'tech'] as const;
type Style = (typeof styles)[number];
const styleLabels: Record<Style, Key> = {
  bright: 'text159',
  strict: 'text160',
  calm: 'text161',
  tech: 'text162',
};
const swatches: Record<string, string> = {
  bright: '#f07b47',
  strict: '#3d485c',
  calm: '#60a39b',
  tech: '#6376e8',
  sky: '#bcd0fd',
  sunset: '#ffbca6',
  mint: '#b2e6d1',
  night: '#1b2457',
  light: '#f7d7bf',
  medium: '#ebb894',
  tan: '#c98d64',
  deep: '#8a5a3c',
};
const label = (part: string, value: string) => {
  const key = `avatar.option.${part}.${value}`;
  return hasKey(key) ? t(key) : value;
};
export default function AvatarEditor({
  avatar,
  variant,
  onClose,
  onSaved,
}: {
  avatar: AvatarView;
  variant: number;
  onClose: () => void;
  onSaved: (avatar: AvatarView) => void;
}) {
  const config = avatar.config as AvatarConfig;
  const [look, setLook] = useState<Look>(() => resolveLook(config, variant));
  const [style, setStyle] = useState<Style>(config.style);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const preview = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildAvatar({ ...config, style, look }).fallbackSvg)}`;
  const parts = (Object.keys(lookOptions) as (keyof Look)[]).filter(
    (part) => part !== 'skin' || config.universe !== 'animals',
  );
  async function save() {
    setBusy(true);
    setError('');
    try {
      onSaved(await api<AvatarView>(`/avatars/${avatar.id}/look`, 'PUT', { look, style }));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  const option = (selected: boolean, text: string, onClick: () => void, swatch?: string) => (
    <button
      key={text}
      type="button"
      className="look-option"
      aria-pressed={selected}
      onClick={onClick}
    >
      {swatch && <i style={{ background: swatch }} aria-hidden="true" />}
      {text}
    </button>
  );
  return (
    <dialog
      ref={dialog}
      className="avatar-editor"
      aria-labelledby="avatar-editor-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="avatar-editor-preview">
        <img src={preview} alt={t('avatar.preview')} />
      </div>
      <div className="avatar-editor-body">
        <div className="avatar-editor-head">
          <div>
            <h2 id="avatar-editor-title">{t('avatar.editorTitle')}</h2>
            <p>{t('avatar.editorHint')}</p>
          </div>
          <button
            type="button"
            className="avatar-editor-close"
            aria-label={t('text101')}
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="avatar-editor-groups">
          {parts.map((part) => (
            <fieldset key={part} className="look-group">
              <legend>{t(`avatar.part.${part}` as Key)}</legend>
              <div>
                {lookOptions[part].map((value) =>
                  option(
                    look[part] === value,
                    label(part, value),
                    () => setLook({ ...look, [part]: value }),
                    swatches[value],
                  ),
                )}
              </div>
            </fieldset>
          ))}
          <fieldset className="look-group">
            <legend>{t('avatar.part.style')}</legend>
            <div>
              {styles.map((value) =>
                option(
                  style === value,
                  t(styleLabels[value]),
                  () => setStyle(value),
                  swatches[value],
                ),
              )}
            </div>
          </fieldset>
        </div>
        {error && (
          <div className="field-error" role="alert">
            {error}
          </div>
        )}
        <div className="avatar-editor-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            {t('rank.cancel')}
          </button>
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? t('auth.wait') : t('avatar.save')}
          </button>
        </div>
      </div>
    </dialog>
  );
}
