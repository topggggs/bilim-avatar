import { useState } from 'react';
import { avatarCatalog, buildAvatar, type Appearance } from '../../../../packages/core/src/index';
import features from '../../../../config/features.ru.json';
const copy = features.avatars;
export const universeNames = copy.universes;
export const svgImage = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
export default function Avatars({
  onSelect,
  canStart,
}: {
  onSelect: (appearance: Appearance) => void;
  canStart: boolean;
}) {
  const [universe, setUniverse] = useState<Appearance['universe'] | 'all'>('all');
  const [style, setStyle] = useState<Appearance['style']>('tech');
  const [gender, setGender] = useState<Appearance['gender']>('neutral');
  return (
    <div className="avatars-page">
      <div className="page-title">
        <div>
          <h1>{copy.title}</h1>
          <p className="muted">{copy.description}</p>
        </div>
      </div>
      <div className="avatar-toolbar panel">
        <div className="universe-filters" role="group" aria-label={copy.universeLabel}>
          <button aria-pressed={universe === 'all'} onClick={() => setUniverse('all')}>
            {copy.all}
          </button>
          {Object.entries(universeNames).map(([id, name]) => (
            <button
              key={id}
              aria-pressed={universe === id}
              onClick={() => setUniverse(id as Appearance['universe'])}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="avatar-options">
          <label>
            {copy.styleLabel}
            <select
              aria-label={copy.styleLabel}
              value={style}
              onChange={(e) => setStyle(e.target.value as Appearance['style'])}
            >
              {Object.entries(copy.styles).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {copy.genderLabel}
            <select
              aria-label={copy.genderLabel}
              value={gender}
              onChange={(e) => setGender(e.target.value as Appearance['gender'])}
            >
              {Object.entries(copy.genders).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="avatar-catalog">
        {avatarCatalog
          .filter((a) => universe === 'all' || a.universe === universe)
          .map((entry) => (
            <article className="avatar-catalog-card panel" key={entry.id}>
              <div className="avatar-catalog-art">
                <img
                  src={svgImage(buildAvatar({ ...entry.config, style, gender }).fallbackSvg)}
                  alt={entry.name}
                  loading="lazy"
                />
              </div>
              <span>{universeNames[entry.universe]}</span>
              <h2>{entry.name}</h2>
              {canStart && (
                <button
                  className="text-button"
                  onClick={() => onSelect({ universe: entry.universe, style, gender })}
                >
                  {copy.selectUniverse}
                </button>
              )}
            </article>
          ))}
      </div>
    </div>
  );
}
