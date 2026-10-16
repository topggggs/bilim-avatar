import type { AvatarConfig, Archetype, Scale } from './index.js';

type Universe = AvatarConfig['universe'];
type Character = { name: string; subject: string; face: string; hair: string };
const characters: Record<Universe, Record<Archetype, Character>> = {
  animals: {
    strategist: {
      name: 'Лис',
      subject: 'anthropomorphic red fox',
      face: '#d7864e',
      hair: '#75452e',
    },
    leader: {
      name: 'Лев',
      subject: 'anthropomorphic lion with a sculpted mane',
      face: '#d8a157',
      hair: '#8d5637',
    },
    master: {
      name: 'Бобёр',
      subject: 'anthropomorphic beaver with a broad tail',
      face: '#ac7956',
      hair: '#624333',
    },
    mentor: {
      name: 'Медведь',
      subject: 'anthropomorphic friendly brown bear',
      face: '#a77858',
      hair: '#664c3d',
    },
  },
  cinema: {
    strategist: {
      name: 'Скаут',
      subject: 'original cinematic expedition scout with a field tablet',
      face: '#cf9a78',
      hair: '#403f49',
    },
    leader: {
      name: 'Командор',
      subject: 'original cinematic rescue captain with a short shoulder cape',
      face: '#a97454',
      hair: '#393541',
    },
    master: {
      name: 'Механик',
      subject: 'original cinematic expedition mechanic with utility gauntlets',
      face: '#e2b394',
      hair: '#685142',
    },
    mentor: {
      name: 'Проводник',
      subject: 'original cinematic mountain guide with a field backpack',
      face: '#be8968',
      hair: '#564139',
    },
  },
  anime: {
    strategist: {
      name: 'Орион',
      subject: 'original anime-inspired analyst with angular indigo hair',
      face: '#eac1a6',
      hair: '#465477',
    },
    leader: {
      name: 'Вега',
      subject: 'original anime-inspired team captain with swept copper hair',
      face: '#d7a381',
      hair: '#8f5b40',
    },
    master: {
      name: 'Кварц',
      subject: 'original anime-inspired inventor with cropped silver hair',
      face: '#c99575',
      hair: '#73818b',
    },
    mentor: {
      name: 'Луч',
      subject: 'original anime-inspired guide with a soft teal bob',
      face: '#e5b797',
      hair: '#48747a',
    },
  },
  sport: {
    strategist: {
      name: 'Штурман',
      subject: 'original athletic navigator in a technical base layer',
      face: '#ba886b',
      hair: '#403d43',
    },
    leader: {
      name: 'Атлет',
      subject: 'original athletic team captain with broad balanced shoulders',
      face: '#96664f',
      hair: '#332e35',
    },
    master: {
      name: 'Техник',
      subject: 'original athletic equipment technician with fitted elbow guards',
      face: '#dfad8b',
      hair: '#704d39',
    },
    mentor: {
      name: 'Тренер',
      subject: 'original athletic coach with a training stopwatch',
      face: '#c68d6a',
      hair: '#555664',
    },
  },
  fantasy: {
    strategist: {
      name: 'Смотритель',
      subject: 'original fantasy cartographer with pointed ears and a map tablet',
      face: '#c8b6a1',
      hair: '#5d617b',
    },
    leader: {
      name: 'Страж',
      subject: 'original fantasy guardian with rounded shoulder armor and a short cape',
      face: '#ba9478',
      hair: '#3f4d5d',
    },
    master: {
      name: 'Кузнец',
      subject: 'original fantasy artisan with a leather apron and a brass tool',
      face: '#d29c74',
      hair: '#7b4e39',
    },
    mentor: {
      name: 'Хранитель',
      subject: 'original fantasy woodland guide with pointed ears and a soft cloak',
      face: '#aeb9a3',
      hair: '#506b61',
    },
  },
};
const archetypes: Record<Archetype, { ru: string; prop: string; accessory: Scale }> = {
  strategist: {
    ru: 'стратег',
    prop: 'blueprint tablet and round glasses, thoughtful upright stance',
    accessory: 'critical',
  },
  leader: { ru: 'лидер', prop: 'handheld radio, confident open stance', accessory: 'confidence' },
  master: {
    ru: 'мастер',
    prop: 'checklist shield and compact wrench, grounded working stance',
    accessory: 'discipline',
  },
  mentor: {
    ru: 'наставник',
    prop: 'open welcoming hand and a field notebook, approachable stance',
    accessory: 'engagement',
  },
};
const accessories: Record<Scale, string> = {
  critical: 'small blueprint patch on the vest',
  confidence: 'small radio patch on the vest',
  discipline: 'small checklist patch on the vest',
  engagement: 'small mentoring patch on the vest',
};
const palettes = {
  bright: { main: '#dc6d43', light: '#f0b96b', dark: '#8c493c', vest: '#ed9942', bg: '#f8e7d9' },
  strict: { main: '#465570', light: '#acbac9', dark: '#29374d', vest: '#dfad4d', bg: '#e7ecf2' },
  calm: { main: '#57847b', light: '#b9d2b5', dark: '#355d58', vest: '#bad16d', bg: '#e7eee4' },
  tech: { main: '#4561bd', light: '#9ac8dc', dark: '#2d3c75', vest: '#eca14e', bg: '#e5ebf8' },
} as const;

