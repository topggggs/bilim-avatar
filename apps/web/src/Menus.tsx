import { Check, ChevronDown, Globe, LogOut, Moon, Sun, UserRound } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FocusEvent } from 'react';
import { languages, setLanguage, t, useLanguage } from './localization';
import { setTheme, useTheme } from './theme';
// Keep a stable label; aria-pressed reports the dark state.
export function ThemeToggle({ inMenu = false }: { inMenu?: boolean }) {
  const dark = useTheme() === 'dark';
  const label = t('header.darkTheme');
  return (
    <button
      className={inMenu ? 'user-theme' : 'theme-toggle'}
      aria-pressed={dark}
      aria-label={inMenu ? undefined : label}
      title={inMenu ? undefined : label}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark && !inMenu ? (
        <Sun size={17} aria-hidden="true" />
      ) : (
        <Moon size={17} aria-hidden="true" />
      )}
      {inMenu && label}
    </button>
  );
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const onBlur = (e: FocusEvent) => {
    if (!root.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
  };
  return { open, setOpen, root, trigger, onBlur };
}
export function LanguageMenu() {
  const language = useLanguage();
  const { open, setOpen, root, trigger, onBlur } = usePopover();
  const id = useId();
  const current = languages.find((l) => l.id === language)!;
  return (
    <div className="popover" ref={root} onBlur={onBlur}>
      <button
        ref={trigger}
        className="language-trigger"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${t('header.language')}: ${current.name} (${current.code})`}
        onClick={() => setOpen(!open)}
      >
        <Globe size={16} aria-hidden="true" />
        <span>{current.code}</span>
        <ChevronDown size={14} aria-hidden="true" className="chevron" />
      </button>
      {open && (
        <div className="popover-panel language-panel" id={id}>
          {languages.map((l) => (
            <button
              key={l.id}
              lang={l.id}
              aria-current={l.id === language ? 'true' : undefined}
              onClick={() => {
                setLanguage(l.id);
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              <span className="language-code">{l.code}</span>
              <span>{l.name}</span>
              {l.id === language && <Check size={16} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase() || '?';
export function UserMenu({
  name,
  detail,
  onProfile,
  onLogout,
}: {
  name: string;
  detail: string;
  onProfile?: () => void;
  onLogout: () => void;
}) {
  const { open, setOpen, root, trigger, onBlur } = usePopover();
  const id = useId();
  return (
    <div className="popover" ref={root} onBlur={onBlur}>
      <button
        ref={trigger}
        className="user-trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span className="user-avatar" aria-hidden="true">
          {initials(name)}
        </span>
        <span className="user-name">{name}</span>
        <ChevronDown size={16} aria-hidden="true" className="chevron" />
      </button>
      {open && (
        <div className="popover-panel user-panel" id={id}>
          <div className="user-card">
            <span className="user-avatar large" aria-hidden="true">
              {initials(name)}
            </span>
            <div>
              <strong>{name}</strong>
              <span>{detail}</span>
            </div>
          </div>
          {onProfile && (
            <button
              onClick={() => {
                setOpen(false);
                onProfile();
              }}
            >
              <UserRound size={17} aria-hidden="true" />
              {t('text006')}
            </button>
          )}
          <ThemeToggle inMenu />
          <button
            className="user-logout"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <LogOut size={17} aria-hidden="true" />
            {t('text014')}
          </button>
        </div>
      )}
    </div>
  );
}
