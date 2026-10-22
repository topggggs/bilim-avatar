import type { AvatarConfig, Archetype, Scale } from './index.js';

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
const luma = (color: string) => {
  const [r, g, b] = channels(color);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};
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
type Pt = readonly [number, number];
type Curve = readonly [Pt, Pt, Pt];
const fx = (n: number) => +n.toFixed(1);
const pointOn = ([a, c, b]: Curve, t: number): Pt => {
  const u = 1 - t;
  return [
    u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
    u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
  ];
};
const directionOn = ([a, c, b]: Curve, t: number): Pt => {
  const x = 2 * (1 - t) * (c[0] - a[0]) + 2 * t * (b[0] - c[0]);
  const y = 2 * (1 - t) * (c[1] - a[1]) + 2 * t * (b[1] - c[1]);
  const length = Math.hypot(x, y) || 1;
  return [x / length, y / length];
};
// Rounded tube along a curve for limbs and cuffs.
function tube(curve: Curve, w0: number, w1: number, t0 = 0, t1 = 1) {
  const steps = 8;
  const left: Pt[] = [];
  const right: Pt[] = [];
  const width = (t: number) => w0 + (w1 - w0) * t;
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    const [x, y] = pointOn(curve, t);
    const [dx, dy] = directionOn(curve, t);
    left.push([x - (dy * width(t)) / 2, y + (dx * width(t)) / 2]);
    right.push([x + (dy * width(t)) / 2, y - (dx * width(t)) / 2]);
  }
  const p = ([x, y]: Pt) => `${fx(x)} ${fx(y)}`;
  // The quadratic midpoint needs a full-width control offset.
  const cap = (t: number, sign: number) => {
    const [x, y] = pointOn(curve, t);
    const [dx, dy] = directionOn(curve, t);
    return p([x + dx * width(t) * sign, y + dy * width(t) * sign]);
  };
  return `M${p(left[0])}L${left.slice(1).map(p).join(' ')}Q${cap(t1, 1)} ${p(right[steps])}L${right
    .slice(0, steps)
    .reverse()
    .map(p)
    .join(' ')}Q${cap(t0, -1)} ${p(left[0])}Z`;
}
// Wrist position and rotation at the end of an arm.
const handAt = (curve: Curve, reach = 8) => {
  const [x, y] = pointOn(curve, 1);
  const [dx, dy] = directionOn(curve, 1);
  return {
    x: fx(x + dx * reach),
    y: fx(y + dy * reach),
    angle: fx((Math.atan2(dy, dx) * 180) / Math.PI - 90),
  };
};
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
  const edge = (fill: string) => mix(fill, '#151a33', 0.42);
  const outlined = (fill: string, width = 3) =>
    `stroke="${edge(fill)}" stroke-width="${width}" stroke-linejoin="round"`;
  const shadow = (d: string, opacity = 0.16) =>
    `<path d="${d}" fill="#141a33" opacity="${opacity}"/>`;
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
  const torsoPath =
    'M180 226C160 226 144 229 133 235C123 241 119 251 119 264L122 323C140 334 220 334 238 323L241 264C241 251 237 241 227 235C216 229 200 226 180 226Z';
  const capeColor = c.universe === 'fantasy' ? '#6d4fd6' : '#c3414f';
  const cape =
    c.archetype === 'leader' || c.universe === 'fantasy'
      ? `<path d="M130 238C112 288 100 336 88 378Q180 398 272 378C260 336 248 288 230 238Z" fill="${capeColor}" ${outlined(capeColor)}/><path d="M146 296Q180 306 214 296L224 386Q180 394 136 386Z" fill="${mix(capeColor, '#000', 0.22)}"/><path d="M112 330Q118 356 112 380M248 330Q242 356 248 380" fill="none" stroke="${mix(capeColor, '#000', 0.16)}" stroke-width="3" stroke-linecap="round"/>`
      : '';
  const cut = c.gender === 'male' ? 'short' : c.gender === 'female' ? 'long' : 'bob';
  const pointed = c.universe === 'anime';
  const hairShade = mix(hair, '#2a1f5c', 0.26);
  const hairBack = animal
    ? ''
    : {
        short: '',
        long: `<path d="M180 90C138 90 108 116 106 154C104 182 100 206 106 228C110 244 102 256 110 266C118 276 136 274 142 262H218C224 274 242 276 250 266C258 256 250 244 254 228C260 206 256 182 254 154C252 116 222 90 180 90Z" fill="${hairShade}" ${outlined(hairShade, 2.5)}/>`,
        bob: `<path d="M180 92C134 92 106 124 106 166C106 192 110 210 118 218H242C250 210 254 192 254 166C254 124 226 92 180 92Z" fill="${hairShade}" ${outlined(hairShade, 2.5)}/>`,
      }[cut];
  const pants = '#3a4562';
  const boots = '#252b3e';
  const legs = `${mirror(`<path d="M147 318H177L175 366H149Z" fill="${pants}" ${outlined(pants)}/><path d="M140 360Q140 354 148 354H172Q178 354 178 360V378Q178 386 170 386H138Q131 386 131 379Q131 367 140 360Z" fill="${boots}" ${outlined(boots)}/><path d="M133 380H177" stroke="${mix(boots, '#fff', 0.18)}" stroke-width="3" stroke-linecap="round"/><path d="M141 362Q146 358 154 358" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".22"/>`)}<ellipse cx="180" cy="331" rx="44" ry="9" fill="#0b1020" opacity=".24"/>`;
  const wave = c.archetype === 'mentor';
  const leftArm: Curve = [
    [134, 252],
    [108, 268],
    [104, 298],
  ];
  const rightArm: Curve = wave
    ? [
        [226, 252],
        [272, 254],
        [262, 198],
      ]
    : [
        [226, 252],
        [252, 268],
        [256, 298],
      ];
  const cuff = c.universe === 'sport' ? accent : jacketDark;
  const sleeve = (curve: Curve) =>
    `<path d="${tube(curve, 27, 22)}" fill="url(#bi-jacket)" ${outlined(jacket)}/><path d="${tube(curve, 26, 25, 0.82, 1)}" fill="${cuff}" ${outlined(cuff)}/>`;
  const neck = `<path d="M166 200H194L196 236Q180 242 164 236Z" fill="${mix(skin, skinShade, 0.45)}" ${outlined(skin)}/>`;
  const vestColor = '#c8ec48';
  const vestPanel =
    'M146 229L158 226Q162 245 172 262L173 345H105L113 280Q133 270 137 247Q139 236 146 229Z';
  const flip = 'matrix(-1 0 0 1 360 0)';
  const tape = 'M96 292Q180 306 264 292M96 316Q180 330 264 316';
  const clothes = worker
    ? `<path d="M180 236V334" stroke="${jacketDark}" stroke-width="3"/><path d="${vestPanel}" fill="url(#bi-vest)" ${outlined(vestColor)}/><path d="${vestPanel}" transform="${flip}" fill="url(#bi-vest)" ${outlined(vestColor)}/><g clip-path="url(#bi-vest-clip)"><path d="${tape}" fill="none" stroke="#a9b6c7" stroke-width="13"/><path d="${tape}" fill="none" stroke="#eef3f8" stroke-width="9"/><path d="${tape}" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="4 7" opacity=".9"/></g>`
    : `<path d="M160 228L180 274L200 228Z" fill="#f7f4ec" ${outlined('#f7f4ec', 2)}/><path d="M175 238H185L183 247H177Z" fill="${main}" ${outlined(main, 2)}/><path d="M177 247H183L188 284L180 294L172 284Z" fill="${main}" ${outlined(main, 2)}/>${mirror(`<path d="M160 228L176 284L168 292L146 242Q150 232 160 228Z" fill="${mix(jacket, '#000', 0.18)}" ${outlined(jacket, 2.5)}/>`)}`;
  const belt =
    c.archetype === 'master'
      ? `<path d="M116 308Q180 322 244 308V324Q180 338 116 324Z" fill="#3b4256" ${outlined('#3b4256')}/><rect x="170" y="312" width="20" height="18" rx="4" fill="#f0c75a" ${outlined('#f0c75a', 2.5)}/><rect x="176" y="317" width="8" height="8" rx="2" fill="#3b4256"/>`
      : '';
  const torso = `<path d="${torsoPath}" fill="url(#bi-jacket)"/><g clip-path="url(#bi-torso)">${clothes}${belt}<rect x="112" y="220" width="136" height="124" fill="url(#bi-round)"/></g><path d="${torsoPath}" fill="none" ${outlined(jacket)}/>`;
  const collarColor =
    c.archetype === 'strategist' ? mix(jacket, '#fff', 0.35) : mix(jacket, '#fff', 0.14);
  const collar = worker
    ? mirror(
        `<path d="M165 225L180 241L171 254L151 237Q156 229 165 225Z" fill="${collarColor}" ${outlined(collarColor, 2.5)}/>`,
      )
    : mirror(`<path d="M166 226L178 240L170 248L158 234Z" fill="#fff" ${outlined('#f7f4ec', 2)}/>`);
  const gold = '#f2c94c';
  const leaderDetails =
    c.archetype === 'leader'
      ? mirror(
          `<path d="M124 247Q131 236 147 231L150 240Q137 244 130 254Z" fill="${gold}" ${outlined(gold, 2.5)}/><circle cx="160" cy="236" r="5.5" fill="${gold}" ${outlined(gold, 2)}/>`,
        )
      : '';
  const hammer =
    c.archetype === 'master'
      ? `<g transform="rotate(6 150 324)"><rect x="146" y="322" width="8" height="26" rx="3" fill="#8a929f" ${outlined('#8a929f', 2.5)}/><rect x="138" y="342" width="24" height="11" rx="3" fill="#5f6a7d" ${outlined('#5f6a7d', 2.5)}/></g>`
      : '';
  const icon = {
    critical: `<path d="M-6-6h12v12h-12zM-6 0h12M0-6v12" stroke="${jacketDark}" stroke-width="2" fill="none"/>`,
    confidence: `<path d="M-7-3h4l7-5v16l-7-5h-4z" fill="${jacketDark}"/>`,
    discipline: `<path d="m-6 0 4 4 8-9" stroke="${jacketDark}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    engagement: `<path d="M0 6C-10-1-6-9 0-4 6-9 10-1 0 6z" fill="#e5566a"/>`,
  }[c.accessory];
  const insignia = `<g transform="translate(149 270)"><circle r="13" cy="2" fill="#141a33" opacity=".18"/><circle r="12.5" fill="#fff" stroke="${jacketDark}" stroke-width="2.5"/>${icon}</g>`;
  const scarfColor = look.extra === 'scarf' ? '#e8604c' : '#f2b632';
  const scarfBack = mix(scarfColor, '#000', 0.14);
  const scarfLoop =
    'M154 206C138 207 130 218 131 230C132 241 138 249 146 253Q180 268 214 253C222 249 228 241 229 230C230 218 222 207 206 206Q180 212 154 206Z';
  const scarfRoll =
    'M131 230C133 224 136 220 140 218C152 230 166 236 180 236C194 236 208 230 220 218C224 220 227 224 229 230C228 241 222 249 214 253Q180 268 146 253C138 249 132 241 131 230Z';
  const tailBack = 'M193 256C196 274 195 292 191 309L207 312C210 294 210 274 207 256Z';
  const tailFront = 'M204 256C211 272 215 288 215 304L230 300C228 284 222 268 214 254Z';
  let ribs = '';
  for (let x = 136; x <= 224; x += 8)
    ribs += `M${fx(x - (x - 180) * 0.08)} 216L${fx(x + (x - 180) * 0.1)} 268`;
  const scarf =
    look.extra === 'scarf' || c.archetype === 'mentor'
      ? `<g clip-path="url(#bi-torso)" fill="#141a33" opacity=".18"><path d="${scarfLoop}" transform="translate(0 6)"/><path d="${tailBack}${tailFront}" transform="translate(4 3)"/></g><path d="${scarfLoop}" fill="${scarfBack}" ${outlined(scarfColor)}/><path d="${scarfRoll}" fill="${scarfColor}" ${outlined(scarfColor)}/><g clip-path="url(#bi-scarf)" fill="none" stroke-linecap="round"><path d="${ribs}" stroke="${mix(scarfColor, '#000', 0.2)}" stroke-width="2.6" opacity=".5"/><path d="M139 224C152 236 166 240 180 240C194 240 208 236 221 224" stroke="${mix(scarfColor, '#fff', 0.45)}" stroke-width="3" opacity=".6"/></g><path d="${tailBack}" fill="${scarfBack}" ${outlined(scarfColor)}/><path d="${tailFront}" fill="${scarfColor}" ${outlined(scarfColor)}/><path d="M199 262C201 278 201 292 198 304M210 264C215 276 218 288 221 298" fill="none" stroke="${mix(scarfColor, '#fff', 0.35)}" stroke-width="2.4" stroke-linecap="round" opacity=".7"/><path d="M194 311v5M200 312v5M206 313v5M217 303l1 5M223 301l1 5M229 299l1 5" stroke="${edge(scarfColor)}" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="204" cy="254" rx="12" ry="10" fill="${scarfColor}" ${outlined(scarfColor)}/><path d="M197 251Q204 247 211 251M198 258Q204 261 210 258" fill="none" stroke="${mix(scarfColor, '#000', 0.16)}" stroke-width="2.2" stroke-linecap="round"/>`
      : '';
  const medal =
    look.extra === 'medal'
      ? `<path d="M163 230L180 266L197 230" fill="none" stroke="#2f5fc9" stroke-width="10" stroke-linejoin="round"/><path d="M163 230L180 266L197 230" fill="none" stroke="#4f82ec" stroke-width="5" stroke-linejoin="round"/><circle cx="181" cy="282" r="14" fill="#141a33" opacity=".2"/><circle cx="180" cy="279" r="14" fill="#f4c542" ${outlined('#f4c542', 3)}/><circle cx="180" cy="279" r="9" fill="none" stroke="#fff3c4" stroke-width="1.6" opacity=".9"/><path d="m180 271 2.6 5.4 5.8.8-4.2 4 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.2-4 5.8-.8z" fill="#fff6d0"/>`
      : '';
  const chinShadow = '<ellipse cx="180" cy="230" rx="34" ry="9" fill="#141a33" opacity=".13"/>';
  const ears = animal
    ? {
        strategist: mirror(
          `<path d="M118 122q-16-52-2-74 36 20 48 50z" fill="${fur.fur}" ${outlined(fur.fur)}/><path d="M122 112q-10-36-2-50 24 16 30 38z" fill="${fur.light}"/><path d="M116 50q4 14 14 18-6-14-14-18z" fill="${ink}"/>`,
        ),
        leader: '',
        master: mirror(
          `<circle cx="122" cy="108" r="15" fill="${fur.dark}" ${outlined(fur.dark)}/>`,
        ),
        mentor: mirror(
          `<circle cx="124" cy="104" r="24" fill="${fur.fur}" ${outlined(fur.fur)}/><circle cx="124" cy="104" r="13" fill="${fur.light}"/>`,
        ),
        jobseeker: mirror(
          `<circle cx="122" cy="104" r="24" fill="${fur.dark}" ${outlined(fur.dark)}/>`,
        ),
      }[c.archetype]
    : mirror(
        `<ellipse cx="119" cy="166" rx="10" ry="13" fill="${skinShade}" ${outlined(skin, 2.5)}/>`,
      );
  const mane =
    animal && c.archetype === 'leader'
      ? (() => {
          let petals = '';
          for (let i = 0; i < 12; i++) {
            const angle = (i * Math.PI) / 6;
            petals += `<circle cx="${(180 + Math.cos(angle) * 78).toFixed(1)}" cy="${(158 + Math.sin(angle) * 72).toFixed(1)}" r="28"/>`;
          }
          return `<g fill="#c06a2b" ${outlined('#c06a2b')}>${petals}</g><circle cx="180" cy="158" r="86" fill="#d98436"/>`;
        })()
      : '';
  const headShape = animal
    ? { cx: 180, cy: 156, rx: 74, ry: 66 }
    : { cx: 180, cy: 160, rx: 62, ry: 64 };
  const head = `<ellipse cx="${headShape.cx}" cy="${headShape.cy}" rx="${headShape.rx}" ry="${headShape.ry}" fill="url(#bi-skin)" ${outlined(skin)}/>`;
  const brimShadow = {
    helmet: 'M96 138Q180 124 264 138V154Q180 142 96 154Z',
    cap: 'M96 140Q180 126 264 140V156Q180 144 96 156Z',
    beanie: 'M96 142Q180 130 264 142V154Q180 144 96 154Z',
    none: '',
  }[look.headwear];
  const faceShadow = brimShadow
    ? `<g clip-path="url(#bi-head)">${shadow(brimShadow, 0.15)}</g>`
    : '';
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
  const hairLine = outlined(hair, 2.5);
  const darkHair = luma(hair) < 0.25;
  const strand = darkHair ? mix(hair, '#fff', 0.22) : mix(hair, '#1b1440', 0.32);
  const shine = mix(hair, '#fff', darkHair ? 0.3 : 0.55);
  const hairCut = {
    short: pointed
      ? 'M121 164C114 146 112 128 116 112L104 100H128C138 88 152 81 166 79L160 62L184 76C206 77 224 85 236 98L256 92L246 116C250 132 248 150 240 164L234 161C235 151 234 142 230 135L222 140L214 124L204 138L194 122L182 137L172 122L158 136L152 125C144 132 138 140 135 148L128 162Z'
      : 'M121 164C113 142 113 114 132 98C148 85 168 81 188 83C214 86 238 98 245 124C249 140 246 154 240 164L234 161C235 149 233 139 227 131C214 119 196 114 178 118C160 122 145 131 135 148L128 162Z',
    long: pointed
      ? 'M126 208C114 198 108 178 110 156C110 124 126 99 154 89C172 83 194 83 212 88C238 97 252 122 250 156C250 178 246 198 236 208C233 200 233 192 234 184C236 168 236 150 230 140C226 132 220 124 214 118L212 136L202 116L194 135L184 116L174 135L166 118L156 135L150 124C140 132 132 146 128 160C126 176 129 192 132 202C131 206 129 208 126 208Z'
      : 'M126 208C114 198 108 178 110 156C110 124 126 99 154 89C172 83 194 83 212 88C238 97 252 122 250 156C250 178 246 198 236 208C233 200 233 192 234 184C236 168 236 150 230 140C224 128 214 118 202 110C192 124 170 133 150 137C138 140 130 148 128 160C126 176 129 192 132 202C131 206 129 208 126 208Z',
    bob: pointed
      ? 'M118 216C108 206 104 188 106 166C106 126 126 96 156 88C172 84 190 84 206 88C236 96 256 126 254 166C256 188 252 206 242 216C236 220 230 218 230 212C234 198 236 178 232 160C230 150 228 142 224 134L216 136L208 120L198 136L190 120L180 136L170 120L162 136L154 120L144 135L138 128C132 140 130 150 128 160C124 178 126 198 130 212C130 218 124 220 118 216Z'
      : 'M118 216C108 206 104 188 106 166C106 126 126 96 156 88C172 84 190 84 206 88C236 96 256 126 254 166C256 188 252 206 242 216C236 220 230 218 230 212C234 198 236 178 232 160C230 150 228 142 224 134Q214 137 204 129Q192 137 180 129Q168 137 156 129Q146 137 136 131C132 140 130 150 128 160C124 178 126 198 130 212C130 218 124 220 118 216Z',
  }[cut];
  const strands = {
    short: 'M214 100C194 98 168 104 146 124M230 114C214 106 194 106 176 112',
    long: 'M202 112C186 124 166 131 148 134M198 92C176 92 154 100 140 114M118 156C116 176 120 192 126 202M242 156C244 174 242 190 238 200',
    bob: 'M168 92C160 104 156 116 156 126M196 92C200 104 202 114 204 126M114 168C112 186 114 200 120 210M246 168C248 186 246 200 240 210',
  }[cut];
  const underHat = mirror(
    {
      short: `<path d="M118 140q-4 20 4 36l10-30z" fill="${hair}" ${hairLine}/>`,
      long: `<path d="M114 146C110 170 112 192 126 208C131 206 132 202 132 196C128 180 128 162 132 146Z" fill="${hair}" ${hairLine}/>`,
      bob: `<path d="M108 150C104 180 106 204 118 216C124 220 130 218 130 212C126 196 124 176 128 150Z" fill="${hair}" ${hairLine}/>`,
    }[cut],
  );
  const hairFront = animal
    ? ''
    : bare
      ? `${pointed ? `<path d="M184 82C176 66 182 52 198 47C190 57 188 68 192 82Z" fill="${hair}" ${hairLine}/>` : ''}<path d="${hairCut}" fill="${hair}" ${hairLine}/><g clip-path="url(#bi-hair)" fill="none" stroke-linecap="round"><path d="${strands}" stroke="${strand}" stroke-width="2.4"/><path d="M138 112C148 99 164 92 182 90" stroke="${shine}" stroke-width="5" opacity=".5"/></g>`
      : underHat;
  const headband =
    !animal && bare && c.universe === 'sport'
      ? `<g clip-path="url(#bi-crown)"><path d="M100 132Q180 96 260 132V148Q180 112 100 148Z" fill="${accent}" ${outlined(accent, 2.5)}/></g>`
      : '';
  const eyewear = {
    none: '',
    round: `<g fill="#cfe6ff" fill-opacity=".22" stroke="#2c3346" stroke-width="3.5"><circle cx="154" cy="160" r="16"/><circle cx="206" cy="160" r="16"/></g><path d="M170 158q10-6 20 0M138 156l-22-5M222 156l22-5" fill="none" stroke="#2c3346" stroke-width="3.5" stroke-linecap="round"/>`,
    sunglasses: `${mirror('<path d="M134 150h38q2 24-18 26-20-2-20-26z" fill="#141a26"/><path d="M141 155h10" stroke="#fff" stroke-width="3" opacity=".55" stroke-linecap="round"/>')}<path d="M172 154q8-5 16 0" fill="none" stroke="#141a26" stroke-width="5"/><path d="M134 152l-18-4M226 152l18-4" stroke="#141a26" stroke-width="4" stroke-linecap="round"/>`,
    goggles: `<path d="M108 158q72-16 144 0" stroke="#3b4258" stroke-width="9" fill="none"/><rect x="132" y="143" width="96" height="36" rx="17" fill="#bfe8f5" fill-opacity=".6" stroke="#3b4258" stroke-width="5"/><path d="M180 145v32" stroke="#3b4258" stroke-width="4"/><path d="M142 152l12 0" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".8"/>`,
  }[look.eyewear];
  const capDark = mix(main, '#000', 0.28);
  const headwear = {
    helmet: `<path d="M106 136q-2-66 74-70 76 4 74 70z" fill="url(#bi-helmet)" ${outlined('#f6b51c')}/><path d="M180 70v58" stroke="#ffe796" stroke-width="12" stroke-linecap="round" opacity=".7"/><path d="M130 92q-10 18-10 40" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".45"/><rect x="162" y="94" width="36" height="22" rx="5" fill="#283252"/><text x="180" y="110" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#fff">BI</text><path d="M94 134q86-14 172 0 4 12-10 14H104q-14-2-10-14z" fill="#f0a50f" ${outlined('#f0a50f')}/><path d="M110 134q70-10 140 0" stroke="#ffd25a" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    cap: `<path d="M110 132q-2-58 70-62 72 4 70 62z" fill="url(#bi-cap)" ${outlined(main)}/><path d="M180 72v58M146 80q-8 24-6 50M214 80q8 24 6 50" stroke="${mix(main, '#000', 0.2)}" stroke-width="2.5" fill="none"/><circle cx="180" cy="72" r="5" fill="${mix(main, '#000', 0.3)}"/><text x="180" y="116" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#fff">BI</text><path d="M102 130q78-16 156 0 6 14-8 20-70-12-140 0-14-6-8-20z" fill="${capDark}" ${outlined(capDark)}/>`,
    beanie: `<path d="M108 138q-2-68 72-72 74 4 72 72z" fill="${accent}" ${outlined(accent)}/><path d="M130 88v40M150 76v52M170 70v58M190 70v58M210 76v52M230 88v40" stroke="${mix(accent, '#000', 0.12)}" stroke-width="4"/><rect x="102" y="118" width="156" height="26" rx="13" fill="${mix(accent, '#000', 0.18)}" ${outlined(mix(accent, '#000', 0.18))}/><path d="M114 131h132" stroke="${mix(accent, '#fff', 0.3)}" stroke-width="3" stroke-dasharray="6 6"/><circle cx="180" cy="62" r="15" fill="${mix(accent, '#fff', 0.25)}" ${outlined(mix(accent, '#fff', 0.25))}/><circle cx="175" cy="57" r="5" fill="#fff" opacity=".45"/>`,
    none: '',
  }[look.headwear];
  const phones = '#2b3142';
  const bandTop = bare && !animal ? 80 : 62;
  const phonesBand = `M106 158Q98 ${bandTop + 4} 180 ${bandTop}Q262 ${bandTop + 4} 254 158`;
  const headphones =
    look.extra === 'headphones'
      ? `<path d="${phonesBand}" fill="none" stroke="${edge(phones)}" stroke-width="13" stroke-linecap="round"/><path d="${phonesBand}" fill="none" stroke="${phones}" stroke-width="8" stroke-linecap="round"/>${mirror(`<rect x="90" y="138" width="28" height="46" rx="13" fill="${phones}" ${outlined(phones)}/><rect x="96" y="146" width="15" height="30" rx="7" fill="${main}"/><path d="M114 144v34" stroke="#4a5266" stroke-width="4" stroke-linecap="round"/>`)}`
      : '';
  const hand = (curve: Curve, side: 1 | -1) => {
    const h = handAt(curve);
    return `<g transform="translate(${h.x} ${h.y}) rotate(${h.angle})"><path d="M-11-9C-13.5 3-9 14 0 14C9 14 13.5 3 11-9C8-13-8-13-11-9Z" fill="${skin}" ${outlined(skin, 2.5)}/><path d="M${8 * side}-4C${15 * side}-4 ${18 * side} 4 ${14 * side} 9C${11 * side} 12 ${8 * side} 8 ${7 * side} 4Z" fill="${skin}" ${outlined(skin, 2.5)}/></g>`;
  };
  const openHand = (curve: Curve) => {
    const h = handAt(curve, 10);
    return `<g transform="translate(${h.x} ${h.y}) rotate(${fx(h.angle + 180)})"><path d="M-10 9V-4C-10-8-5-8-5-4V-10C-5-14 0-14 0-10V-12C0-16 5-16 5-12V-8C5-12 10-12 10-8V7C10 14 5 16 0 16C-6 16-10 14-10 9Z" fill="${skin}" ${outlined(skin, 2.5)}/><path d="M-9 4C-15 2-18-4-15-7C-13-9-10-6-9-3Z" fill="${skin}" ${outlined(skin, 2.5)}/></g>`;
  };
  const prop = {
    strategist: `<g transform="rotate(-12 270 286)"><rect x="244" y="250" width="54" height="70" rx="8" fill="#2d3550" ${outlined('#2d3550')}/><rect x="249" y="256" width="44" height="56" rx="4" fill="#c4ecf7"/><path d="M255 268h32M255 280h32M255 292h20M264 260v48M278 260v48" stroke="#5a7bd8" stroke-width="2" fill="none"/></g>`,
    leader: `<g transform="rotate(-8 258 280)"><path d="M264 250v-24" stroke="#2d3550" stroke-width="4" stroke-linecap="round"/><rect x="244" y="248" width="30" height="54" rx="7" fill="#2d3550" ${outlined('#2d3550')}/><rect x="250" y="256" width="18" height="13" rx="3" fill="#8fe0c8"/><path d="M252 278h14M252 285h14M252 292h14" stroke="#596482" stroke-width="2.5"/></g>`,
    master: `<g transform="rotate(28 256 282)"><rect x="250" y="240" width="12" height="66" rx="5" fill="#9aa7bd" ${outlined('#9aa7bd', 2.5)}/><path d="M243 236a15 15 0 1 1 26 0l-6 6v-10h-14v10z" fill="#9aa7bd" ${outlined('#9aa7bd', 2.5)}/><rect x="252" y="272" width="8" height="26" rx="3" fill="#6f7c93"/></g>`,
    mentor: '',
    jobseeker: `<g transform="rotate(-8 262 300)"><rect x="232" y="268" width="58" height="72" rx="7" fill="#f6f1e6" stroke="#35435c" stroke-width="4"/><path d="M242 286h36M242 298h36M242 310h24" stroke="#7f93c4" stroke-width="3"/><path d="M252 268v-8h18v8" fill="none" stroke="#35435c" stroke-width="4"/></g>`,
  }[c.archetype];
  const wrist = pointOn(leftArm, 0.93);
  const [wristX, wristY] = directionOn(leftArm, 0.93);
  const wristAngle = fx((Math.atan2(wristY, wristX) * 180) / Math.PI - 90);
  const watch =
    look.extra === 'watch'
      ? `<g transform="translate(${fx(wrist[0])} ${fx(wrist[1])}) rotate(${wristAngle})"><rect x="-15" y="-6" width="30" height="12" rx="5" fill="#202a38" ${outlined('#202a38', 2)}/><circle r="8.5" fill="#a9dce6" stroke="#d2b873" stroke-width="3"/><path d="M0-4v4l3 2" fill="none" stroke="#34445a" stroke-width="1.6" stroke-linecap="round"/></g>`
      : '';
  const badge = c.boosted
    ? '<g data-part="boosted" transform="translate(286 92)"><circle r="24" fill="#f8d16b" opacity=".3"/><circle r="17" cy="2" fill="#141a33" opacity=".16"/><circle r="17" fill="#f6c343" stroke="#fff" stroke-width="3"/><path d="m0-10 3 6.4 7 .9-5.1 4.8 1.3 6.9L0 5.6l-6.2 3.4 1.3-6.9-5.1-4.8 7-.9z" fill="#fff"/></g>'
    : '';
  const defs = `<defs><linearGradient id="bi-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg.top}"/><stop offset="1" stop-color="${bg.bottom}"/></linearGradient><clipPath id="bi-clip"><circle cx="180" cy="200" r="160"/></clipPath><clipPath id="bi-torso"><path d="${torsoPath}"/></clipPath><clipPath id="bi-vest-clip"><path d="${vestPanel}"/><path d="${vestPanel}" transform="${flip}"/></clipPath><clipPath id="bi-head"><ellipse cx="${headShape.cx}" cy="${headShape.cy}" rx="${headShape.rx}" ry="${headShape.ry}"/></clipPath><clipPath id="bi-scarf"><path d="${scarfRoll}"/></clipPath><clipPath id="bi-hair"><path d="${hairCut}"/></clipPath><clipPath id="bi-crown"><path d="${hairCut}"/><ellipse cx="${headShape.cx}" cy="${headShape.cy}" rx="${headShape.rx}" ry="${headShape.ry}"/></clipPath><radialGradient id="bi-glow"><stop offset="0" stop-color="#ffe08a" stop-opacity=".75"/><stop offset="1" stop-color="#ffe08a" stop-opacity="0"/></radialGradient><linearGradient id="bi-jacket" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mix(jacket, '#fff', 0.12)}"/><stop offset="1" stop-color="${mix(jacket, '#000', 0.12)}"/></linearGradient><linearGradient id="bi-vest" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(vestColor, '#fff', 0.18)}"/><stop offset="1" stop-color="${mix(vestColor, '#7a9a10', 0.18)}"/></linearGradient><linearGradient id="bi-round" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#10162e" stop-opacity=".28"/><stop offset=".22" stop-color="#10162e" stop-opacity="0"/><stop offset=".78" stop-color="#10162e" stop-opacity="0"/><stop offset="1" stop-color="#10162e" stop-opacity=".28"/></linearGradient><radialGradient id="bi-skin" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="${mix(skin, '#fff', 0.18)}"/><stop offset="1" stop-color="${skin}"/></radialGradient><linearGradient id="bi-helmet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe066"/><stop offset="1" stop-color="#f6b51c"/></linearGradient><linearGradient id="bi-cap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(main, '#fff', 0.15)}"/><stop offset="1" stop-color="${main}"/></linearGradient></defs>`;
  const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 430" role="img" aria-label="${avatarName(c)}">${defs}${part(`background-${look.background}`, backdrop)}${motif}${glow}<ellipse cx="180" cy="388" rx="90" ry="12" fill="#1b2450" opacity=".16"/>${cape}${hairBack}${legs}${sleeve(leftArm)}${sleeve(rightArm)}${neck}${torso}${collar}${leaderDetails}${hammer}${insignia}${part('extra-medal', medal)}${part(look.extra === 'scarf' ? 'extra-scarf' : 'outfit-scarf', scarf)}${chinShadow}${ears}${mane}${head}${faceShadow}${muzzle}${teeth}${part(`expression-${look.expression}`, eyes + brows + nose + mouth + cheeks)}${hairFront}${headband}${part(`eyewear-${look.eyewear}`, eyewear)}${part(`headwear-${look.headwear}`, headwear)}${part('extra-headphones', headphones)}${prop && `<g transform="translate(6 0)">${prop}</g>`}${hand(leftArm, 1)}${wave ? openHand(rightArm) : hand(rightArm, -1)}${part('extra-watch', watch)}${badge}</svg>`;
  return { prompt: describe(c, look), fallbackSvg };
}
