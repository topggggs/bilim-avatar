import type { AvatarConfig, Archetype, Scale } from './index.js';
/** Every option a person can pick in the avatar editor. Order defines the order in the UI. */
export const lookOptions = {
  headwear: ['helmet', 'cap', 'beanie', 'none'],
  eyewear: ['none', 'round', 'sunglasses', 'goggles'],
  extra: ['none', 'headphones', 'scarf', 'watch', 'medal'],
  expression: ['smile', 'grin', 'wink', 'focused'],
  background: ['sky', 'sunset', 'mint', 'night'],
  skin: ['light', 'medium', 'tan', 'deep'],
} as const;
export type Look = { [K in keyof typeof lookOptions]: (typeof lookOptions)[K][number] };
const archetypes: Record<Archetype, { animal: string; name: string; prop: string; ru: string }> = {
  strategist: { animal: 'fox', name: 'Лис', ru: 'стратег', prop: 'tablet with a blueprint' },
  leader: { animal: 'lion', name: 'Лев', ru: 'лидер', prop: 'radio and short cape' },
  master: { animal: 'beaver', name: 'Бобёр', ru: 'мастер', prop: 'wrench and tool belt' },
  mentor: { animal: 'bear', name: 'Медведь', ru: 'наставник', prop: 'welcoming wave' },
  jobseeker: {
    animal: 'panda',
    name: 'Панда',
    ru: 'безработный',
    prop: 'portfolio folder with a resume and a small travel backpack',
  },
};
const accessories: Record<Scale, string> = {
  critical: 'blueprint insignia',
  confidence: 'megaphone insignia',
  discipline: 'checklist insignia',
  engagement: 'heart insignia',
};
const palettes = {
  bright: ['#f07b47', '#ffc64c'],
  strict: ['#3d485c', '#c5cedc'],
  calm: ['#60a39b', '#d5e9c9'],
  tech: ['#6376e8', '#8de3ef'],
};
const skins: Record<Look['skin'], string> = {
  light: '#f7d7bf',
  medium: '#ebb894',
  tan: '#c98d64',
  deep: '#8a5a3c',
};
const hairColors: Record<AvatarConfig['universe'], string> = {
  animals: '#3a2a26',
  cinema: '#6b3f2a',
  anime: '#4a55d0',
  sport: '#262a33',
  fantasy: '#e6dff5',
};
const species: Record<Archetype, { fur: string; light: string; dark: string }> = {
  strategist: { fur: '#ef8a47', light: '#fff4e8', dark: '#c4622a' },
  leader: { fur: '#f2b55e', light: '#fff1d8', dark: '#b8662a' },
  master: { fur: '#a8724f', light: '#ead2b9', dark: '#76492f' },
  mentor: { fur: '#b07d56', light: '#efd9c2', dark: '#7d5437' },
  jobseeker: { fur: '#f6f2ea', light: '#ffffff', dark: '#282b32' },
};
const backdrops: Record<Look['background'], { top: string; bottom: string; city: string }> = {
  sky: { top: '#e7efff', bottom: '#bcd0fd', city: '#a8bdf3' },
  sunset: { top: '#ffeedb', bottom: '#ffbca6', city: '#f2a092' },
  mint: { top: '#e6f8f0', bottom: '#b2e6d1', city: '#95d4bc' },
  night: { top: '#34438f', bottom: '#1b2457', city: '#29347a' },
};
/** "Ещё вариант" presets: variant N without a saved look gets preset N. */
const presets: Partial<Look>[] = [
  {},
  { eyewear: 'sunglasses' },
  { extra: 'watch' },
  { expression: 'focused' },
  { expression: 'wink' },
  { extra: 'headphones' },
  { expression: 'grin', background: 'sunset' },
  { eyewear: 'round', background: 'mint' },
];
/** A saved look wins; otherwise the variant index picks a preset, so old avatars render unchanged. */
export function resolveLook(c: AvatarConfig, variant = 0): Look {
  if (c.look) return c.look;
  const base: Look = {
    headwear: c.archetype === 'jobseeker' ? 'none' : 'helmet',
    eyewear: c.archetype === 'strategist' ? 'round' : 'none',
    extra: 'none',
    expression: 'smile',
    background: 'sky',
    skin: 'medium',
  };
  return { ...base, ...presets[Math.max(0, Math.floor(variant)) % presets.length] };
}
const hex = (n: number) =>
  Math.round(Math.min(255, Math.max(0, n)))
    .toString(16)
    .padStart(2, '0');
