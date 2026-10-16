import type { AvatarConfig, Archetype, Scale } from './index.js';
const archetypes: Record<Archetype, { animal: string; name: string; prop: string; ru: string }> = {
  strategist: {
    animal: 'fox',
    name: 'Лис',
    ru: 'стратег',
    prop: 'tablet with a blueprint and round glasses',
  },
  leader: {
    animal: 'lion',
    name: 'Лев',
    ru: 'лидер',
    prop: 'radio and short cape, confident upright pose',
  },
  master: {
    animal: 'beaver',
    name: 'Бобёр',
    ru: 'мастер',
    prop: 'tool and checklist-shaped shield',
  },
  mentor: {
    animal: 'bear',
    name: 'Медведь',
    ru: 'наставник',
    prop: 'welcoming hand gesture and mentor badge',
  },
};
const accessories: Record<Scale, string> = {
  critical: 'blueprint insignia',
  confidence: 'radio insignia',
  discipline: 'checklist insignia',
  engagement: 'mentor insignia',
};
const palettes = {
  bright: ['#f07b47', '#ffc64c'],
  strict: ['#3d485c', '#c5cedc'],
  calm: ['#60a39b', '#d5e9c9'],
  tech: ['#6376e8', '#8de3ef'],
};
export function avatarName(c: AvatarConfig) {
  const a = archetypes[c.archetype];
  return `${c.universe === 'animals' ? a.name : { cinema: 'Герой', anime: 'Искра', sport: 'Чемпион', fantasy: 'Хранитель' }[c.universe]}-${a.ru}`;
}
export function buildAvatar(c: AvatarConfig) {
  const a = archetypes[c.archetype],
    palette = palettes[c.style];
  if (!a || !palette || !accessories[c.accessory]) throw new Error('Неверная конфигурация аватара');
  const universe = {
    animals: `anthropomorphic ${a.animal}`,
    cinema: 'original cinematic adventure mascot, no existing film characters',
    anime: 'original anime-inspired mascot, clean cel shading',
    sport: 'original athletic mascot, no real athletes or team emblems',
    fantasy: 'original fantasy adventurer mascot',
  }[c.universe];
  const prompt = `Original mascot character, ${universe}, ${c.archetype} archetype, ${c.gender} gender body variant, ${c.style} style, ${palette.join(' and ')} palette, safety helmet with the BI emblem only, high-visibility vest, ${a.prop}, ${accessories[c.accessory]} accessory, ${c.boosted ? 'glowing achievement badge' : 'standard edition'}, friendly confident pose, full body, three-quarter front view, consistent compact proportions, refined flat vector illustration, warm plain background, no other text, no foreign logos, no real people, no existing characters, safe for work.`;
  const ears =
    c.universe === 'animals'
      ? c.archetype === 'strategist'
        ? '<path d="M116 133 99 73 159 108M202 108 261 73 244 137" fill="#d87749" stroke="#323749" stroke-width="5"/>'
        : '<circle cx="121" cy="119" r="25" fill="#bd8b68"/><circle cx="239" cy="119" r="25" fill="#bd8b68"/>'
      : '';
  const face =
    c.universe === 'animals' ? (c.archetype === 'strategist' ? '#ed9b65' : '#bd8b68') : '#efbe9c';
  const faceDetails =
    c.universe === 'animals'
      ? '<path d="M127 160Q180 231 233 160Q225 223 180 226Q135 223 127 160" fill="#fff0d7"/>'
      : '';
  const hair =
    c.gender === 'female'
      ? '<path d="M121 134q-19 69 0 111l23-21-7-89M239 134q19 69 0 111l-23-21 7-89" fill="#443852"/>'
      : c.gender === 'male'
        ? '<path d="M148 203q32 25 64 0l-11 25h-42z" fill="#694839"/>'
        : '';
  const prop =
    c.archetype === 'strategist'
      ? '<g transform="rotate(-10 236 285)"><rect x="198" y="248" width="83" height="105" rx="9" fill="#343d57"/><rect x="205" y="258" width="69" height="83" rx="3" fill="#b8e9f3"/><path d="m217 317 0-43 45 0 0 43zm0-20 45 0m-23-23v43" fill="none" stroke="#586eb3" stroke-width="3"/></g>'
      : c.archetype === 'leader'
        ? '<rect x="223" y="249" width="35" height="68" rx="7" fill="#343d57"/><path d="M245 250v-32m-14 49h20m-20 10h20" stroke="#95d9dd" stroke-width="4"/>'
        : c.archetype === 'master'
          ? '<path d="M220 252h58v61q-29 31-58 0z" fill="#d6ebef" stroke="#4d637b" stroke-width="5"/><path d="m230 280 8 8 18-20m-26 35h28" stroke="#65a59b" stroke-width="5" fill="none"/>'
          : '<path d="M236 262q20-58 44-52l-4 45-25 25" fill="#efbe9c" stroke="#323749" stroke-width="4"/>';
  const motif =
    c.universe === 'fantasy'
      ? `<path d="M114 243 76 365l91-29m79-93 38 122-91-29" fill="${palette[0]}" opacity=".5"/>`
      : c.universe === 'sport'
        ? '<path d="M154 249q26 39 52 0" stroke="#ffc64c" stroke-width="7" fill="none"/><circle cx="180" cy="282" r="12" fill="#ffc64c"/>'
        : c.universe === 'anime'
          ? '<path d="m102 213-19 25 25 1m150-26 19 25-25 1" fill="#b1b9f8"/>'
          : '';
  const glasses =
    c.archetype === 'strategist'
      ? '<g fill="none" stroke="#343d57" stroke-width="5"><circle cx="154" cy="163" r="17"/><circle cx="206" cy="163" r="17"/><path d="M171 161h18"/></g>'
      : '';
  const symbol = {
    critical: 'M128 278h24v28h-24zm8 8h8m-8 8h8',
    confidence: 'M130 280h20v25h-20zm15 0v-9',
    discipline: 'm130 290 7 7 14-20',
    engagement: 'M140 277v29m-14-15h28',
  }[c.accessory];
  const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 430" role="img" aria-label="${avatarName(c)}"><ellipse cx="180" cy="390" rx="102" ry="15" fill="#cbc8de" opacity=".35"/><circle cx="180" cy="194" r="140" fill="${palette[0]}" opacity=".08"/>${motif}<path d="M136 324 128 379q18 13 42 0l10-61 10 61q24 13 42 0l-8-55" fill="#424c67"/><path d="M127 371h44v17h-56q-7-12 12-17m62 0h43q19 5 12 17h-55" fill="#2c344c"/>${ears}${hair}<rect x="123" y="108" width="114" height="119" rx="53" fill="${face}"/>${faceDetails}<path d="M122 238q-32 7-36 63l25 10 24-48m103-25q23 9 26 43l-24 10-15-38" fill="${palette[0]}"/><path d="M126 230q54-17 108 0l8 111q-62 24-124 0z" fill="${palette[0]}"/><path d="M143 229v113m74-113v113M122 314h117" stroke="#e6f4d2" stroke-width="10"/><path d="M180 232v114" stroke="#343d57" stroke-width="3"/><path d="${symbol}" stroke="#fff" stroke-width="3" fill="none"/><circle cx="154" cy="164" r="4" fill="#30344a"/><circle cx="206" cy="164" r="4" fill="#30344a"/>${glasses}<path d="m175 184 5 5 5-5m-18 15q13 12 26 0" fill="none" stroke="#624635" stroke-width="3" stroke-linecap="round"/><path d="M114 132q-3-70 66-70t66 70" fill="#ffd36c" stroke="#dba94b" stroke-width="4"/><path d="M104 131h152" stroke="#edb952" stroke-width="13" stroke-linecap="round"/><path d="M174 68v55m12-55v55" stroke="#ffe7a3" stroke-width="5"/><rect x="163" y="93" width="34" height="23" rx="5" fill="#34364b"/><text x="180" y="110" text-anchor="middle" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="white">BI</text>${prop}${c.boosted ? '<g transform="translate(265 115)"><circle r="26" fill="#f8d16b" opacity=".25"/><path d="m0-20 6 13 14 7-14 6-6 14-6-14-14-6 14-7z" fill="#ecb94b"/></g>' : ''}</svg>`;
  return { prompt, fallbackSvg };
}