function validate(c: AvatarConfig) {
  if (
    !c ||
    !Object.hasOwn(characters, c.universe) ||
    !Object.hasOwn(archetypes, c.archetype) ||
    !Object.hasOwn(palettes, c.style) ||
    !Object.hasOwn(accessories, c.accessory) ||
    !['male', 'female', 'neutral'].includes(c.gender) ||
    typeof c.boosted !== 'boolean'
  )
    throw new Error('Неверная конфигурация аватара');
}

/** Original characters only. The same configurations are accepted by the generation API. */
export const avatarCatalog: readonly Readonly<{
  id: string;
  universe: Universe;
  archetype: Archetype;
  name: string;
  config: Readonly<AvatarConfig>;
}>[] = Object.freeze(
  (Object.entries(characters) as [Universe, Record<Archetype, Character>][]).flatMap(
    ([universe, entries]) =>
      (Object.keys(entries) as Archetype[]).map((archetype) =>
        Object.freeze({
          id: `${universe}-${archetype}`,
          universe,
          archetype,
          name: `${entries[archetype].name}-${archetypes[archetype].ru}`,
          config: Object.freeze({
            universe,
            gender: 'neutral' as const,
            style: 'tech' as const,
            archetype,
            accessory: archetypes[archetype].accessory,
            boosted: false,
          }),
        }),
      ),
  ),
);

export function avatarName(c: AvatarConfig) {
  validate(c);
  return `${characters[c.universe][c.archetype].name}-${archetypes[c.archetype].ru}`;
}