const channels = (color: string) =>
  (color.length === 4 ? color.replace(/\w/g, (d) => d + d) : color)
    .slice(1)
    .match(/../g)!
    .map((x) => parseInt(x, 16));
function mix(color: string, target: string, t: number) {
  const a = channels(color);
  const b = channels(target);
  return `#${a.map((v, i) => hex(v + (b[i] - v) * t)).join('')}`;
}
const mirror = (svg: string) => `${svg}<g transform="matrix(-1 0 0 1 360 0)">${svg}</g>`;
const part = (name: string, svg: string) => (svg ? `<g data-part="${name}">${svg}</g>` : '');
export function avatarName(c: AvatarConfig) {
  const a = archetypes[c.archetype];
  return `${c.universe === 'animals' ? a.name : { cinema: 'Герой', anime: 'Искра', sport: 'Чемпион', fantasy: 'Хранитель' }[c.universe]}-${a.ru}`;
}
function describe(c: AvatarConfig, look: Look) {
  const a = archetypes[c.archetype];
  const universe = {
    animals: `anthropomorphic ${a.animal}`,
    cinema: 'original cinematic adventure mascot, no existing film characters',
    anime: 'original anime-inspired mascot, clean cel shading',
    sport: 'original athletic mascot, no real athletes or team emblems',
    fantasy: 'original fantasy adventurer mascot',
  }[c.universe];
  const headwear = {
    helmet: 'yellow safety helmet with a small BI emblem',
    cap: 'baseball cap with a small BI emblem',
    beanie: 'knit beanie with a pompom',
    none: 'no headwear',
  }[look.headwear];
  const workwear =
    c.archetype === 'jobseeker'
      ? look.headwear === 'none'
        ? 'smart casual interview outfit, no hard hat and no safety vest'
        : 'smart casual interview outfit, no safety vest'
      : {
          strategist: 'high-visibility vest over a tailored field coat with map pockets',
          leader: 'high-visibility vest over a structured protective jacket and a short cape',
          master: 'high-visibility vest over a work jacket with a tool belt',
          mentor: 'high-visibility vest over a soft work jacket with a warm scarf',
        }[c.archetype];
  const eyewear = {
    none: 'no glasses',
    round: 'thin round glasses',
    sunglasses: 'stylish glossy black sunglasses',
    goggles: 'clear protective safety goggles',
  }[look.eyewear];
  const extra = {
    none: 'no extra accessories',
    headphones:
      'over-ear headphones placed only at the sides of the head, leave the front headwear and BI emblem unobstructed',
    scarf: 'warm knitted red scarf',
    watch: 'sleek wristwatch fastened securely around a clearly visible wrist',
    medal: 'gold medal on a blue ribbon',
  }[look.extra];
  const expression = {
    smile: 'friendly relaxed smile',
    grin: 'joyful wide smile with rosy cheeks',
    wink: 'warm smile with one eye winking',
    focused: 'focused confident expression with determined eyebrows',
  }[look.expression];
  const background = {
    sky: 'soft sky-blue round backdrop with a distant construction skyline',
    sunset: 'warm sunset round backdrop with a distant construction skyline',
    mint: 'fresh mint round backdrop with a distant construction skyline',
    night: 'deep blue night round backdrop with stars and a construction skyline',
  }[look.background];
  const skin = c.universe === 'animals' ? '' : `${look.skin} skin tone, `;
  return `Original mascot character, ${universe}, ${c.archetype} archetype, ${c.gender} gender body variant, ${c.style} style, ${palettes[c.style].join(' and ')} palette, ${skin}${expression}, ${headwear}, ${eyewear}, ${workwear}, ${a.prop}, ${accessories[c.accessory]} accessory, ${extra}, ${c.boosted ? 'glowing achievement badge' : 'standard edition'}, friendly confident pose with arms close to the body, no tails, no detached hands, full body, three-quarter front view, chibi proportions, refined flat vector illustration with soft shading, ${background}, no other text, no foreign logos, no real people, no existing characters, safe for work.`;
}
export function buildAvatar(c: AvatarConfig, variant = 0) {
  const a = archetypes[c.archetype],
    palette = palettes[c.style];
  if (!a || !palette || !accessories[c.accessory]) throw new Error('Неверная конфигурация аватара');
  const look = resolveLook(c, variant);
  const animal = c.universe === 'animals';
  const worker = c.archetype !== 'jobseeker';
  const fur = species[c.archetype];
  const skin = animal ? fur.fur : (skins[look.skin] ?? skins.medium);
  const skinShade = animal ? fur.dark : mix(skin, '#5b2f1c', 0.28);
  const hair = hairColors[c.universe];
  const [main, accent] = palette;
  const jacket = worker ? main : '#34445f';
  const jacketDark = mix(jacket, '#0b1020', 0.28);
  const bg = backdrops[look.background] ?? backdrops.sky;
  const ink = '#232736';
  // Backdrop: a round card with a construction skyline; the character steps out of it.
  const sky = {
    sky: '<g fill="#fff" opacity=".85"><path d="M64 118a16 16 0 0 1 30-8 13 13 0 0 1 20 11H64z"/><path d="M250 92a13 13 0 0 1 25-6 11 11 0 0 1 16 9h-41z"/></g>',
    sunset: '<circle cx="252" cy="128" r="34" fill="#ffd98a" opacity=".85"/>',
    mint: '<g fill="#fff" opacity=".55"><circle cx="76" cy="118" r="9"/><circle cx="96" cy="96" r="5"/><circle cx="276" cy="104" r="7"/></g>',
    night:
      '<g fill="#ffe7a3"><circle cx="70" cy="110" r="2.5"/><circle cx="104" cy="78" r="2"/><circle cx="262" cy="84" r="2.5"/><circle cx="300" cy="138" r="2"/><circle cx="88" cy="168" r="1.6"/></g><path d="M262 108a22 22 0 1 0 22 30 18 18 0 1 1-22-30z" fill="#ffe7a3"/>',
  }[look.background];
  const backdrop = `<circle cx="180" cy="200" r="160" fill="url(#bi-bg)"/><g clip-path="url(#bi-clip)">${sky}<g fill="${bg.city}"><path d="M28 360V286h30v-20h26v94zM92 360v-52h24v52zM246 360V272h22v-20h28v108zM300 360v-62h34v62z"/><path d="M314 298V150" stroke="${bg.city}" stroke-width="7"/><path d="M314 156H238M314 156l-30 20M250 156v34" stroke="${bg.city}" stroke-width="5" fill="none"/><rect x="242" y="190" width="16" height="12" rx="2"/></g><g fill="#fff" opacity="${look.background === 'night' ? 0.55 : 0.4}"><path d="M36 296h6v6h-6zm12 0h6v6h-6zm-12 14h6v6h-6zm12 14h6v6h-6zM254 284h6v6h-6zm12 0h6v6h-6zm-12 16h6v6h-6zm24 16h6v6h-6zM308 312h6v6h-6zm12 0h6v6h-6z"/></g></g>`;
  const motif =
    c.universe === 'fantasy'
      ? '<g fill="#fff6c9"><path d="m70 220 4 10 10 4-10 4-4 10-4-10-10-4 10-4zM292 250l3 7 7 3-7 3-3 7-3-7-7-3 7-3zM290 70l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/></g>'
      : c.universe === 'cinema'
        ? '<path d="M44 52 150 384h70L76 44z" fill="#fff" opacity=".14"/><g fill="#ffd36c"><path d="m286 222 3 8 8 3-8 3-3 8-3-8-8-3 8-3zM66 236l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/></g>'
        : c.universe === 'anime'
          ? '<g stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".6"><path d="M40 170h34M30 200h40M42 230h30M290 168h32M286 198h42M292 228h28"/></g>'
          : c.universe === 'sport'
            ? '<g fill="none" stroke="#fff" stroke-width="4" opacity=".55"><path d="M60 250q-20-60 20-110M300 250q20-60-20-110"/></g>'
            : '';
  const glow = c.boosted ? '<circle cx="180" cy="215" r="128" fill="url(#bi-glow)"/>' : '';
  const cape =
    c.archetype === 'leader' || c.universe === 'fantasy'
      ? (() => {
          const color = c.universe === 'fantasy' ? '#6d4fd6' : '#c3414f';
          return `<path d="M128 228q-14 72-34 144 86 26 172 0-20-72-34-144z" fill="${color}"/><path d="M128 228q-8 74-12 150 40 12 64 12V236z" fill="${mix(color, '#000', 0.18)}"/>`;
        })()
      : '';
  const hairBack =
    !animal && c.gender !== 'male'
      ? mirror(
          c.gender === 'female'
            ? `<path d="M118 150q-16 76 4 124 20 10 34-4-22-50-14-118z" fill="${mix(hair, '#000', 0.15)}"/>`
            : `<path d="M118 152q-10 46 6 76l18-6q-14-30-8-68z" fill="${mix(hair, '#000', 0.15)}"/>`,
        )
      : '';
  const legs = `<path d="M146 320h28l-2 52h-26zM186 320h28l1 52h-27z" fill="#3a4562"/><path d="M136 366h40v10q0 10-10 10h-34q-7 0-7-7 0-13 11-13zM184 366h40q11 0 11 13 0 7-7 7h-34q-10 0-10-10z" fill="#252b3e"/><path d="M134 382h40M186 382h40" stroke="#4b5675" stroke-width="3" stroke-linecap="round"/>`;
  const wave = c.archetype === 'mentor';
  const leftArm = `<path d="M134 238q-24 26-26 62" stroke="${jacket}" stroke-width="24" stroke-linecap="round" fill="none"/>`;
  const rightArm = wave
    ? `<path d="M226 238q30-12 36-50" stroke="${jacket}" stroke-width="24" stroke-linecap="round" fill="none"/>`
    : `<path d="M226 238q26 22 26 58" stroke="${jacket}" stroke-width="24" stroke-linecap="round" fill="none"/>`;
  const torso = `<path d="M128 226q52-18 104 0 14 52 8 104-60 16-120 0-6-52 8-104z" fill="url(#bi-jacket)"/><path d="M180 222v112" stroke="${jacketDark}" stroke-width="2.5"/>`;
  const sportBands =
    c.universe === 'sport'
      ? `<path d="M100 288l16 4M244 ${wave ? '198l16 -2' : '286l16 0'}" stroke="${accent}" stroke-width="9" stroke-linecap="round"/>`
      : '';
  const vest = worker
    ? `<path d="M134 228l38 12-2 96q-26 0-50-6-4-54 14-102z" fill="#c8ec48"/><path d="M226 228l-38 12 2 96q26 0 50-6 4-54-14-102z" fill="#c8ec48"/><path d="M122 292h48M190 292h48M121 312h49M190 312h49" stroke="#eef4fa" stroke-width="8"/><path d="M122 292h48M190 292h48M121 312h49M190 312h49" stroke="#b9c6d6" stroke-width="1.5" stroke-dasharray="3 5"/>`
    : `<path d="M160 224l20 40 20-40z" fill="#f7f4ec"/><path d="M175 236h10l4 28-9 11-9-11z" fill="${main}"/><path d="M140 230v92M220 230v92" stroke="#7a5b46" stroke-width="8" stroke-linecap="round"/>`;
  const outfit = {
    strategist: `<path d="M150 224l22 22-6 12-24-26zM210 224l-22 22 6 12 24-26z" fill="${mix(jacket, '#fff', 0.35)}"/>`,
    leader:
      '<circle cx="136" cy="234" r="7" fill="#f2c94c" stroke="#c99a2e" stroke-width="2"/><circle cx="224" cy="234" r="7" fill="#f2c94c" stroke="#c99a2e" stroke-width="2"/>',
    master:
      '<rect x="120" y="314" width="120" height="14" rx="5" fill="#7a4f33"/><rect x="172" y="312" width="16" height="18" rx="3" fill="#f0c75a"/><path d="M134 328v24" stroke="#8a929f" stroke-width="5" stroke-linecap="round"/><rect x="127" y="348" width="14" height="10" rx="2" fill="#5f6a7d"/>',
    mentor: '',
    jobseeker: '',
  }[c.archetype];
  const icon = {
    critical: `<path d="M-6-6h12v12h-12zM-6 0h12M0-6v12" stroke="${jacketDark}" stroke-width="2" fill="none"/>`,
    confidence: `<path d="M-7-3h4l7-5v16l-7-5h-4z" fill="${jacketDark}"/>`,
    discipline: `<path d="m-6 0 4 4 8-9" stroke="${jacketDark}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    engagement: `<path d="M0 6C-10-1-6-9 0-4 6-9 10-1 0 6z" fill="#e5566a"/>`,
  }[c.accessory];
  const insignia = `<g transform="translate(150 262)"><circle r="12.5" fill="#fff" stroke="${jacketDark}" stroke-width="2.5"/>${icon}</g>`;
  const scarfColor = look.extra === 'scarf' ? '#e2554a' : '#e3a33b';
  const scarf =
    look.extra === 'scarf' || c.archetype === 'mentor'
      ? `<path d="M124 218q56 30 112 0 8 14-2 26-54 26-108 0-10-12-2-26z" fill="${scarfColor}"/><path d="M196 246q16 24 10 54l-17-3q4-26-8-46z" fill="${mix(scarfColor, '#000', 0.15)}"/><path d="M190 280l17 3M192 290l15 2" stroke="${mix(scarfColor, '#fff', 0.35)}" stroke-width="3"/>`
      : '';
  const medal =
    look.extra === 'medal'
      ? '<path d="M162 224l18 38 18-38" fill="none" stroke="#3b6fe0" stroke-width="8" stroke-linejoin="round"/><circle cx="180" cy="272" r="13" fill="#f4c542" stroke="#d29a1d" stroke-width="3"/><path d="m180 264 2.6 5.4 5.8.8-4.2 4 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.2-4 5.8-.8z" fill="#fff6d0"/>'
      : '';
  // Head: animal species or a person with hair; eyes sit at (154,160) and (206,160).
  const ears = animal
    ? {
        strategist: mirror(
          `<path d="M118 122q-16-52-2-74 36 20 48 50z" fill="${fur.fur}"/><path d="M122 112q-10-36-2-50 24 16 30 38z" fill="${fur.light}"/><path d="M116 50q4 14 14 18-6-14-14-18z" fill="${ink}"/>`,
        ),
        leader: '',
        master: mirror(`<circle cx="122" cy="108" r="15" fill="${fur.dark}"/>`),
        mentor: mirror(
          `<circle cx="124" cy="104" r="24" fill="${fur.fur}"/><circle cx="124" cy="104" r="13" fill="${fur.light}"/>`,
        ),
        jobseeker: mirror(`<circle cx="122" cy="104" r="24" fill="${fur.dark}"/>`),
      }[c.archetype]
    : mirror(`<ellipse cx="119" cy="166" rx="10" ry="13" fill="${skinShade}"/>`);
  const mane =
    animal && c.archetype === 'leader'
      ? (() => {
          let petals = '';
          for (let i = 0; i < 12; i++) {
            const angle = (i * Math.PI) / 6;
            petals += `<circle cx="${(180 + Math.cos(angle) * 78).toFixed(1)}" cy="${(158 + Math.sin(angle) * 72).toFixed(1)}" r="28"/>`;
          }
          return `<g fill="#c06a2b">${petals}</g><circle cx="180" cy="158" r="86" fill="#d98436"/>`;
        })()
      : '';
  const head = animal
    ? `<ellipse cx="180" cy="156" rx="74" ry="66" fill="url(#bi-skin)"/>`
    : `<ellipse cx="180" cy="160" rx="62" ry="64" fill="url(#bi-skin)"/>`;
  const muzzle = animal
    ? c.archetype === 'strategist'
      ? `<path d="M106 168q26-16 54 10 10 22 20 22t20-22q28-26 54-10-8 46-74 54-66-8-74-54z" fill="${fur.light}"/>`
      : c.archetype === 'jobseeker'
        ? mirror(
            `<ellipse cx="152" cy="160" rx="17" ry="22" transform="rotate(-24 152 160)" fill="${fur.dark}"/>`,
          )
        : `<ellipse cx="180" cy="192" rx="36" ry="26" fill="${fur.light}"/>`
    : '';
  const teeth =
    animal && c.archetype === 'master' && look.expression !== 'grin'
      ? '<path d="M173 201h14v10q0 4-4 4h-6q-4 0-4-4z" fill="#fff" stroke="#d8cfc2" stroke-width="1.5"/><path d="M180 201v14" stroke="#d8cfc2" stroke-width="1.5"/>'
      : '';
  const eyeBig = c.universe === 'anime';
  const panda = animal && c.archetype === 'jobseeker';
  const openEye = (x: number) =>
    panda
      ? `<circle cx="${x}" cy="160" r="7" fill="#f6f2ea"/><circle cx="${x}" cy="161" r="4.2" fill="${ink}"/><circle cx="${x + 1.6}" cy="158.6" r="1.6" fill="#fff"/>`
      : eyeBig
        ? `<ellipse cx="${x}" cy="160" rx="10" ry="13" fill="${ink}"/><ellipse cx="${x}" cy="164" rx="6" ry="7" fill="#5b6cff"/><circle cx="${x + 3}" cy="155" r="3.4" fill="#fff"/><circle cx="${x - 3}" cy="166" r="1.6" fill="#fff"/>`
        : `<ellipse cx="${x}" cy="160" rx="7.5" ry="9" fill="${ink}"/><circle cx="${x + 2.6}" cy="157" r="2.6" fill="#fff"/>`;
  const closedEye = (x: number) =>
    `<path d="M${x - 9} 162q9-10 18 0" fill="none" stroke="${panda ? '#f6f2ea' : ink}" stroke-width="4" stroke-linecap="round"/>`;
  const eyes =
    look.expression === 'grin'
      ? closedEye(154) + closedEye(206)
      : look.expression === 'wink'
        ? openEye(154) + closedEye(206)
        : openEye(154) + openEye(206);
  const brow = animal ? fur.dark : hair;
  const brows =
    look.expression === 'focused'
      ? `<path d="M141 140l23 6M219 140l-23 6" stroke="${panda ? ink : brow}" stroke-width="5" stroke-linecap="round"/>`
      : '';
  const nose = animal
    ? `<path d="M170 180q10-6 20 0-3 10-10 12-7-2-10-12z" fill="#2b2a33"/><path d="M175 180q5-2 9 0" stroke="#fff" stroke-width="1.6" opacity=".6" stroke-linecap="round"/>`
    : `<path d="M179 172q-5 12 3 15" fill="none" stroke="${skinShade}" stroke-width="3" stroke-linecap="round"/>`;
  const mouthY = animal ? 197 : 200;
  const mouth =
    look.expression === 'grin'
      ? `<path d="M164 ${mouthY - 3}q16 26 32 0z" fill="#5a2630"/><path d="M171 ${mouthY + 7}q9-5 18 0-2 8-9 8t-9-8z" fill="#ef7f86"/>`
      : look.expression === 'focused'
        ? `<path d="M170 ${mouthY + 1}q10 4 20-2" fill="none" stroke="#4a2b2b" stroke-width="3.5" stroke-linecap="round"/>`
        : animal
          ? `<path d="M180 192v4m-12 0q6 8 12 0 6 8 12 0" fill="none" stroke="#4a2b2b" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`
          : `<path d="M167 ${mouthY - 2}q13 13 26 0" fill="none" stroke="#4a2b2b" stroke-width="3.5" stroke-linecap="round"/>`;
  const cheeks =
    look.expression === 'focused'
      ? ''
      : mirror(
          `<ellipse cx="134" cy="186" rx="11" ry="7" fill="#ff8f8f" opacity="${look.expression === 'grin' ? 0.55 : 0.32}"/>`,
        );
  const bare = look.headwear === 'none';
  const hairFront = animal
    ? ''
    : bare
      ? c.universe === 'anime'
        ? `<path d="M116 152l4-48 18 12 8-26 18 18 16-24 16 24 18-18 8 26 18-12 4 48q-12-22-34-28-30 12-60 0-22 6-34 28z" fill="${hair}"/>`
        : c.gender === 'male'
          ? `<path d="M118 152q-4-52 42-58 40-10 72 12 16 16 12 46-12-22-34-28-24 10-50 2-24 4-42 26z" fill="${hair}"/>`
          : `<path d="M116 160q-6-64 64-68 70 4 64 68-8-30-30-40-18 18-46 6-22 16-40 10-8 10-12 24z" fill="${hair}"/>`
      : mirror(`<path d="M118 140q-4 20 4 36l10-30z" fill="${hair}"/>`);
  const headband =
    !animal && bare && c.universe === 'sport'
      ? `<path d="M118 126q62-22 124 0v14q-62-20-124 0z" fill="${accent}"/>`
      : '';
  const eyewear = {
    none: '',
    round: `<g fill="#cfe6ff" fill-opacity=".22" stroke="#2c3346" stroke-width="3.5"><circle cx="154" cy="160" r="16"/><circle cx="206" cy="160" r="16"/></g><path d="M170 158q10-6 20 0M138 156l-22-5M222 156l22-5" fill="none" stroke="#2c3346" stroke-width="3.5" stroke-linecap="round"/>`,
    sunglasses: `${mirror('<path d="M134 150h38q2 24-18 26-20-2-20-26z" fill="#141a26"/><path d="M141 155h10" stroke="#fff" stroke-width="3" opacity=".55" stroke-linecap="round"/>')}<path d="M172 154q8-5 16 0" fill="none" stroke="#141a26" stroke-width="5"/>`,
    goggles: `<path d="M108 158q72-16 144 0" stroke="#3b4258" stroke-width="9" fill="none"/><rect x="132" y="143" width="96" height="36" rx="17" fill="#bfe8f5" fill-opacity=".6" stroke="#3b4258" stroke-width="5"/><path d="M180 145v32" stroke="#3b4258" stroke-width="4"/><path d="M142 152l12 0" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".8"/>`,
  }[look.eyewear];
  const headwear = {
    helmet: `<path d="M106 136q-2-66 74-70 76 4 74 70z" fill="url(#bi-helmet)"/><path d="M180 70v58" stroke="#ffe796" stroke-width="12" stroke-linecap="round" opacity=".7"/><rect x="162" y="94" width="36" height="22" rx="5" fill="#283252"/><text x="180" y="110" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#fff">BI</text><path d="M94 134q86-14 172 0 4 12-10 14H104q-14-2-10-14z" fill="#f0a50f"/><path d="M110 134q70-10 140 0" stroke="#ffd25a" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    cap: `<path d="M110 132q-2-58 70-62 72 4 70 62z" fill="url(#bi-cap)"/><path d="M180 72v58M146 80q-8 24-6 50M214 80q8 24 6 50" stroke="${mix(main, '#000', 0.2)}" stroke-width="2.5" fill="none"/><circle cx="180" cy="72" r="5" fill="${mix(main, '#000', 0.3)}"/><text x="180" y="116" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#fff">BI</text><path d="M102 130q78-16 156 0 6 14-8 20-70-12-140 0-14-6-8-20z" fill="${mix(main, '#000', 0.28)}"/>`,
    beanie: `<path d="M108 138q-2-68 72-72 74 4 72 72z" fill="${accent}"/><path d="M130 88v40M150 76v52M170 70v58M190 70v58M210 76v52M230 88v40" stroke="${mix(accent, '#000', 0.12)}" stroke-width="4"/><rect x="102" y="118" width="156" height="26" rx="13" fill="${mix(accent, '#000', 0.18)}"/><path d="M114 131h132" stroke="${mix(accent, '#fff', 0.3)}" stroke-width="3" stroke-dasharray="6 6"/><circle cx="180" cy="62" r="15" fill="${mix(accent, '#fff', 0.25)}"/><circle cx="175" cy="57" r="5" fill="#fff" opacity=".45"/>`,
    none: '',
  }[look.headwear];
  const headphones =
    look.extra === 'headphones'
      ? `<path d="M106 158q-8-92 74-96 82 4 74 96" fill="none" stroke="#2b3142" stroke-width="10" stroke-linecap="round"/>${mirror(`<rect x="90" y="138" width="28" height="46" rx="13" fill="#2b3142"/><rect x="96" y="146" width="15" height="30" rx="7" fill="${main}"/>`)}`
      : '';
  const hand = (x: number, y: number) =>
    `<circle cx="${x}" cy="${y}" r="13.5" fill="${skin}" stroke="${skinShade}" stroke-width="2.5"/>`;
  const prop = {
    strategist:
      '<g transform="rotate(-12 262 278)"><rect x="236" y="244" width="56" height="72" rx="8" fill="#2d3550"/><rect x="241" y="250" width="46" height="58" rx="4" fill="#c4ecf7"/><path d="M247 262h34M247 274h34M247 286h22M257 254v50M271 254v50" stroke="#5a7bd8" stroke-width="2" fill="none"/></g>',
    leader:
      '<g transform="rotate(-8 258 280)"><path d="M262 252v-24" stroke="#2d3550" stroke-width="4" stroke-linecap="round"/><rect x="244" y="250" width="28" height="52" rx="7" fill="#2d3550"/><rect x="249" y="258" width="18" height="13" rx="3" fill="#8fe0c8"/><path d="M251 280h14M251 287h14M251 294h14" stroke="#596482" stroke-width="2.5"/></g>',
    master:
      '<g transform="rotate(28 256 282)"><rect x="250" y="240" width="12" height="62" rx="5" fill="#9aa7bd"/><path d="M243 236a15 15 0 1 1 26 0l-6 6v-10h-14v10z" fill="#9aa7bd"/><rect x="252" y="270" width="8" height="24" rx="3" fill="#6f7c93"/></g>',
    mentor: '',
    jobseeker:
      '<g transform="rotate(-8 262 300)"><rect x="232" y="268" width="58" height="72" rx="7" fill="#f6f1e6" stroke="#35435c" stroke-width="4"/><path d="M242 286h36M242 298h36M242 310h24" stroke="#7f93c4" stroke-width="3"/><path d="M252 268v-8h18v8" fill="none" stroke="#35435c" stroke-width="4"/></g>',
  }[c.archetype];
  const watch =
    look.extra === 'watch'
      ? '<g transform="rotate(-20 110 286)"><rect x="98" y="279" width="24" height="12" rx="4" fill="#202a38"/><circle cx="110" cy="285" r="8" fill="#a9dce6" stroke="#d2b873" stroke-width="2.5"/><path d="M110 281v4l3 2" fill="none" stroke="#34445a" stroke-width="1.6"/></g>'
      : '';
  const badge = c.boosted
    ? '<g data-part="boosted" transform="translate(286 92)"><circle r="24" fill="#f8d16b" opacity=".3"/><circle r="17" fill="#f6c343" stroke="#fff" stroke-width="3"/><path d="m0-10 3 6.4 7 .9-5.1 4.8 1.3 6.9L0 5.6l-6.2 3.4 1.3-6.9-5.1-4.8 7-.9z" fill="#fff"/></g>'
    : '';
  const defs = `<defs><linearGradient id="bi-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg.top}"/><stop offset="1" stop-color="${bg.bottom}"/></linearGradient><clipPath id="bi-clip"><circle cx="180" cy="200" r="160"/></clipPath><radialGradient id="bi-glow"><stop offset="0" stop-color="#ffe08a" stop-opacity=".75"/><stop offset="1" stop-color="#ffe08a" stop-opacity="0"/></radialGradient><linearGradient id="bi-jacket" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mix(jacket, '#fff', 0.12)}"/><stop offset="1" stop-color="${mix(jacket, '#000', 0.12)}"/></linearGradient><radialGradient id="bi-skin" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="${mix(skin, '#fff', 0.18)}"/><stop offset="1" stop-color="${skin}"/></radialGradient><linearGradient id="bi-helmet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe066"/><stop offset="1" stop-color="#f6b51c"/></linearGradient><linearGradient id="bi-cap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(main, '#fff', 0.15)}"/><stop offset="1" stop-color="${main}"/></linearGradient></defs>`;
  const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 430" role="img" aria-label="${avatarName(c)}">${defs}${part(`background-${look.background}`, backdrop)}${motif}${glow}<ellipse cx="180" cy="388" rx="90" ry="12" fill="#1b2450" opacity=".16"/>${cape}${hairBack}${legs}${leftArm}${rightArm}${torso}${sportBands}${vest}${outfit}${insignia}${part(look.extra === 'scarf' ? 'extra-scarf' : 'outfit-scarf', scarf)}${part('extra-medal', medal)}${ears}${mane}${head}${muzzle}${teeth}${part(`expression-${look.expression}`, eyes + brows + nose + mouth + cheeks)}${hairFront}${headband}${part(`eyewear-${look.eyewear}`, eyewear)}${part(`headwear-${look.headwear}`, headwear)}${part('extra-headphones', headphones)}${prop}${hand(108, 302)}${wave ? hand(262, 186) : hand(252, 298)}${part('extra-watch', watch)}${badge}</svg>`;
  return { prompt: describe(c, look), fallbackSvg };
}