/** No user text enters the prompt or SVG: every interpolated value is allowlisted. */
export function buildAvatar(c: AvatarConfig) {
  validate(c);
  const a = archetypes[c.archetype];
  const person = characters[c.universe][c.archetype];
  const p = palettes[c.style];
  const prompt = `Original mascot character, ${person.subject}, ${c.archetype} archetype, ${c.gender} gender body variant, ${c.style} style, ${p.main} and ${p.light} palette, safety helmet with the BI emblem only, high-visibility vest with reflective strips, ${a.prop}, ${accessories[c.accessory]}, ${c.boosted ? 'enhanced edition with subtle gold trim on helmet and equipment' : 'standard edition'}, full body, three-quarter front view, consistent compact proportions, premium editorial vector illustration with restrained dimensional shading, warm plain background, no floating stickers or decorative icons, no other text, no foreign logos, no real people, no existing characters, safe for work.`;
  const animal = c.universe === 'animals';
  const shoulder = c.gender === 'male' ? 123 : c.gender === 'female' ? 137 : 130;
  const outer = 360 - shoulder;
  const pants = c.universe === 'sport' ? '#3d4b64' : '#35445b';
  const faceShape =
    animal && c.archetype === 'master'
      ? '<path d="M125 127q55-31 110 0v56q-1 46-55 47-54-1-55-47z" fill="FACE"/>'
      : animal && c.archetype === 'mentor'
        ? '<path d="M122 125q58-30 116 0l2 54q-3 52-60 52t-60-52z" fill="FACE"/>'
        : '<path d="M130 122q50-34 100 0v55q-2 45-50 48-48-3-50-48z" fill="FACE"/>';
  const animalSilhouette = !animal
    ? ''
    : {
        strategist: `<path d="M126 120 108 53l52 46m74 22 19-68-53 46" fill="${person.face}"/><path d="m125 95-7-24 25 20m92 4 7-24-25 20" fill="#543c3c"/><path d="M224 320q76-10 58-80 39 49 14 91-18 27-68 21" fill="${person.face}"/><path d="M282 240q25 37 14 57l-18-16q12-19 4-41" fill="#fff0d8"/>`,
        leader: `<path d="m123 119-14-27 25-19 4-21 27 9 17-14 23 16 29-3 8 30 19 19-20 22 8 22-18 33-20-5-26 21-28-17-27 3-6-29-18-20z" fill="${person.hair}"/><circle cx="127" cy="112" r="19" fill="${person.face}"/><circle cx="233" cy="112" r="19" fill="${person.face}"/>`,
        master: `<path d="M225 324q68-61 80-1 3 26-64 34" fill="#7c563e"/><path d="m255 311 25 27m-39-11 24 22m6-45 23 25m-49 8 39-26m-28 39 39-26" fill="none" stroke="#926d50" stroke-width="3"/><circle cx="129" cy="118" r="17" fill="${person.face}"/><circle cx="231" cy="118" r="17" fill="${person.face}"/>`,
        mentor: `<circle cx="128" cy="111" r="23" fill="${person.face}"/><circle cx="232" cy="111" r="23" fill="${person.face}"/><circle cx="128" cy="111" r="12" fill="${person.hair}"/><circle cx="232" cy="111" r="12" fill="${person.hair}"/>`,
      }[c.archetype];
  const backdrop =
    c.universe === 'fantasy'
      ? `<path d="M131 231q-34 23-49 111l62-12 36 26 38-26 60 12q-13-89-49-111" fill="${p.dark}"/><path d="m131 248-32 82 43-9m87-73 32 82-43-9" fill="none" stroke="${p.light}" stroke-width="3" opacity=".5"/>`
      : c.universe === 'cinema'
        ? c.archetype === 'mentor'
          ? `<rect x="105" y="224" width="151" height="107" rx="35" fill="${p.dark}"/><path d="M118 243h-10v54h13m121-54h12v54h-13" fill="none" stroke="${p.light}" stroke-width="6"/>`
          : `<path d="M136 229 99 328l42-8 38 22 48-18 35 1-33-96" fill="${p.dark}"/>`
        : '';
  const ears =
    c.universe === 'fantasy'
      ? `<path d="m132 143-21-12 10 34 14 4m93-26 21-12-10 34-14 4" fill="${person.face}"/>`
      : !animal
        ? `<ellipse cx="132" cy="158" rx="10" ry="16" fill="${person.face}"/><ellipse cx="228" cy="158" rx="10" ry="16" fill="${person.face}"/>`
        : '';
  const hairBack = animal
    ? ''
    : c.gender === 'female'
      ? `<path d="M129 124q-19 37-6 104l25-12-5-79m87-13q19 37 6 104l-25-12 5-79" fill="${person.hair}"/>`
      : c.gender === 'neutral'
        ? `<path d="M128 126q-12 17-10 44l17 8 9-48m87-4q12 17 10 44l-17 8-9-48" fill="${person.hair}"/>`
        : `<path d="M128 126v37l13 7 5-44m86 0v37l-13 7-5-44" fill="${person.hair}"/>`;
  const fringe = animal
    ? ''
    : c.universe === 'anime'
      ? `<path d="m132 132 18-12 3 20 23-16 3 17 24-21 25 13-9-30h-78z" fill="${person.hair}"/>`
      : `<path d="M132 132q21-22 44-12l-12 13q35-2 64-2l-8-26h-80z" fill="${person.hair}"/>`;
  const muzzle = !animal
    ? ''
    : c.archetype === 'strategist'
      ? '<path d="M130 165q26 18 50 21 24-3 50-21-7 52-50 57-43-5-50-57" fill="#f4e4cc"/><path d="m169 186 11 9 11-9z" fill="#3a3942"/>'
      : `<ellipse cx="180" cy="191" rx="${c.archetype === 'master' ? 38 : 33}" ry="27" fill="#e7cda6"/><path d="M170 180q10-8 20 0l-4 8h-12z" fill="#3d3a3e"/>${c.archetype === 'master' ? '<path d="M172 200h16v14h-16z" fill="#fff7e9"/><path d="M180 200v14" stroke="#b6a88f" stroke-width="2"/>' : ''}`;
  const raisedArm = c.archetype === 'mentor';
  const arms = raisedArm
    ? `<path d="M${shoulder + 9} 236q-28 4-37 52l24 8 26-38M${outer - 5} 236q17-4 30 11l15-38 22 8q-6 62-39 59l-31-22" fill="${p.main}"/><path d="M268 219v-29q0-8 6-6l2 15 2-24q1-8 6-5l1 28 4-21q2-6 6-3l-1 28 6-11q4-5 7 0l-8 24q-10 14-31 4" fill="${person.face}"/><path d="m275 204 11 8" stroke="#8f6c5c" stroke-width="2" fill="none"/>`
    : `<path d="M${shoulder + 10} 235q-31 2-39 55l25 9 26-41M${outer - 10} 235q31 2 39 55l-25 9-26-41" fill="${p.main}"/><path d="m102 286 21 7-5 21q-16 9-25-6z" fill="${person.face}"/>`;
  const sportDetails =
    c.universe === 'sport'
      ? `<path d="m107 265 20 7m115-7-20 7" stroke="${p.light}" stroke-width="7"/><path d="m144 353 12 27m47-27 12 27" stroke="${p.light}" stroke-width="5"/>${c.archetype === 'mentor' ? '<path d="m166 228 14 35 14-35" fill="none" stroke="#e9dfc5" stroke-width="3"/><circle cx="180" cy="267" r="8" fill="#253c5a" stroke="#e9dfc5" stroke-width="2"/>' : ''}`
      : '';
  const vest = `<path d="M${shoulder} 235 153 223 180 236 207 223 ${outer} 235 ${outer + 7} 340Q180 360 ${shoulder - 7} 340z" fill="${p.vest}"/><path d="M157 228v111m46-111v111M130 315h100" stroke="#eff1d7" stroke-width="8"/><path d="m165 223 15 13 15-13m-15 13v110" fill="none" stroke="${p.dark}" stroke-width="3"/><path d="M136 292h15v15h-15m73-15h15v15h-15" fill="${p.dark}" opacity=".35"/>`;
  const accessorySymbol = {
    critical: '<path d="M133 259h17v22h-17zm5 7h7m-7 7h7"/>',
    confidence: '<path d="M135 260h13v21h-13zm9 0v-7m-5 14h5m-5 6h5"/>',
    discipline: '<path d="m133 268 6 7 12-17"/>',
    engagement: '<circle cx="141" cy="262" r="4"/><path d="M133 279v-5q8-8 16 0v5"/>',
  }[c.accessory];
  const prop = {
    strategist: `<g transform="rotate(-8 231 291)"><rect x="192" y="246" width="79" height="98" rx="8" fill="#293c58"/><rect x="198" y="253" width="67" height="82" rx="3" fill="#cce5e9"/><path d="M209 268h44v52h-44zm0 19h44m-24-19v52m-20-12h25m11-21v21" stroke="#648694" stroke-width="2" fill="none"/><circle cx="231" cy="339" r="2" fill="#829bb1"/></g><path d="m255 293 12-1q12 1 9 11l-12 14-8-2" fill="${person.face}"/>`,
    leader: `<g transform="rotate(9 247 261)"><rect x="229" y="230" width="35" height="63" rx="6" fill="#2d3c54"/><path d="M254 230v-24" stroke="#2d3c54" stroke-width="5" stroke-linecap="round"/><rect x="235" y="238" width="23" height="17" rx="2" fill="${p.light}"/><path d="M237 264h17m-17 7h17m-17 7h17" stroke="#7e92a8" stroke-width="2"/></g><path d="m249 278 18-4q13 4 8 15l-19 13-10-9" fill="${person.face}"/>`,
    master: `<path d="M224 251h52v63q-8 19-26 25-19-6-26-25z" fill="#d4e3db" stroke="${p.dark}" stroke-width="4"/><path d="m233 272 5 5 9-11m-14 27 5 5 9-11m4-15h15m-15 21h15m-33 18h33" fill="none" stroke="#587c74" stroke-width="3"/><path d="m99 296 16-19-1-13 8-8 3 13 8-1-10 13-16 22" fill="#9da8b2" stroke="#485f72" stroke-width="2"/><path d="m259 306 14-5q11 0 9 9l-12 16-12-5" fill="${person.face}"/>`,
    mentor: `<g transform="rotate(7 121 305)"><rect x="95" y="278" width="47" height="64" rx="4" fill="${p.dark}"/><path d="M105 284v52m10-43h17m-17 10h17m-17 10h12" stroke="${p.light}" stroke-width="2"/></g><path d="m95 301 15-4q9 4 6 13l-14 8-9-5" fill="${person.face}"/>`,
  }[c.archetype];
  const glasses =
    c.archetype === 'strategist'
      ? '<g fill="none" stroke="#35435b" stroke-width="3.5"><rect x="137" y="149" width="31" height="25" rx="11"/><rect x="192" y="149" width="31" height="25" rx="11"/><path d="M168 159h24m-55-2-7-3m93 3 7-3"/></g>'
      : '';
  const enhanced = c.boosted
    ? '<path d="M113 121h134" stroke="#ce9e45" stroke-width="4" stroke-linecap="round"/><path d="M129 340q51 19 102 0" stroke="#ce9e45" stroke-width="4" fill="none"/><path d="M173 91h14v23h-14z" fill="none" stroke="#f1d083" stroke-width="2"/>'
    : '';
  const helmet = `<path d="M119 121v-10q0-54 61-54t61 54v10" fill="#f3cb73"/><path d="M180 57q-31 3-37 58h-24q-2-51 61-58" fill="#f8dc98"/><path d="M180 57q42 8 43 58h18q1-53-61-58" fill="#dcac55"/><path d="M174 61v52m12-52v52" stroke="#fce7b3" stroke-width="5"/><path d="M111 122h138" stroke="#e8b760" stroke-width="12" stroke-linecap="round"/><rect x="165" y="84" width="30" height="25" rx="5" fill="#304fe5"/><path d="M171 90h4q7 0 2 6 7 1 3 7h-9zm4 5h1q3-3-1-3zm0 6h2q3-3-2-3zm9-11h3v13h-3z" fill="#fff"/>`;
  const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 430" role="img" aria-label="${avatarName(c)}"><title>${avatarName(c)}</title><rect width="360" height="430" rx="36" fill="#fafbfc"/><path d="M51 202q0-126 129-126t129 126q0 131-129 131T51 202" fill="${p.bg}"/><ellipse cx="180" cy="390" rx="103" ry="13" fill="#293c58" opacity=".11"/>${animalSilhouette}${backdrop}<path d="m142 321-8 52 31 7 15-49 15 49 31-7-8-52" fill="${pants}"/><path d="m149 344-5 25m66-25 6 25" stroke="#68768a" stroke-width="3"/><path d="m134 370 31 6 1 14h-48q-5-12 16-20m61 6 31-6q21 8 16 20h-48z" fill="#26364b"/><path d="M118 388h48m28 0h48" stroke="#7e8998" stroke-width="3"/>${ears}${hairBack}<path d="M165 211h30v26h-30z" fill="${person.face}"/>${faceShape.replace('FACE', person.face)}${muzzle}${fringe}${arms}${vest}${sportDetails}<g fill="none" stroke="#fff5de" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${accessorySymbol}</g><path d="M143 144q10-5 20-1m34 0q10-4 20 1" stroke="${person.hair}" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="153" cy="160" rx="3.7" ry="5" fill="#2f3645"/><ellipse cx="207" cy="160" rx="3.7" ry="5" fill="#2f3645"/><circle cx="154" cy="158" r="1.1" fill="#fff"/><circle cx="208" cy="158" r="1.1" fill="#fff"/>${glasses}${!animal ? '<path d="m181 168-3 12h6" stroke="#ac7d65" stroke-width="2.4" fill="none" stroke-linecap="round"/>' : ''}<path d="M169 195q11 9 22 0" fill="none" stroke="#795343" stroke-width="2.5" stroke-linecap="round"/>${helmet}${enhanced}${prop}</svg>`;
  return { prompt, fallbackSvg };
}
