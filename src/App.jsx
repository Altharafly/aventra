import React, { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';
import {
  Search, MapPin, Clock, Mountain, Car, Bike, Footprints, Users, ChevronLeft,
  Star, Home as HomeIcon, SlidersHorizontal, Compass, BarChart3, TrendingUp,
  TrendingDown, Minus, AlertTriangle, CheckCircle2, Waves, Trees, Droplets,
  Navigation2, Heart, Info, ShieldAlert, XCircle, ArrowRight, Sunrise, CloudRain,
  Sparkles, Send, Bot, Layers, Locate, Map as MapIcon, MoreHorizontal, MessageCircle,
} from 'lucide-react';

/* ---------------------------------- TOKENS ---------------------------------- */
const C = {
  forestDark: '#122A20',
  forest: '#1B4332',
  trail: '#2D6A4F',
  trailLight: '#3E8F68',
  leaf: '#74C69D',
  leafSoft: '#CBEBD9',
  mist: '#F3F7F1',
  paper: '#FFFFFF',
  earth: '#B08968',
  earthSoft: '#EFE3D6',
  ink: '#1B2621',
  inkMuted: '#5E6E66',
  border: '#E2EAE3',
  sky: '#4A7C9E',
};
const DIFF = {
  Easy: { c: '#2D9D63', bg: '#E3F5EB', ring: '#B7E4C7' },
  Moderate: { c: '#C9821B', bg: '#FBEEDA', ring: '#F0D5A6' },
  Difficult: { c: '#D9612B', bg: '#FBE5DA', ring: '#F0BE9F' },
  Extreme: { c: '#B31E2E', bg: '#F8DEE0', ring: '#EAAAB0' },
};
const CATEGORY_ICON = { Waterfall: Waves, Mountain: Mountain, Hill: Trees, Lake: Droplets, Viewpoint: Sunrise };

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=Urbanist:wght@300;400;600;700&display=swap');`;

/* ------------------------- REAL-WORLD MAP HELPERS ------------------------- */
// Web Mercator projection + OpenTopoMap tiles, so routes sit on real terrain.
function project(lat, lng, z) {
  const sc = 256 * 2 ** z;
  const sin = Math.sin((lat * Math.PI) / 180);
  return [((lng + 180) / 360) * sc, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * sc];
}
function smoothPath(p) {
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
    const c1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6];
    const c2 = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${c[0].toFixed(1)},${c[1].toFixed(1)}`;
  }
  return d;
}
function smoothLegs(p) {
  const out = [];
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
    const c1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6], c2 = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6];
    out.push(`M${b[0].toFixed(1)},${b[1].toFixed(1)} C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${c[0].toFixed(1)},${c[1].toFixed(1)}`);
  }
  return out;
}
const RISK = { low: '#2FBF71', med: '#F2B134', high: '#F2711C', extreme: '#E5384B' };
function buildMap({ zoom, theme, route, points, legs = [], nosignal }) {
  const P = route.map(([la, ln]) => project(la, ln, zoom));
  const xs = P.map((q) => q[0]), ys = P.map((q) => q[1]);
  const wx = (Math.min(...xs) + Math.max(...xs)) / 2, wy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const xy = P.map(([x, y]) => [170 + x - wx, 95 + y - wy]);
  return {
    viewBox: '0 0 340 190', theme, geoStart: route[0],
    path: smoothPath(xy),
    box: { w: Math.max(...xy.map((q) => q[0])) - Math.min(...xy.map((q) => q[0])), h: Math.max(...xy.map((q) => q[1])) - Math.min(...xy.map((q) => q[1])) },
    legs: smoothLegs(xy).map((d, i) => ({ d, risk: (legs[i] || ['low', 8])[0], grade: (legs[i] || ['low', 8])[1], mx: (xy[i][0] + xy[i + 1][0]) / 2, my: (xy[i][1] + xy[i + 1][1]) / 2 })),
    nosignal: nosignal ? { from: nosignal[0], to: nosignal[1] } : null,
    waypoints: points.map(([i, type, label]) => ({ x: xy[i][0], y: xy[i][1], type, label, at: i })),
    tile: { zoom, wx, wy, cx: 170, cy: 95 },
  };
}
// Offline terrain renderer (no remote images): synthetic elevation -> hillshade, forest, water, contours.
const hash2 = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const elevAt = (x, y) => 0.55 * vnoise(x / 150, y / 150) + 0.3 * vnoise(x / 62, y / 62 + 9) + 0.15 * vnoise(x / 26, y / 26 + 4);
const mix = (p, q, t) => p.map((v, i) => Math.round(v + (q[i] - v) * t));
const RAMP = [[150, 196, 140], [118, 170, 112], [196, 186, 140], [232, 226, 208]];
function terrainColor(e, f, sh) {
  const t = Math.min(0.999, Math.max(0, (e - 0.2) / 0.7)) * 3, i = Math.floor(t);
  let c = mix(RAMP[i], RAMP[i + 1], t - i);
  if (e < 0.24) c = [140, 187, 214];
  else if (f > 0.55 && e < 0.62) c = mix(c, [64, 116, 78], Math.min(1, (f - 0.55) * 4) * 0.7);
  const k = 0.82 + sh * 0.5;
  return `rgb(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0})`;
}
const SEG = { 1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[0, 1]], 5: [[0, 3], [2, 1]], 6: [[0, 2]], 7: [[0, 3]], 8: [[0, 3]], 9: [[0, 2]], 10: [[0, 1], [3, 2]], 11: [[0, 1]], 12: [[3, 1]], 13: [[2, 1]], 14: [[3, 2]] };
function TileLayer({ wx, wy, cx, cy, x0, y0, x1, y1, S = 10 }) {
  const { cells, minor, major } = useMemo(() => {
    const nx = Math.ceil((x1 - x0) / S) + 1, ny = Math.ceil((y1 - y0) / S) + 1;
    const g = [];
    for (let j = 0; j < ny; j++) { g.push([]); for (let i = 0; i < nx; i++) g[j].push(elevAt(wx + x0 - cx + i * S, wy + y0 - cy + j * S)); }
    const cells = [];
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const e = g[j][i], dx = (g[j][Math.min(i + 1, nx - 1)] - g[j][Math.max(i - 1, 0)]), dy = (g[Math.min(j + 1, ny - 1)][i] - g[Math.max(j - 1, 0)][i]);
      const f = vnoise((wx + x0 - cx + i * S) / 40 + 50, (wy + y0 - cy + j * S) / 40);
      cells.push(<rect key={`${i}-${j}`} x={x0 + i * S} y={y0 + j * S} width={S + 0.6} height={S + 0.6} fill={terrainColor(e, f, Math.max(-0.5, Math.min(0.5, (dx - dy) * 6)))} />);
    }
    let minor = '', major = '';
    for (let L = 0.2, n = 0; L < 1; L += 0.045, n++) {
      let p = '';
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = g[j][i], b = g[j][i + 1], c = g[j + 1][i + 1], d = g[j + 1][i];
        const k = (a > L ? 8 : 0) + (b > L ? 4 : 0) + (c > L ? 2 : 0) + (d > L ? 1 : 0);
        if (!SEG[k]) continue;
        const X = x0 + i * S, Y = y0 + j * S;
        const pt = [[X + S * ((L - a) / (b - a)), Y], [X + S, Y + S * ((L - b) / (c - b))], [X + S * ((L - d) / (c - d)), Y + S], [X, Y + S * ((L - a) / (d - a))]];
        SEG[k].forEach(([m, o]) => { p += `M${pt[m][0].toFixed(1)},${pt[m][1].toFixed(1)}L${pt[o][0].toFixed(1)},${pt[o][1].toFixed(1)}`; });
      }
      if (n % 4 === 0) major += p; else minor += p;
    }
    return { cells, minor, major };
  }, [wx, wy, cx, cy, x0, y0, x1, y1, S]);
  return (
    <g>
      <g style={{ filter: `blur(${(S * 0.4).toFixed(1)}px)` }}>{cells}</g>
      <path d={minor} fill="none" stroke="#8A6540" strokeWidth={0.5} opacity={0.5} />
      <path d={major} fill="none" stroke="#7A5530" strokeWidth={1} opacity={0.7} />
    </g>
  );
}

/* ---------------------------------- DATA ---------------------------------- */
const DESTINATIONS = [
  {
    id: 'cobanrondo',
    name: 'Coban Rondo',
    category: 'Waterfall',
    location: 'Pujon, Batu border',
    difficulty: 'Easy',
    distance: 1.4,
    duration: '30–45 min',
    elevationGain: 35,
    rating: 4.6,
    reviews: 5200,
    tagline: 'A cool pine-forest walk down to an 84 m waterfall',
    description:
      'A paved and stepped path winds through pine forest to one of the most visited waterfalls near Batu. The air stays misty and cool all year, and the walk is short enough for most visitors.',
    terrain: 'Paved path and concrete steps, damp and slippery near the falls',
    bestTime: 'Weekday mornings, dry season',
    vehicle: { car: true, motorbike: true, footOnly: 'About 700 m on foot from the parking area' },
    suitability: {
      age: '5–75',
      fitness: 'Beginner',
      family: true,
      notes: [
        'Steps get slippery after rain, wear shoes with good grip',
        'Handrails are available on most descents',
        'The climb back up is the tiring part for seniors, take breaks',
      ],
    },
    elevation: [
      { km: 0, elev: 1150 }, { km: 0.35, elev: 1135 }, { km: 0.7, elev: 1115 },
      { km: 1.05, elev: 1135 }, { km: 1.4, elev: 1150 },
    ],
    segments: [
      { range: '0–0.7 km', type: 'descent', note: 'Stepped descent through pine forest' },
      { range: '0.7–1.4 km', type: 'gentle', note: 'Return climb on the same stairs' },
    ],
    alternatives: [
      { name: 'Coban Putri Forest Trail', difficulty: 'Moderate', distance: 2.8, duration: '1.5 hrs', note: 'Longer forest path to a quieter, smaller falls' },
    ],
    mapData: buildMap({
      zoom: 16, theme: 'forest',
      route: [[-7.8869, 112.4757], [-7.8862, 112.4766], [-7.8855, 112.4772], [-7.8846, 112.4776], [-7.8838, 112.4784]],
      points: [[0, 'start', 'Pintu Masuk'], [1, 'shelter', 'Shelter'], [2, 'checkpoint', 'Pos Pandang'], [3, 'warning', 'Tangga licin'], [4, 'end', 'Dasar Coban']],
      legs: [['low', 8], ['low', 14], ['med', 22], ['med', 18]],
    }),
  },
  {
    id: 'paralayang',
    name: 'Paralayang Gunung Banyak',
    category: 'Viewpoint',
    location: 'Songgokerto, Batu',
    difficulty: 'Moderate',
    distance: 1.6,
    duration: '45–60 min',
    elevationGain: 170,
    rating: 4.7,
    reviews: 3100,
    tagline: 'A steep climb to the paragliding deck above Batu city',
    description:
      'A winding climb on paved road and concrete steps leads to the open take-off deck on Gunung Banyak, with wide views over Batu and the surrounding mountains. Sunrise and late afternoon are the best times.',
    terrain: 'Steep concrete road and steps, exposed grassy ridge at the top',
    bestTime: 'Sunrise or late afternoon, clear weather',
    vehicle: { car: true, motorbike: true, footOnly: 'Final 1.6 km on foot from the lower parking' },
    suitability: {
      age: '12–60',
      fitness: 'Intermediate',
      family: 'with older kids',
      notes: [
        'Several steep sections, rest often and carry water',
        'Wind can be strong at the deck, stay clear of the launch area',
        'Flights depend on weather and are run by licensed operators',
      ],
    },
    elevation: [
      { km: 0, elev: 1120 }, { km: 0.4, elev: 1170 }, { km: 0.8, elev: 1215 },
      { km: 1.2, elev: 1260 }, { km: 1.6, elev: 1290 },
    ],
    segments: [
      { range: '0–0.6 km', type: 'gentle', note: 'Paved road through farmland' },
      { range: '0.6–1.2 km', type: 'steep', note: 'Steep concrete steps' },
      { range: '1.2–1.6 km', type: 'gentle', note: 'Open grassy ridge to the take-off deck' },
    ],
    alternatives: [
      { name: 'Drive to Upper Parking', difficulty: 'Easy', distance: 0.3, duration: '10 min', note: 'Short walk, but the road is steep and narrow' },
      { name: 'Gunung Banyak Ridge Trek', difficulty: 'Difficult', distance: 4.5, duration: '2.5 hrs', note: 'Full trek along the ridge with sweeping views' },
    ],
    mapData: buildMap({
      zoom: 15, theme: 'hill',
      route: [[-7.8700, 112.5055], [-7.8688, 112.5072], [-7.8672, 112.5085], [-7.8660, 112.5102], [-7.8642, 112.5116], [-7.8630, 112.5135]],
      points: [[0, 'start', 'Parkir Bawah'], [2, 'checkpoint', 'Pos Istirahat'], [3, 'warning', 'Tebing curam'], [4, 'exit', 'Evakuasi'], [5, 'end', 'Take-off Deck']],
      legs: [['low', 10], ['med', 18], ['high', 28], ['high', 32], ['med', 20]],
    }),
  },
  {
    id: 'cangar',
    name: 'Cangar — Welirang Trail',
    category: 'Mountain',
    location: 'Cangar, Bumiaji, Batu',
    difficulty: 'Difficult',
    distance: 9,
    duration: '5–6 hrs',
    elevationGain: 1000,
    rating: 4.7,
    reviews: 1900,
    tagline: 'Hot springs at the gate, a serious mountain trail beyond',
    description:
      'Cangar is a gateway to the Arjuno–Welirang massif. Near the entrance there are easy hot spring and waterfall walks. Beyond the gate the trail climbs steeply through montane forest toward the sulfur miners area.',
    terrain: 'Forest trail with roots and rocks, sulfur-scented upper slopes',
    bestTime: 'Dry season (May–Sep), start before 7 AM',
    vehicle: { car: true, motorbike: true, footOnly: 'Entire trail on foot from the Cangar gate' },
    suitability: {
      age: '17–55',
      fitness: 'Advanced',
      family: false,
      notes: [
        'Register at the ranger post before climbing',
        'Temperatures drop sharply above 2,500 m',
        'Sulfur fumes near the upper area, carry a mask',
      ],
    },
    elevation: [
      { km: 0, elev: 1650 }, { km: 2, elev: 1850 }, { km: 4, elev: 2150 },
      { km: 6, elev: 2400 }, { km: 8, elev: 2600 }, { km: 9, elev: 2650 },
    ],
    segments: [
      { range: '0–3 km', type: 'gentle', note: 'Forest approach road and trail' },
      { range: '3–7 km', type: 'steep', note: 'Root-and-rock climb through montane forest' },
      { range: '7–9 km', type: 'steep', note: 'Exposed upper slopes, fog and wind' },
    ],
    alternatives: [
      { name: 'Hot Spring and Coban Walk', difficulty: 'Easy', distance: 1.5, duration: '45 min', note: 'Short, gentle walk near the entrance' },
      { name: 'Welirang Summit Push', difficulty: 'Extreme', distance: 16, duration: '10–12 hrs', note: 'Full summit route, overnight camp recommended' },
    ],
    mapData: buildMap({
      zoom: 13, theme: 'forest-ridge',
      route: [[-7.7345, 112.5327], [-7.7390, 112.5400], [-7.7440, 112.5470], [-7.7430, 112.5550], [-7.7480, 112.5620], [-7.7470, 112.5700], [-7.7510, 112.5770]],
      points: [[0, 'start', 'Gerbang Cangar'], [1, 'checkpoint', 'Pos Izin'], [2, 'warning', 'Zona longsor'], [3, 'water', 'Sumber air'], [4, 'camp', 'Area Pondokan'], [5, 'warning', 'Gas belerang'], [6, 'end', 'Batas Jalur']],
      legs: [['low', 9], ['med', 17], ['high', 26], ['high', 30], ['extreme', 38], ['high', 28]],
      nosignal: [4, 6],
    }),
  },
];

const CATEGORIES = ['All', 'Waterfall', 'Viewpoint', 'Mountain'];

/* ------------------------------- SHARED BITS ------------------------------- */
function DifficultyBadge({ level, size = 'md' }) {
  const d = DIFF[level];
  const pad = size === 'sm' ? '3px 9px' : '5px 12px';
  const font = size === 'sm' ? 12 : 13;
  return (
    <span
      style={{
        background: d.bg, color: d.c, padding: pad, borderRadius: 999,
        fontSize: font, fontWeight: 700, fontFamily: 'Manrope, sans-serif',
        display: 'inline-flex', alignItems: 'center', gap: 6, lineHeight: 1,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: 999, background: d.c }} />
      {level}
    </span>
  );
}

function StatPill({ icon: Icon, label, value }) {
  return (
    <div style={{ flex: 1, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 14, padding: '10px 8px', textAlign: 'center' }}>
      <Icon size={16} color={C.trail} style={{ margin: '0 auto 4px' }} />
      <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 14, color: C.ink }}>{value}</div>
      <div style={{ fontSize: 10.5, color: C.inkMuted, marginTop: 1 }}>{label}</div>
    </div>
  );
}

function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 15.5, color: C.ink }}>{children}</div>
      {sub && <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function DetailHeader({ title, subtitle, onBack }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 12px', background: C.paper, borderBottom: `1px solid ${C.border}` }}>
      <button onClick={onBack} style={{ background: C.mist, border: 'none', borderRadius: 10, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
        <ChevronLeft size={19} color={C.ink} />
      </button>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 15, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 1 }}>{subtitle}</div>}
      </div>
    </div>
  );
}

function HeroArt({ category, difficulty, height = 190 }) {
  const Icon = CATEGORY_ICON[category] || Mountain;
  const grad = {
    Waterfall: 'linear-gradient(160deg,#2C6E7F 0%, #1B4A56 100%)',
    Mountain: 'linear-gradient(160deg,#2D6A4F 0%, #123527 100%)',
    Hill: 'linear-gradient(160deg,#4F8F5C 0%, #1E4A2C 100%)',
    Viewpoint: 'linear-gradient(160deg,#3F8F72 0%, #17483A 100%)',
    Lake: 'linear-gradient(160deg,#3E7EA6 0%, #17384C 100%)',
  }[category];
  return (
    <div style={{ position: 'relative', height, background: grad, overflow: 'hidden' }}>
      <Icon size={height * 0.62} color="rgba(255,255,255,0.14)" style={{ position: 'absolute', right: -18, bottom: -18 }} strokeWidth={1.2} />
      <div style={{ position: 'absolute', left: 16, bottom: 14 }}>
        <DifficultyBadge level={difficulty} />
      </div>
    </div>
  );
}

/* ---------------------------------- AUTH FLOW ---------------------------------- */
const NEON = '#00FFA8';
const GRADIENT_BG = 'linear-gradient(180deg, #00BE80 0%, #00FFAA 100%)';
const URB = 'Urbanist, Manrope, sans-serif';

function AventraLogo({ size = 120, invert = false }) {
  const outer = invert ? NEON : '#000';
  const ring = invert ? '#0E2A1F' : '#19E39B';
  const base = [[50, 8], [8, 80], [92, 80]];
  const cx = 50, cy = 56;
  const pts = (s) => base.map(([x, y]) => `${cx + (x - cx) * s},${cy + (y - cy) * s}`).join(' ');
  return (
    <svg width={size} height={size * 0.95} viewBox="0 0 100 95" style={{ display: 'block' }}>
      <polygon points={pts(1)} fill={outer} stroke={outer} strokeWidth="13" strokeLinejoin="round" />
      {[0.78, 0.6, 0.43].map((s) => (
        <polygon key={s} points={pts(s)} fill={outer} stroke={ring} strokeWidth="2.2" strokeLinejoin="round" />
      ))}
      <polygon points={pts(0.3)} fill={outer} stroke={outer} strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

function SplashScreen({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div onClick={onDone} style={{ height: '100%', background: GRADIENT_BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}>
      <AventraLogo size={118} />
      <div style={{ fontFamily: URB, fontWeight: 700, fontSize: 14, color: '#000', letterSpacing: 0.3 }}>Aventra</div>
    </div>
  );
}

function OnboardingScreen({ onStart, onSignIn }) {
  return (
    <div style={{ height: '100%', background: GRADIENT_BG, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', padding: '0 26px 58px', textAlign: 'center' }}>
      <div style={{ fontFamily: URB, fontSize: 32, lineHeight: 1.1, letterSpacing: -0.9, color: '#000', fontWeight: 400 }}>
        Know every trail before your first step
      </div>
      <div style={{ fontFamily: URB, fontSize: 13, color: '#000', marginTop: 14 }}>
        Check difficulty, terrain and routes across Kota Batu with ease.
      </div>
      <button onClick={onStart} style={{ marginTop: 60, width: '66%', height: 40, borderRadius: 999, border: 'none', background: '#000', color: NEON, fontFamily: URB, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
        Start Journey
      </button>
      <div style={{ marginTop: 22, fontFamily: URB, fontSize: 12, color: 'rgba(0,0,0,0.6)' }}>
        Already have an account?{' '}
        <button onClick={onSignIn} style={{ background: 'none', border: 'none', padding: 0, fontFamily: URB, fontSize: 12, fontWeight: 700, color: '#000', cursor: 'pointer' }}>sign in</button>
      </div>
    </div>
  );
}

function AuthScreen({ mode, onSubmit, onSwitch }) {
  const signin = mode === 'signin';
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const submit = () => {
    if (!signin && pw !== pw2) { setErr('Passwords do not match'); return; }
    setErr('');
    onSubmit();
  };
  const field = { width: '100%', boxSizing: 'border-box', height: 38, borderRadius: 999, border: '1px solid #0A0A0A', background: '#FDFDFD', padding: '0 16px', fontSize: 11.5, outline: 'none', fontFamily: 'Inter, sans-serif', color: '#111', marginBottom: 18 };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: signin ? '#fff' : GRADIENT_BG }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '24px 20px 0' }}>
        {signin ? (
          <>
            <div style={{ fontFamily: URB, fontSize: 40, letterSpacing: -1.4, color: NEON, fontWeight: 400, lineHeight: 1 }}>Welcome</div>
            <div style={{ fontFamily: URB, fontSize: 12, color: NEON, marginTop: 8 }}>Log in to continue your journey!</div>
          </>
        ) : (
          <>
            <div style={{ fontFamily: URB, fontSize: 36, letterSpacing: -1.2, color: '#000', fontWeight: 400, lineHeight: 1.05 }}>Create An Account</div>
            <div style={{ fontFamily: URB, fontSize: 12.5, color: '#000', marginTop: 8 }}>Join now and begin your journey!</div>
          </>
        )}
      </div>

      <div style={{ background: '#181818', borderRadius: '58px 58px 0 0', padding: '38px 16% 28px', flexShrink: 0 }}>
        <div style={{ fontFamily: URB, fontSize: 21, color: NEON, fontWeight: 300, marginBottom: 20 }}>{signin ? 'Sign in' : 'Sign up'}</div>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter Your Email" type="email" style={field} />
        <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Enter Your Password" type="password" style={{ ...field, marginBottom: signin ? 8 : 18 }} />
        {!signin && <input value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Confirm Password" type="password" style={field} />}
        {signin && (
          <div style={{ textAlign: 'right', fontFamily: URB, fontSize: 11, color: '#fff', marginBottom: 34 }}>Forgot Password?</div>
        )}
        {err && <div style={{ fontSize: 11, color: '#FF7A7A', marginBottom: 8, textAlign: 'center' }}>{err}</div>}
        <button onClick={submit} style={{ width: '100%', height: 38, borderRadius: 999, border: 'none', background: NEON, color: '#000', fontFamily: URB, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', marginTop: signin ? 0 : 12 }}>
          {signin ? 'Sign in' : 'Sign up'}
        </button>
        <div style={{ textAlign: 'center', marginTop: 18, fontFamily: URB, fontSize: 12.5, color: '#fff' }}>
          {signin ? "Don't have an account?" : 'I already have an account'}
        </div>
        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <button onClick={onSwitch} style={{ background: 'none', border: 'none', padding: 0, fontFamily: URB, fontSize: 12, fontWeight: 700, color: NEON, cursor: 'pointer' }}>
            {signin ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- TRAIL CARD ---------------------------------- */
function ComplexityBars({ level }) {
  const n = ['Easy', 'Moderate', 'Difficult', 'Extreme'].indexOf(level) + 1;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2.5, height: 20, width: 24 }}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={{ width: 4.5, height: 5 + i * 3.5, borderRadius: 1.5, background: i <= n ? DIFF[level].c : '#D5DDD7' }} />
      ))}
    </div>
  );
}

function TrailCard({ d, onClick }) {
  const Icon = CATEGORY_ICON[d.category];
  const map = d.mapData;
  const diffColor = DIFF[d.difficulty].c;
  const start = map.waypoints.find((w) => w.type === 'start');
  const end = map.waypoints.find((w) => w.type === 'end');
  const maxElev = Math.max(...d.elevation.map((p) => p.elev));
  const Cell = ({ icon, label, value, valueColor }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 24, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 11, color: C.inkMuted, lineHeight: 1.2 }}>{label}</div>
        <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 13.5, color: valueColor || C.ink, lineHeight: 1.25, marginTop: 1 }}>{value}</div>
      </div>
    </div>
  );
  const tag = { background: C.trail, color: '#fff', fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 7, fontFamily: 'Manrope, sans-serif' };

  return (
    <button onClick={onClick} style={{ display: 'block', width: '100%', textAlign: 'left', padding: 0, border: 'none', background: C.paper, borderRadius: 22, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 6px 18px rgba(18,42,32,0.14)' }}>
      <div style={{ position: 'relative', height: 150 }}>
        <svg viewBox="0 0 340 190" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%', display: 'block' }}>
          <MapBackground theme={map.theme} gradId={`card-${d.id}`} />
          <TileLayer {...map.tile} x0={-10} y0={-10} x1={350} y1={200} />
          <path d={map.path} fill="none" stroke={diffColor} strokeWidth="10" strokeLinecap="round" opacity="0.3" style={{ filter: 'blur(3px)' }} />
          <path d={map.path} fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.7" />
          <path d={map.path} fill="none" stroke={diffColor} strokeWidth="3.4" strokeLinecap="round" />
          {start && <circle cx={start.x} cy={start.y} r="8" fill={C.trail} stroke="#fff" strokeWidth="2.5" />}
          {end && <circle cx={end.x} cy={end.y} r="8" fill={diffColor} stroke="#fff" strokeWidth="2.5" />}
        </svg>
        <div style={{ position: 'absolute', top: 12, left: 14, color: '#fff', fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 17, letterSpacing: 1.2, writingMode: 'vertical-rl', transform: 'rotate(180deg)', textShadow: '0 1px 4px rgba(0,0,0,0.35)' }}>
          KOTA BATU
        </div>
        <div style={{ position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: 999, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={18} color={C.trail} />
        </div>
        <div style={{ position: 'absolute', left: 12, bottom: -13, display: 'flex', gap: 8, zIndex: 2 }}>
          <span style={tag}>{d.category}</span>
          <span style={tag}>Popular</span>
        </div>
      </div>

      <div style={{ padding: '26px 16px 0' }}>
        <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 15.5, lineHeight: 1.3, color: '#2B2F2D', textTransform: 'uppercase' }}>
          {d.name}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 12px', marginTop: 18 }}>
          <Cell icon={<Navigation2 size={21} color={C.trail} />} label="Distance:" value={`${d.distance} km`} />
          <Cell icon={<ComplexityBars level={d.difficulty} />} label="Complexity:" value={d.difficulty.toLowerCase()} valueColor={diffColor} />
          <Cell icon={<Clock size={21} color={C.trail} />} label="Duration:" value={d.duration} />
          <Cell icon={<Mountain size={21} color={C.trail} />} label="Height:" value={`${maxElev.toLocaleString()} m`} />
        </div>
      </div>

      <div style={{ display: 'flex', marginTop: 18, height: 62 }}>
        <div style={{ flex: '0 0 43%', background: '#F6F4F0', display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px' }}>
          <div style={{ width: 34, height: 34, borderRadius: 999, background: C.forest, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MapPin size={16} color={C.leaf} />
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: C.ink, lineHeight: 1.25 }}>{d.location}</div>
        </div>
        <div style={{ flex: 1, background: C.trail, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Star size={16} fill="#fff" color="#fff" /> {d.rating}
          </div>
          <div style={{ fontSize: 11, marginTop: 1, opacity: 0.92 }}>{d.reviews.toLocaleString()} reviews</div>
        </div>
      </div>
    </button>
  );
}

/* ---------------------------------- HOME ---------------------------------- */
function HomeScreen({ onOpenDestination }) {
  const [cat, setCat] = useState('All');
  const [query, setQuery] = useState('');
  const list = DESTINATIONS.filter(
    (d) => (cat === 'All' || d.category === cat) && d.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.mist }}>
      <div style={{ background: C.forest, padding: '16px 16px 46px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AventraLogo size={26} invert />
          <span style={{ fontFamily: 'Urbanist, Manrope, sans-serif', fontWeight: 700, fontSize: 15, letterSpacing: 0.3 }}>Aventra</span>
        </div>
        <div style={{ fontSize: 12, color: C.leafSoft, marginTop: 10 }}>Good morning</div>
        <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 20, marginTop: 2 }}>Where to next?</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, color: C.leafSoft }}>
          <MapPin size={13} /> Kota Batu, East Java
        </div>
      </div>

      <div style={{ margin: '-30px 16px 0', background: C.paper, borderRadius: 16, boxShadow: '0 6px 20px rgba(18,42,32,0.12)', padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Search size={17} color={C.inkMuted} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search waterfalls, mountains, lakes…"
          style={{ border: 'none', outline: 'none', fontSize: 13.5, flex: 1, fontFamily: 'Inter, sans-serif', color: C.ink }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '16px 16px 4px', overflowX: 'auto' }}>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            style={{
              flexShrink: 0, padding: '7px 14px', borderRadius: 999, border: `1px solid ${cat === c ? C.trail : C.border}`,
              background: cat === c ? C.trail : C.paper, color: cat === c ? '#fff' : C.ink,
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            }}
          >
            {c}
          </button>
        ))}
      </div>

      <div style={{ padding: '14px 16px 6px' }}>
        <SectionTitle sub={`${list.length} destinations near you`}>Explore Kota Batu</SectionTitle>
      </div>

      <div style={{ padding: '0 16px 90px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {list.map((d) => <TrailCard key={d.id} d={d} onClick={() => onOpenDestination(d.id)} />)}
      </div>
    </div>
  );
}

/* ------------------------------ DESTINATION DETAIL ------------------------------ */
function DestinationDetail({ dest, onBack, onDifficulty, onProfile, onAskAI }) {
  const [fav, setFav] = useState(false);
  const CatIcon = CATEGORY_ICON[dest.category] || Mountain;
  const glass = { border: 'none', background: 'rgba(20,28,24,0.45)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' };
  return (
    <div style={{ position: 'relative', height: '100%', background: C.mist }}>
      <div style={{ height: '100%', overflowY: 'auto' }}>
        {/* HERO — full bleed. Set dest.photo to a URL to use a real photo instead of the terrain backdrop. */}
        <div style={{ position: 'relative', height: '100%', minHeight: 560, overflow: 'hidden', background: C.forestDark }}>
          {dest.photo ? (
            <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${dest.photo})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
          ) : (
            <svg viewBox="0 0 340 700" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              <TileLayer {...dest.mapData.tile} cy={350} x0={-40} y0={-20} x1={380} y1={720} />
              <path d={dest.mapData.path} transform="translate(0,255)" fill="none" stroke="#fff" strokeWidth={5} strokeLinecap="round" opacity={0.9} />
              <path d={dest.mapData.path} transform="translate(0,255)" fill="none" stroke={DIFF[dest.difficulty].c} strokeWidth={2.6} strokeLinecap="round" strokeDasharray="1 5" />
            </svg>
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(8,20,14,0.35) 0%, rgba(8,20,14,0) 28%, rgba(8,20,14,0.55) 52%, rgba(8,20,14,0.96) 100%)' }} />

          <button onClick={onBack} style={{ ...glass, position: 'absolute', top: 16, left: 16, width: 38, height: 38, borderRadius: 19 }}>
            <ChevronLeft size={20} color="#fff" />
          </button>
          <button style={{ ...glass, position: 'absolute', top: 16, right: 16, width: 38, height: 38, borderRadius: 19 }}>
            <MoreHorizontal size={20} color="#fff" />
          </button>

          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 18px 98px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ ...glass, cursor: 'default', gap: 6, height: 34, padding: '0 12px', borderRadius: 12, color: '#fff', fontSize: 12.5, fontWeight: 600 }}>
                <CatIcon size={14} color="#fff" /> {dest.category}
              </span>
              <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.5)' }} />
              <span style={{ color: '#fff', fontFamily: URB, fontWeight: 700, fontSize: 15 }}>{dest.distance} km · {dest.duration}</span>
            </div>
            <div style={{ fontFamily: URB, fontWeight: 700, fontSize: 26, color: '#fff', marginTop: 14 }}>{dest.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12.5, color: 'rgba(255,255,255,0.85)' }}>
              <MapPin size={14} /> {dest.location} <span>•</span> <Star size={13} fill="#FFC53D" color="#FFC53D" /> {dest.rating} ({dest.reviews.toLocaleString()})
            </div>
            <div style={{ marginTop: 10 }}><DifficultyBadge level={dest.difficulty} size="sm" /></div>
            <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.88)', lineHeight: 1.55, margin: '12px 0 0', display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {dest.description}
            </p>
            <div style={{ textAlign: 'center', marginTop: 12, fontSize: 10.5, color: 'rgba(255,255,255,0.6)' }}>Geser ke atas untuk detail rute</div>
          </div>
        </div>

        {/* DETAILS */}
        <div style={{ position: 'relative', marginTop: -22, background: C.mist, borderRadius: '24px 24px 0 0', padding: '20px 16px 104px' }}>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <StatPill icon={Navigation2} label="Distance" value={`${dest.distance} km`} />
          <StatPill icon={Clock} label="Duration" value={dest.duration} />
          <StatPill icon={TrendingUp} label="Elev. gain" value={`${dest.elevationGain} m`} />
        </div>

        <div style={{ marginTop: 14, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 14, padding: '10px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: C.inkMuted }}>
            <span style={{ fontWeight: 700, color: C.ink }}>Grafik elevasi</span>
            <span>{Math.min(...dest.elevation.map((p) => p.elev))}–{Math.max(...dest.elevation.map((p) => p.elev))} m</span>
          </div>
          <div style={{ marginTop: 8 }}><ElevationSparkline data={dest.elevation} color={DIFF[dest.difficulty].c} height={70} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.inkMuted, marginTop: 4 }}><span>0 km</span><span>{dest.distance} km</span></div>
        </div>

        <div style={{ marginTop: 14 }}>
          <MapTeaser dest={dest} onClick={onAskAI} />
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12 }}>
            <div style={{ fontSize: 11, color: C.inkMuted }}>Terrain</div>
            <div style={{ fontSize: 12.5, color: C.ink, fontWeight: 600, marginTop: 3, lineHeight: 1.4 }}>{dest.terrain}</div>
          </div>
          <div style={{ flex: 1, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12 }}>
            <div style={{ fontSize: 11, color: C.inkMuted, display: 'flex', alignItems: 'center', gap: 4 }}><Sunrise size={12} /> Best time</div>
            <div style={{ fontSize: 12.5, color: C.ink, fontWeight: 600, marginTop: 3, lineHeight: 1.4 }}>{dest.bestTime}</div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <SectionTitle>Vehicle accessibility</SectionTitle>
          <div style={{ display: 'flex', gap: 8 }}>
            <VehicleChip icon={Car} label="Car" ok={dest.vehicle.car} />
            <VehicleChip icon={Bike} label="Motorbike" ok={dest.vehicle.motorbike} />
            <VehicleChip icon={Footprints} label="On foot" note={dest.vehicle.footOnly} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
          <button
            onClick={onAskAI}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, #1B4332, #2D6A4F)', border: 'none', borderRadius: 14, padding: 14, cursor: 'pointer', textAlign: 'left' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Sparkles size={16} color={C.leaf} />
              </div>
              <div>
                <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 13.5, color: '#fff' }}>Tanya AI Route Guide</div>
                <div style={{ fontSize: 11.5, color: C.leafSoft, marginTop: 2 }}>Soal keamanan, perlengkapan, atau rute alternatif</div>
              </div>
            </div>
            <ArrowRight size={17} color="#fff" />
          </button>
          <NavCard title="Route Difficulty" sub="Terrain, suitability & vehicle access" onClick={onDifficulty} />
          <NavCard title="Route Profile" sub="Elevation chart & trail segments" onClick={onProfile} />
        </div>

        {dest.alternatives.length > 0 && (
          <div style={{ marginTop: 18, paddingBottom: 26 }}>
            <SectionTitle sub="If this route isn't right for you">Alternative routes</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dest.alternatives.map((a) => (
                <div key={a.name} style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 13, color: C.ink }}>{a.name}</div>
                    <DifficultyBadge level={a.difficulty} size="sm" />
                  </div>
                  <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 5 }}>{a.distance} km • {a.duration} — {a.note}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {dest.alternatives.length === 0 && <div style={{ height: 20 }} />}
        </div>
      </div>

      {/* FLOATING ACTION BAR */}
      <div style={{ position: 'absolute', left: 14, right: 14, bottom: 14, display: 'flex', alignItems: 'center', gap: 8, padding: 6, borderRadius: 40, background: 'rgba(20,28,24,0.55)', backdropFilter: 'blur(14px)' }}>
        <button onClick={onAskAI} style={{ flex: 1, height: 46, borderRadius: 26, border: 'none', background: GRADIENT_BG, color: C.forestDark, fontFamily: URB, fontWeight: 700, fontSize: 15.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
          <MapIcon size={18} /> Lihat Peta Rute
        </button>
        <button onClick={() => setFav(!fav)} style={{ width: 46, height: 46, borderRadius: 23, border: 'none', background: 'rgba(30,40,34,0.72)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Heart size={19} color={fav ? '#FF5D73' : '#fff'} fill={fav ? '#FF5D73' : 'none'} />
        </button>
        <button onClick={onAskAI} style={{ width: 46, height: 46, borderRadius: 23, border: 'none', background: 'rgba(30,40,34,0.72)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <MessageCircle size={19} color="#fff" />
        </button>
      </div>
    </div>
  );
}

function VehicleChip({ icon: Icon, label, ok, note }) {
  const active = ok !== false;
  return (
    <div style={{ flex: 1, background: active ? C.leafSoft : C.mist, borderRadius: 14, padding: '10px 8px', textAlign: 'center', border: `1px solid ${active ? C.ring : C.border}` }}>
      <Icon size={16} color={active ? C.trail : C.inkMuted} style={{ margin: '0 auto 4px' }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: C.ink }}>{label}</div>
      <div style={{ fontSize: 9.5, color: C.inkMuted, marginTop: 2, lineHeight: 1.2 }}>{note || (ok ? 'Accessible' : 'Not accessible')}</div>
    </div>
  );
}

function NavCard({ title, sub, onClick }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.paper, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, cursor: 'pointer', textAlign: 'left' }}>
      <div>
        <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 13.5, color: C.ink }}>{title}</div>
        <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>{sub}</div>
      </div>
      <ArrowRight size={17} color={C.trail} />
    </button>
  );
}

/* -------------------------------- ROUTE MAP PREVIEW -------------------------------- */
function tri(cx, cy, r) {
  return `${cx},${cy - r} ${cx - r},${cy + r * 0.85} ${cx + r},${cy + r * 0.85}`;
}

function treeAt(x, y, s = 1) {
  return (
    <g key={`t-${x}-${y}`} opacity={0.55}>
      <polygon points={tri(x, y - 10 * s, 7 * s)} fill={C.trail} />
      <polygon points={tri(x, y - 4 * s, 8.5 * s)} fill={C.trailLight} />
      <rect x={x - 1.2 * s} y={y} width={2.4 * s} height={5 * s} fill={C.earth} />
    </g>
  );
}

function Contours({ seed, color, count = 6 }) {
  // Generates wavy topographic contour lines for a more realistic map texture
  const lines = [];
  for (let i = 0; i < count; i++) {
    const y = 14 + i * (160 / count) + ((seed + i) % 3) * 6;
    const wobble = 10 + ((seed + i * 3) % 4) * 6;
    const d = `M-10,${y} C ${60 + ((seed + i) % 2) * 20},${y - wobble} ${150 - ((seed + i) % 3) * 15},${y + wobble} ${220},${y - wobble / 2} S ${300 + ((seed + i) % 2) * 10},${y + wobble} 350,${y}`;
    lines.push(<path key={i} d={d} stroke={color} strokeWidth={1} fill="none" opacity={0.22} />);
  }
  return <>{lines}</>;
}

function GrainOverlay({ id }) {
  return (
    <>
      <filter id={id}>
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0" />
      </filter>
      <rect width="340" height="190" filter={`url(#${id})`} />
    </>
  );
}

function MapBackground({ theme, gradId }) {
  const grainId = `${gradId}-grain`;
  if (theme === 'volcanic') {
    return (
      <>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7FA0B8" />
            <stop offset="45%" stopColor="#C9B386" />
            <stop offset="100%" stopColor="#B49968" />
          </linearGradient>
        </defs>
        <rect x="-20" y="-400" width="380" height="1000" fill={`url(#${gradId})`} />
        <Contours seed={2} color="#5C4A32" count={7} />
        <ellipse cx="110" cy="150" rx="75" ry="13" fill="#B89B68" opacity="0.5" />
        <ellipse cx="60" cy="172" rx="60" ry="11" fill="#B89B68" opacity="0.4" />
        <polygon points="300,38 262,132 336,132" fill="#3B2E26" opacity="0.55" />
        <polygon points="300,38 285,78 315,78" fill="#D8674A" opacity="0.5" />
        <GrainOverlay id={grainId} />
      </>
    );
  }
  if (theme === 'forest-ridge') {
    return (
      <>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8FAF9A" />
            <stop offset="100%" stopColor="#C7DCC8" />
          </linearGradient>
        </defs>
        <rect x="-20" y="-400" width="380" height="1000" fill={`url(#${gradId})`} />
        <Contours seed={5} color="#345440" count={6} />
        <polygon points="190,10 230,70 150,70" fill={C.forest} opacity="0.32" />
        <polygon points="250,5 290,65 215,65" fill={C.forest} opacity="0.26" />
        {treeAt(60, 150, 1)}
        {treeAt(100, 170, 0.9)}
        {treeAt(45, 110, 0.8)}
        {treeAt(130, 150, 0.9)}
        <GrainOverlay id={grainId} />
      </>
    );
  }
  if (theme === 'lake') {
    return (
      <>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#B7D6BE" />
            <stop offset="100%" stopColor="#D8E8D6" />
          </linearGradient>
        </defs>
        <rect x="-20" y="-400" width="380" height="1000" fill={`url(#${gradId})`} />
        <Contours seed={1} color="#3E6B4C" count={5} />
        <ellipse cx="170" cy="122" rx="95" ry="46" fill="#5796B8" opacity="0.65" />
        <ellipse cx="170" cy="122" rx="95" ry="46" fill="none" stroke="#3C7493" strokeWidth={1.5} opacity="0.4" />
        {treeAt(40, 120, 0.8)}
        {treeAt(300, 120, 0.8)}
        {treeAt(170, 50, 0.8)}
        <GrainOverlay id={grainId} />
      </>
    );
  }
  if (theme === 'hill') {
    return (
      <>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#A8D2B2" />
            <stop offset="100%" stopColor="#E1F0DE" />
          </linearGradient>
        </defs>
        <rect x="-20" y="-400" width="380" height="1000" fill={`url(#${gradId})`} />
        <Contours seed={3} color="#3E6B4C" count={6} />
        <path d="M-10,190 C70,110 180,90 350,160 L350,190 Z" fill={C.trail} opacity="0.25" />
        <circle cx="280" cy="40" r="20" fill="#E8B23D" opacity="0.5" />
        <GrainOverlay id={grainId} />
      </>
    );
  }
  return (
    <>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A8D2B2" />
          <stop offset="100%" stopColor="#E1F0DE" />
        </linearGradient>
      </defs>
      <rect x="-20" y="-400" width="380" height="1000" fill={`url(#${gradId})`} />
      <Contours seed={4} color="#3E6B4C" count={6} />
      {treeAt(250, 60, 0.9)}
      {treeAt(280, 100, 0.8)}
      {treeAt(300, 140, 0.9)}
      <GrainOverlay id={grainId} />
    </>
  );
}

function ElevationSparkline({ data, color, height = 36 }) {
  const w = 300, h = 36;
  const elevs = data.map((p) => p.elev);
  const min = Math.min(...elevs), max = Math.max(...elevs);
  const span = Math.max(1, max - min);
  const pts = data.map((p, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((p.elev - min) / span) * (h - 6) - 3;
    return `${x},${y}`;
  });
  const line = pts.join(' ');
  const area = `0,${h} ${line} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height, display: 'block' }} preserveAspectRatio="none">
      <polygon points={area} fill={color} opacity={0.15} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* -------------------------------- AI ASSISTANT -------------------------------- */
function generateAIInsight(dest) {
  const familyText =
    dest.suitability.family === true
      ? 'ramah untuk keluarga, termasuk anak-anak dan lansia yang masih aktif berjalan'
      : dest.suitability.family === false
      ? 'kurang disarankan untuk anak kecil atau lansia'
      : 'cukup cocok untuk keluarga dengan anak yang lebih besar';
  return `Berdasarkan jarak ${dest.distance} km, kenaikan elevasi ${dest.elevationGain} m, dan medan berupa ${dest.terrain.toLowerCase()}, rute ini membutuhkan level kebugaran ${dest.suitability.fitness.toLowerCase()}. Rute ini ${familyText}. ${dest.suitability.notes[0]}`;
}

function AIInsightCard({ dest, onAskAI }) {
  return (
    <div style={{ marginTop: 16, background: 'linear-gradient(160deg, #EAF6EF, #F7FBF6)', border: `1px solid ${C.ring || C.leafSoft}`, borderRadius: 14, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Sparkles size={15} color={C.trail} />
        <span style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 12.5, color: C.trail }}>AI Insight</span>
      </div>
      <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.55 }}>{generateAIInsight(dest)}</div>
      <button
        onClick={onAskAI}
        style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, color: C.trail, fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
      >
        Tanya AI lebih lanjut <ArrowRight size={13} />
      </button>
    </div>
  );
}

function quickChipsFor(dest) {
  if (dest) {
    return ['Apakah rute ini aman untuk saya?', 'Apa saja yang perlu saya bawa?', 'Ada rute yang lebih mudah?', 'Kapan waktu terbaik ke sini?'];
  }
  return ['Rute mana yang cocok untuk pemula?', 'Rekomendasikan rute ramah keluarga', 'Apa itu tingkat kesulitan Extreme?', 'Rute dengan jarak paling pendek?'];
}

function gearFor(dest) {
  if (dest.difficulty === 'Extreme' || dest.category === 'Mountain') {
    return 'jaket tebal/windbreaker, senter kepala, masker debu, sepatu trekking, dan air minum yang cukup';
  }
  if (dest.category === 'Waterfall') {
    return 'sandal gunung anti-licin, baju ganti, dan jas hujan ringan';
  }
  return 'sepatu yang nyaman, topi, dan air minum';
}

function aiRespond(question, dest) {
  const q = question.toLowerCase();
  if (dest) {
    if (q.includes('aman')) {
      return `Untuk ${dest.name}, rute ini cocok untuk usia ${dest.suitability.age} dengan level kebugaran ${dest.suitability.fitness.toLowerCase()}. ${dest.suitability.notes[0]}`;
    }
    if (q.includes('bawa') || q.includes('perlu')) {
      return `Untuk rute ${dest.difficulty.toLowerCase()} seperti ini, sebaiknya bawa ${gearFor(dest)}.`;
    }
    if (q.includes('mudah') || q.includes('alternatif')) {
      if (dest.alternatives.length > 0) {
        const alt = dest.alternatives[0];
        return `Ada rute alternatif "${alt.name}" dengan tingkat kesulitan ${alt.difficulty}, jarak ${alt.distance} km — ${alt.note}.`;
      }
      return `${dest.name} sudah tergolong ${dest.difficulty}, dan saat ini belum ada rute alternatif lain yang tercatat untuk tujuan ini.`;
    }
    if (q.includes('waktu') || q.includes('kapan')) {
      return `Waktu terbaik untuk mengunjungi ${dest.name} adalah ${dest.bestTime}.`;
    }
    return generateAIInsight(dest);
  }
  if (q.includes('pemula')) {
    const easy = DESTINATIONS.filter((d) => d.difficulty === 'Easy').map((d) => d.name.split('—')[0].trim());
    return `Untuk pemula, aku sarankan ${easy.join(', ')} — semuanya bertingkat kesulitan Easy dengan medan yang landai.`;
  }
  if (q.includes('keluarga')) {
    const fam = DESTINATIONS.filter((d) => d.suitability.family === true).map((d) => d.name.split('—')[0].trim());
    return `Rute yang ramah untuk keluarga: ${fam.join(', ')}. Semuanya punya medan landai dan akses kendaraan yang mudah.`;
  }
  if (q.includes('extreme')) {
    return 'Tingkat "Extreme" berarti rute membutuhkan jarak jauh, kenaikan elevasi tajam, dan medan berisiko tinggi seperti pasir vulkanik atau tebing curam — hanya disarankan untuk pendaki berpengalaman dengan persiapan matang.';
  }
  if (q.includes('pendek') || q.includes('jarak')) {
    const shortest = [...DESTINATIONS].sort((a, b) => a.distance - b.distance)[0];
    return `Rute dengan jarak paling pendek saat ini adalah ${shortest.name} (${shortest.distance} km, ${shortest.duration}).`;
  }
  return 'Aku bisa bantu kamu memilih rute berdasarkan kemampuan, usia, dan kendaraan yang kamu punya. Coba tanya soal rute tertentu, atau pilih salah satu pertanyaan cepat di bawah ✨';
}

function ChatPanel({ dest }) {
  const [messages, setMessages] = useState(() => [
    { role: 'ai', text: `Aku sudah menganalisis rute ${dest.name.split('—')[0].trim()}. ${generateAIInsight(dest)}` },
  ]);
  const [input, setInput] = useState('');
  const endRef = React.useRef(null);
  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ block: 'end' });
  }, [messages]);

  const ask = (text) => {
    if (!text.trim()) return;
    setMessages((m) => [...m, { role: 'user', text }, { role: 'ai', text: aiRespond(text, dest) }]);
    setInput('');
  };

  return (
    <>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 14px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.role === 'ai' && (
              <div style={{ width: 22, height: 22, borderRadius: 999, background: C.trail, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 6, flexShrink: 0 }}>
                <Bot size={12} color="#fff" />
              </div>
            )}
            <div style={{
              maxWidth: '82%', padding: '8px 12px', fontSize: 12, lineHeight: 1.5,
              borderRadius: m.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
              background: m.role === 'user' ? C.trail : C.mist, color: m.role === 'user' ? '#fff' : C.ink,
            }}>
              {m.text}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '4px 14px 8px', flexShrink: 0 }}>
        {quickChipsFor(dest).map((q) => (
          <button key={q} onClick={() => ask(q)} style={{ flexShrink: 0, whiteSpace: 'nowrap', fontSize: 11, border: 'none', background: C.leafSoft, color: C.forest, padding: '6px 11px', borderRadius: 999, cursor: 'pointer', fontWeight: 600 }}>
            {q}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '8px 14px 12px', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask(input)}
          placeholder="Tanya AI tentang rute ini…"
          style={{ flex: 1, minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 999, padding: '9px 14px', fontSize: 12.5, outline: 'none', fontFamily: 'Inter, sans-serif', color: C.ink }}
        />
        <button onClick={() => ask(input)} style={{ width: 36, height: 36, borderRadius: 999, background: C.trail, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <Send size={15} color="#fff" />
        </button>
      </div>
    </>
  );
}

function MapTeaser({ onClick, dest }) {
  return (
    <button onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: 12, cursor: 'pointer', textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 54, height: 54, borderRadius: 12, overflow: 'hidden', flexShrink: 0, border: `1px solid ${C.border}` }}>
          <svg viewBox="0 0 340 190" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%', display: 'block' }}>
            <MapBackground theme={dest.mapData.theme} gradId={`thumb-${dest.id}`} />
            <TileLayer {...dest.mapData.tile} x0={-10} y0={-10} x1={350} y1={200} />
            <path d={dest.mapData.path} fill="none" stroke="#fff" strokeWidth="15" strokeLinecap="round" opacity="0.7" />
            <path d={dest.mapData.path} fill="none" stroke={DIFF[dest.difficulty].c} strokeWidth="9" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 13.5, color: C.ink }}>Lihat peta rute penuh</div>
          <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2 }}>Jalur, titik rawan & elevasi di satu halaman peta</div>
        </div>
      </div>
      <MapIcon size={18} color={C.trail} />
    </button>
  );
}

function GeoPin({ x, y, color, label, onClick }) {
  return (
    <g transform={`translate(${x},${y})`} onClick={onClick} style={{ cursor: 'pointer' }}>
      <ellipse cx="0" cy="2" rx="9" ry="3.5" fill="#000" opacity="0.18" />
      <path d="M0,0 C-8,-12 -13,-19 -13,-26 A13,13 0 1 1 13,-26 C13,-19 8,-12 0,0Z" fill={color} stroke="#fff" strokeWidth="2" />
      <circle cx="0" cy="-26" r="5" fill="#fff" />
      <text x="0" y="16" textAnchor="middle" fontSize="10.5" fontWeight="800" fill={C.ink} style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3.5 }}>{label}</text>
    </g>
  );
}

const OV = { zoom: 11, center: [-7.83, 112.51], cx: 170, cy: 250 };
const PIN_LABEL = { cobanrondo: 'Coban Rondo', paralayang: 'Paralayang', cangar: 'Cangar' };
function pinPos(d) {
  const [cx0, cy0] = project(OV.center[0], OV.center[1], OV.zoom);
  const [px, py] = project(d.mapData.geoStart[0], d.mapData.geoStart[1], OV.zoom);
  return { x: OV.cx + px - cx0, y: OV.cy + py - cy0, label: PIN_LABEL[d.id] };
}

function OverviewMapCanvas({ onPick }) {
  const [wx, wy] = project(OV.center[0], OV.center[1], OV.zoom);
  return (
    <svg viewBox="0 0 340 640" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <rect width="340" height="640" fill="#DDE8D6" />
      <TileLayer zoom={OV.zoom} wx={wx} wy={wy} cx={OV.cx} cy={OV.cy} x0={-60} y0={-40} x1={400} y1={680} />
      {DESTINATIONS.map((d) => {
        const p = pinPos(d);
        return <GeoPin key={d.id} x={p.x} y={p.y} color={DIFF[d.difficulty].c} label={p.label} onClick={() => onPick(d.id)} />;
      })}
    </svg>
  );
}

function routeView(dest, compact, full) {
  const m = dest.mapData;
  const fit = Math.min(3.4, Math.max(1, Math.min(290 / (m.box.w + 30), (full ? 330 : 200) / (m.box.h + 30))));
  return { sc: compact ? fit * 0.62 : fit, Y: compact ? 185 : full ? 312 : 232 };
}

const hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

function RouteMapCanvas({ dest, compact, intel = true, full = false, sheetH = 262 }) {
  const map = dest.mapData;
  const diffColor = DIFF[dest.difficulty].c;
  const { sc, Y } = routeView(dest, compact, full);
  const P = (x, y) => [170 + (x - 170) * sc, Y + (y - 95) * sc];
  const tf = `translate(170px, ${Y}px) scale(${sc}) translate(-170px, -95px)`;
  const halo = { paintOrder: 'stroke', stroke: '#fff', strokeWidth: 4.5, strokeLinejoin: 'round' };
  const ICON = { water: '💧', shelter: '🛖', exit: '⛑' };
  const start = map.waypoints.find((w) => w.type === 'start');
  const S = sc >= 2 ? 5 : 7;

  // ---- declutter: place labels / chips greedily, never on top of markers or each other
  const wp = map.waypoints.map((w) => ({ ...w, p: P(w.x, w.y) }));
  const rOf = (w) => (w.type === 'warning' ? 14 : ICON[w.type] ? 12 : w.type === 'start' || w.type === 'end' ? 11 : 9);
  const taken = wp.map((w) => [w.p[0] - rOf(w) - 2, w.p[1] - rOf(w) - 2, w.p[0] + rOf(w) + 2, w.p[1] + rOf(w) + 2]);
  const top = (h) => 640 - h / 1.09;
  taken.push([9, top(sheetH + 76), 225, top(sheetH + 10)], [294, top(sheetH + 82), 336, top(sheetH + 10)]);
  const ok = (bx) => bx[0] > 6 && bx[2] < 334 && bx[1] > 128 && !taken.some((t) => hit(bx, t));
  const labels = [];
  const order = { warning: 0, start: 1, end: 1, camp: 2, checkpoint: 2, water: 3, shelter: 3, exit: 3 };
  [...wp].filter((w) => w.label).sort((a, b) => order[a.type] - order[b.type]).forEach((w) => {
    const fs = 12, tw = w.label.length * fs * 0.58 + 6, r = rOf(w) + 5;
    const warn = w.type === 'warning';
    const cands = warn
      ? [[0, r + 14, 'middle'], [r, 4, 'start'], [-r, 4, 'end'], [0, -r - 4, 'middle']]
      : [[r, 4, 'start'], [-r, 4, 'end'], [0, -r - 4, 'middle'], [0, r + 14, 'middle'], [r, -r, 'start'], [-r, -r, 'end'], [r, r + 12, 'start'], [-r, r + 12, 'end']];
    for (const [dx, dy, anc] of cands) {
      const x = w.p[0] + dx, y = w.p[1] + dy;
      const bx = [anc === 'middle' ? x - tw / 2 : anc === 'start' ? x : x - tw, y - fs, anc === 'middle' ? x + tw / 2 : anc === 'start' ? x + tw : x, y + 4];
      if (ok(bx)) { taken.push(bx); labels.push({ w, x, y, anc, warn }); return; }
    }
  });
  const chips = [];
  if (intel) {
    [...map.legs].sort((a, b) => b.grade - a.grade).forEach((l) => {
      const [x, y] = P(l.mx, l.my);
      const i = map.legs.indexOf(l);
      const nx = -(map.legs[Math.min(i + 1, map.legs.length - 1)].my - map.legs[Math.max(i - 1, 0)].my), ny = map.legs[Math.min(i + 1, map.legs.length - 1)].mx - map.legs[Math.max(i - 1, 0)].mx;
      const n = Math.hypot(nx, ny) || 1;
      for (const d of [0, 26, -26, 40, -40]) {
        const cx = x + (nx / n) * d, cy = y + (ny / n) * d, bx = [cx - 20, cy - 11, cx + 20, cy + 11];
        if (ok(bx)) { taken.push(bx); chips.push({ l, cx, cy, off: d !== 0, x, y }); return; }
      }
    });
  }

  return (
    <svg viewBox="0 0 340 640" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <g transform="translate(0,153)"><MapBackground theme={map.theme} gradId={`fullmap-${dest.id}`} /></g>
      <g style={{ transform: tf, transition: 'transform .35s ease', transformOrigin: '0 0' }}>
        <TileLayer {...map.tile} S={S} x0={170 - 210 / sc} y0={95 - (Y + 30) / sc} x1={170 + 210 / sc} y1={95 + (640 - Y + 30) / sc} />
        <rect x={-400} y={-600} width={1200} height={1600} fill="#fff" opacity={0.2} />
        {intel && map.nosignal && map.legs.slice(map.nosignal.from, map.nosignal.to).map((l, i) => (
          <path key={`ns${i}`} d={l.d} fill="none" stroke="#6B4FA3" strokeWidth={22 / sc} strokeLinecap="round" strokeDasharray={`${1 / sc} ${7 / sc}`} opacity={0.5} />
        ))}
        <path d={map.path} fill="none" stroke="#fff" strokeWidth={10 / sc} strokeLinecap="round" strokeLinejoin="round" />
        {intel ? map.legs.map((l, i) => (
          <path key={`${dest.id}-leg${i}`} d={l.d} fill="none" stroke={RISK[l.risk]} strokeWidth={6 / sc} strokeLinecap="round" style={{ animation: `fadeLeg .5s ease-out ${i * 0.18}s both` }} />
        )) : (
          <path key={dest.id} d={map.path} pathLength={100} fill="none" stroke={diffColor} strokeWidth={6 / sc} strokeLinecap="round"
            strokeDasharray={100} style={{ animation: 'drawRoute 1.6s ease-out forwards' }} />
        )}
      </g>

      <g>
        {intel && wp.filter((w) => w.type === 'warning').map((w, i) => (
          <circle key={`hz${i}`} cx={w.p[0]} cy={w.p[1]} r={26} fill={DIFF.Extreme.c} opacity={0.16} stroke={DIFF.Extreme.c} strokeWidth={1.6} strokeDasharray="4 3">
            <animate attributeName="r" values="24;31;24" dur="2.4s" repeatCount="indefinite" />
          </circle>
        ))}
        {start && (
          <circle cx={P(start.x, start.y)[0]} cy={P(start.x, start.y)[1]} r={10} fill={C.trail} opacity={0.35}>
            <animate attributeName="r" values="10;24" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.45;0" dur="1.8s" repeatCount="indefinite" />
          </circle>
        )}
        {chips.map(({ l, cx, cy, off, x, y }, i) => (
          <g key={`c${i}`}>
            {off && <line x1={x} y1={y} x2={cx} y2={cy} stroke={RISK[l.risk]} strokeWidth={1.5} />}
            <rect x={cx - 18} y={cy - 9.5} width={36} height={19} rx={9.5} fill={RISK[l.risk]} stroke="#fff" strokeWidth={1.8} />
            <text x={cx} y={cy + 4} fontSize={11} fontWeight={800} fill="#fff" textAnchor="middle">{l.grade}%</text>
          </g>
        ))}
        {wp.map((w, i) => {
          const [x, y] = w.p;
          if (ICON[w.type]) return (
            <g key={i}>
              <circle cx={x} cy={y} r={11.5} fill="#fff" stroke={w.type === 'exit' ? '#1F8A4C' : C.sky} strokeWidth={2.2} />
              <text x={x} y={y + 4.5} fontSize={12} textAnchor="middle">{ICON[w.type]}</text>
            </g>
          );
          if (w.type === 'warning') return (
            <g key={i}>
              <polygon points={tri(x, y, 13)} fill={DIFF.Extreme.c} stroke="#fff" strokeWidth={2} />
              <text x={x} y={y + 4.5} fontSize={13} fontWeight={800} fill="#fff" textAnchor="middle">!</text>
            </g>
          );
          const isEnd = w.type === 'end', isStart = w.type === 'start';
          return <circle key={i} cx={x} cy={y} r={isEnd || isStart ? 11 : 8.5} fill={isEnd ? diffColor : isStart ? C.trail : w.type === 'camp' ? C.earth : C.paper} stroke="#fff" strokeWidth={2.6} />;
        })}
        {labels.map(({ w, x, y, anc, warn }, i) => (
          <text key={`l${i}`} x={x} y={y} fontSize={12} fontWeight={800} fill={warn ? '#C0283A' : C.ink} textAnchor={anc} style={halo}>{w.label}</text>
        ))}
        {intel && map.nosignal && (() => {
          const a = P(map.legs[map.nosignal.from].mx, map.legs[map.nosignal.from].my), b = P(map.legs[map.nosignal.to - 1].mx, map.legs[map.nosignal.to - 1].my);
          return <text x={(a[0] + b[0]) / 2} y={Math.max(a[1], b[1]) + 36} fontSize={12} fontWeight={800} fill="#4B3380" textAnchor="middle" style={halo}>📵 Tanpa sinyal</text>;
        })()}
      </g>
    </svg>
  );
}

function IntelCard({ dest, bottom, full }) {
  const ref = React.useRef(null);
  const [unit, setUnit] = useState(1.09);
  useEffect(() => {
    const p = ref.current && ref.current.offsetParent;
    if (p) setUnit(Math.max(p.clientWidth / 340, p.clientHeight / 640));
  }, [dest.id]);
  const m = dest.mapData;
  const { sc } = routeView(dest, false, full);
  const mpp = (156543.03 * Math.cos((m.geoStart[0] * Math.PI) / 180)) / 2 ** m.tile.zoom / sc;
  const bar = [25, 50, 100, 200, 250, 500, 1000].find((v) => (v / mpp) * unit >= 48) || 1000;
  const maxG = Math.max(...m.legs.map((l) => l.grade));
  const hz = m.waypoints.filter((w) => w.type === 'warning').length;
  const chip = { fontSize: 12, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap' };
  return (
    <div ref={ref} style={{ position: 'absolute', left: 10, bottom, zIndex: 4, maxWidth: 'calc(100% - 64px)', background: 'rgba(255,255,255,0.97)', borderRadius: 14, padding: '8px 11px', boxShadow: '0 4px 14px rgba(18,42,32,0.25)', transition: 'bottom .3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 96 }}>
          <div style={{ height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${RISK.low}, ${RISK.med}, ${RISK.high}, ${RISK.extreme})` }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.inkMuted, marginTop: 2 }}><span>Aman</span><span>Ekstrem</span></div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: (bar / mpp) * unit, height: 6, borderLeft: `2px solid ${C.ink}`, borderRight: `2px solid ${C.ink}`, borderBottom: `2px solid ${C.ink}` }} />
          <div style={{ fontSize: 10, fontWeight: 700, color: C.ink, marginTop: 1 }}>{bar >= 1000 ? `${bar / 1000} km` : `${bar} m`}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        <span style={chip}>⛰ {maxG}%</span>
        <span style={{ ...chip, color: '#C0283A' }}>⚠ {hz} zona</span>
        {m.nosignal && <span style={chip}>📵</span>}
        {m.waypoints.some((w) => w.type === 'exit') && <span style={chip}>⛑</span>}
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, value, label }) {
  return (
    <div style={{ flex: 1, background: C.mist, borderRadius: 10, padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
      <Icon size={13} color={C.trail} />
      <div>
        <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 12, color: C.ink, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 9.5, color: C.inkMuted }}>{label}</div>
      </div>
    </div>
  );
}

function AIRouteGuideScreen({ contextId, onBack, onOpenDetail }) {
  const [selId, setSelId] = useState(contextId || null);
  const [cameFromOverview] = useState(!contextId);
  const [sheet, setSheet] = useState('map');
  const [intel, setIntel] = useState(true);
  const dest = selId ? DESTINATIONS.find((d) => d.id === selId) : null;
  const chat = sheet === 'chat' && !!dest;
  const mapMode = !chat && !!dest;
  const sheetH = !dest ? 190 : chat ? 400 : mapMode ? 76 : 262;

  const pick = (id) => { setSelId(id); setSheet('map'); };
  const goBack = () => {
    if (dest && cameFromOverview) { setSelId(null); setSheet('map'); }
    else if (onBack) onBack();
  };
  const showBack = !!dest || !!onBack;
  const shortName = (d) => d.name.split('—')[0].split('(')[0].trim();
  const circleBtn = { width: 30, height: 30, borderRadius: 999, background: 'rgba(255,255,255,0.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(18,42,32,0.28)', border: 'none' };

  return (
    <div style={{ height: '100%', position: 'relative', overflow: 'hidden', background: C.mist }}>
      <style>{`@keyframes drawRoute{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}@keyframes fadeLeg{from{opacity:0}to{opacity:1}}`}</style>

      {dest ? <RouteMapCanvas dest={dest} compact={chat} intel={intel} full={mapMode} sheetH={sheetH} /> : <OverviewMapCanvas onPick={pick} />}

      <div style={{ position: 'absolute', top: 10, left: 10, right: 10, zIndex: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {showBack && (
            <button onClick={goBack} style={{ ...circleBtn, cursor: 'pointer', flexShrink: 0 }}>
              <ChevronLeft size={18} color={C.ink} />
            </button>
          )}
          <div style={{ background: 'rgba(18,42,32,0.85)', color: '#fff', padding: '7px 12px', borderRadius: 999, fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={13} color={C.leaf} /> AI Route Guide
          </div>
        </div>
        {dest && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            {DESTINATIONS.map((d) => {
              const active = d.id === selId;
              return (
                <button key={d.id} onClick={() => pick(d.id)} style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 999, cursor: 'pointer',
                  border: 'none', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: C.ink,
                  background: active ? C.paper : 'rgba(255,255,255,0.72)', boxShadow: active ? '0 2px 8px rgba(18,42,32,0.3)' : 'none',
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: DIFF[d.difficulty].c }} />
                  {shortName(d)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {dest && intel && !chat && <IntelCard dest={dest} bottom={sheetH + 12} full={mapMode} />}

      {!chat && (
        <div style={{ position: 'absolute', right: 10, bottom: sheetH + 12, zIndex: 4, display: 'flex', flexDirection: 'column', gap: 6, transition: 'bottom .3s ease' }}>
          <button onClick={() => setIntel(!intel)} style={{ ...circleBtn, cursor: 'pointer', background: intel ? '#E5384B' : 'rgba(255,255,255,0.94)' }} title="Risk layer"><Layers size={14} color={intel ? '#fff' : C.ink} /></button>
          <div style={circleBtn}><Locate size={14} color={C.trail} /></div>
        </div>
      )}

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: sheetH, transition: 'height .3s ease', background: C.paper, borderRadius: '22px 22px 0 0', boxShadow: '0 -8px 24px rgba(18,42,32,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 5 }}>
        <button onClick={() => dest && setSheet(chat ? 'map' : 'chat')} style={{ background: 'none', border: 'none', padding: '8px 0 8px', cursor: dest ? 'pointer' : 'default', flexShrink: 0 }}>
          <div style={{ width: 38, height: 4, borderRadius: 4, background: C.border, margin: '0 auto' }} />
        </button>

        {!dest && (
          <>
            <div style={{ padding: '0 14px 2px' }}>
              <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 14, color: C.ink }}>Jelajah Kota Batu</div>
              <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 1 }}>Pilih pin di peta atau kartu di bawah</div>
            </div>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '10px 14px 14px' }}>
              {DESTINATIONS.map((d) => {
                const Icon = CATEGORY_ICON[d.category];
                return (
                  <button key={d.id} onClick={() => pick(d.id)} style={{ flexShrink: 0, width: 205, textAlign: 'left', background: C.mist, border: `1px solid ${C.border}`, borderRadius: 14, padding: 10, display: 'flex', gap: 10, cursor: 'pointer' }}>
                    <div style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, background: 'linear-gradient(160deg,#2D6A4F,#123527)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={20} color={C.leafSoft} strokeWidth={1.6} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 12, color: C.ink, lineHeight: 1.25 }}>{d.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                        <DifficultyBadge level={d.difficulty} size="sm" />
                        <span style={{ fontSize: 10.5, color: C.inkMuted }}>{d.distance} km</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {mapMode && (
          <div style={{ padding: '0 14px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 13.5, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dest.name}</div>
              <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                <DifficultyBadge level={dest.difficulty} size="sm" /> {dest.distance} km · {dest.duration}
              </div>
            </div>
            {onOpenDetail && <button onClick={() => onOpenDetail(dest.id)} style={{ height: 36, padding: '0 12px', borderRadius: 12, background: C.paper, border: `1.5px solid ${C.trail}`, color: C.trail, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Detail</button>}
            <button onClick={() => setSheet('chat')} style={{ width: 36, height: 36, borderRadius: 12, background: C.trail, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Sparkles size={16} color="#fff" /></button>
          </div>
        )}

        {chat && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0 14px 8px', flexShrink: 0 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 13.5, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dest.name}</div>
                <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 1 }}>{dest.distance} km • {dest.duration}</div>
              </div>
              <button onClick={() => setSheet('map')} style={{ background: C.leafSoft, border: 'none', borderRadius: 999, padding: '5px 11px', fontSize: 11, fontWeight: 700, color: C.forest, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <MapIcon size={12} /> Peta
              </button>
            </div>
            <ChatPanel key={dest.id} dest={dest} />
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ ROUTE DIFFICULTY ------------------------------ */
function RouteDifficultyScreen({ dest, onBack, onProfile, onAskAI }) {
  const d = DIFF[dest.difficulty];
  const segIcon = { flat: Minus, gentle: TrendingUp, steep: TrendingUp, descent: TrendingDown };
  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.mist }}>
      <DetailHeader title="Route Difficulty" subtitle={dest.name} onBack={onBack} />
      <div style={{ padding: 16 }}>
        <div style={{ background: `linear-gradient(160deg, ${d.bg}, ${C.paper})`, border: `1px solid ${d.ring}`, borderRadius: 18, padding: 18, textAlign: 'center' }}>
          <div style={{ fontSize: 11.5, color: C.inkMuted, fontWeight: 600 }}>OVERALL DIFFICULTY</div>
          <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 26, color: d.c, marginTop: 4 }}>{dest.difficulty}</div>
          <DifficultyGauge level={dest.difficulty} />
          <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 10, lineHeight: 1.5 }}>
            Based on terrain, elevation gain, distance and typical trail conditions
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <MapTeaser dest={dest} onClick={onAskAI} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <StatPill icon={Navigation2} label="Distance" value={`${dest.distance} km`} />
          <StatPill icon={Clock} label="Est. time" value={dest.duration} />
          <StatPill icon={TrendingUp} label="Elev. gain" value={`${dest.elevationGain} m`} />
        </div>

        <div style={{ marginTop: 18 }}>
          <SectionTitle>Terrain breakdown</SectionTitle>
          <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, fontSize: 13, color: C.ink, lineHeight: 1.6 }}>
            {dest.terrain}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <SectionTitle>Vehicle accessibility</SectionTitle>
          <div style={{ display: 'flex', gap: 8 }}>
            <VehicleChip icon={Car} label="Car" ok={dest.vehicle.car} />
            <VehicleChip icon={Bike} label="Motorbike" ok={dest.vehicle.motorbike} />
            <VehicleChip icon={Footprints} label="On foot" note={dest.vehicle.footOnly} />
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <SectionTitle sub={`Recommended fitness: ${dest.suitability.fitness}`}>User suitability</SectionTitle>
          <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
            <div style={{ display: 'flex', gap: 18, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 10.5, color: C.inkMuted }}>Age range</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{dest.suitability.age}</div>
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: C.inkMuted }}>Family friendly</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {dest.suitability.family ? <CheckCircle2 size={14} color={DIFF.Easy.c} /> : <XCircle size={14} color={DIFF.Extreme.c} />}
                  {dest.suitability.family === true ? 'Yes' : dest.suitability.family === false ? 'Not advised' : dest.suitability.family}
                </div>
              </div>
            </div>
            {dest.suitability.notes.map((n) => (
              <div key={n} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginTop: 6 }}>
                <Info size={13} color={C.trail} style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ fontSize: 12, color: C.ink, lineHeight: 1.45 }}>{n}</div>
              </div>
            ))}
          </div>
        </div>

        <AIInsightCard dest={dest} onAskAI={onAskAI} />

        <div style={{ marginTop: 16 }}>
          <SectionTitle>Trail segments</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dest.segments.map((s, i) => {
              const SIcon = segIcon[s.type];
              const col = s.type === 'flat' ? C.inkMuted : s.type === 'steep' ? DIFF.Difficult.c : s.type === 'descent' ? C.sky : C.trail;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: C.mist, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <SIcon size={15} color={col} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{s.range}</div>
                    <div style={{ fontSize: 11.5, color: C.inkMuted }}>{s.note}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {(dest.difficulty === 'Difficult' || dest.difficulty === 'Extreme') && (
          <div style={{ marginTop: 16, background: DIFF.Extreme.bg, border: `1px solid ${DIFF.Extreme.ring}`, borderRadius: 14, padding: 13, display: 'flex', gap: 9 }}>
            <ShieldAlert size={17} color={DIFF.Extreme.c} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12, color: C.ink, lineHeight: 1.5 }}>
              This route demands good physical fitness and proper gear. Check weather conditions before you go.
            </div>
          </div>
        )}

        <button onClick={onProfile} style={{ marginTop: 18, marginBottom: 24, width: '100%', background: C.trail, color: '#fff', border: 'none', borderRadius: 14, padding: '13px 0', fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          See elevation profile <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}

function DifficultyGauge({ level }) {
  const levels = ['Easy', 'Moderate', 'Difficult', 'Extreme'];
  const idx = levels.indexOf(level);
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 12, justifyContent: 'center' }}>
      {levels.map((l, i) => (
        <div key={l} style={{ width: 42, height: 6, borderRadius: 4, background: i <= idx ? DIFF[l].c : '#E2EAE3' }} />
      ))}
    </div>
  );
}

/* -------------------------------- ROUTE PROFILE -------------------------------- */
function RouteProfileScreen({ dest, onBack }) {
  const [showAlt, setShowAlt] = useState(false);
  const gains = dest.elevation.reduce((sum, p, i, arr) => (i === 0 ? 0 : sum + Math.max(0, p.elev - arr[i - 1].elev)), 0);
  const min = Math.min(...dest.elevation.map((p) => p.elev));
  const max = Math.max(...dest.elevation.map((p) => p.elev));

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.mist }}>
      <DetailHeader title="Route Profile" subtitle={dest.name} onBack={onBack} />
      <div style={{ padding: 16 }}>
        <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: '14px 8px 6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 8px' }}>
            <SectionTitle>Elevation profile</SectionTitle>
            {dest.alternatives.length > 0 && (
              <button onClick={() => setShowAlt((s) => !s)} style={{ fontSize: 11, color: C.trail, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>
                {showAlt ? 'Hide' : 'Compare'} alt.
              </button>
            )}
          </div>
          <ResponsiveContainer width="100%" height={170}>
            <AreaChart data={dest.elevation} margin={{ top: 4, right: 14, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="elevFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.trail} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={C.trail} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="km" tick={{ fontSize: 10, fill: C.inkMuted }} unit="km" tickLine={false} axisLine={{ stroke: C.border }} />
              <YAxis tick={{ fontSize: 10, fill: C.inkMuted }} tickLine={false} axisLine={false} width={38} unit="m" />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 10, border: `1px solid ${C.border}`, fontFamily: 'Inter, sans-serif' }}
                formatter={(v) => [`${v} m`, 'Elevation']}
                labelFormatter={(l) => `${l} km`}
              />
              <Area type="monotone" dataKey="elev" stroke={C.trail} strokeWidth={2.5} fill="url(#elevFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <StatPill icon={TrendingUp} label="Total ascent" value={`${gains} m`} />
          <StatPill icon={Mountain} label="Max elevation" value={`${max} m`} />
          <StatPill icon={Minus} label="Min elevation" value={`${min} m`} />
        </div>

        <div style={{ marginTop: 18 }}>
          <SectionTitle sub="How the terrain changes along the way">Segment breakdown</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dest.segments.map((s, i) => {
              const col = s.type === 'flat' ? C.inkMuted : s.type === 'steep' ? DIFF.Difficult.c : s.type === 'descent' ? C.sky : C.trail;
              const SIcon = s.type === 'flat' ? Minus : s.type === 'descent' ? TrendingDown : TrendingUp;
              return (
                <div key={i} style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, borderLeft: `4px solid ${col}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <SIcon size={13} color={col} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{s.range}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 3 }}>{s.note}</div>
                </div>
              );
            })}
          </div>
        </div>

        {showAlt && dest.alternatives.length > 0 && (
          <div style={{ marginTop: 18, paddingBottom: 24 }}>
            <SectionTitle>Alternative route comparison</SectionTitle>
            {dest.alternatives.map((a) => (
              <div key={a.name} style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>{a.name}</div>
                  <DifficultyBadge level={a.difficulty} size="sm" />
                </div>
                <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 4 }}>{a.distance} km • {a.duration} — {a.note}</div>
              </div>
            ))}
          </div>
        )}
        {!showAlt && <div style={{ height: 24 }} />}
      </div>
    </div>
  );
}

/* -------------------------------- USER PREFERENCE -------------------------------- */
const AGE_GROUPS = ['13–17', '18–30', '31–50', '51–65', '66+'];
const FITNESS = ['Beginner', 'Intermediate', 'Advanced'];
const VEHICLES = ['Car', 'Motorbike', 'On foot only'];
const COMPANIONS = ['Solo', 'Friends', 'Family with kids', 'Elderly members'];

function ChipGroup({ options, value, onChange, multi = false }) {
  const isActive = (o) => (multi ? value.includes(o) : value === o);
  const toggle = (o) => {
    if (multi) onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o]);
    else onChange(o);
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => (
        <button
          key={o}
          onClick={() => toggle(o)}
          style={{
            padding: '9px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            border: `1.5px solid ${isActive(o) ? C.trail : C.border}`,
            background: isActive(o) ? C.trail : C.paper, color: isActive(o) ? '#fff' : C.ink,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function UserPreferenceScreen({ prefs, setPrefs, onSubmit }) {
  const steps = [
    { key: 'age', label: 'Your age group', options: AGE_GROUPS, multi: false },
    { key: 'fitness', label: 'Fitness level', options: FITNESS, multi: false },
    { key: 'vehicle', label: 'Vehicle available', options: VEHICLES, multi: false },
    { key: 'companions', label: 'Who’s coming with you?', options: COMPANIONS, multi: true },
  ];
  const complete = prefs.age && prefs.fitness && prefs.vehicle && prefs.companions.length > 0;

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.mist }}>
      <div style={{ background: C.forest, padding: '18px 16px 22px', color: '#fff' }}>
        <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 19 }}>Tell us about you</div>
        <div style={{ fontSize: 12.5, color: C.leafSoft, marginTop: 4 }}>We’ll match routes to your comfort level</div>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {steps.map((s) => (
          <div key={s.key}>
            <SectionTitle>{s.label}{s.multi ? ' (select all that apply)' : ''}</SectionTitle>
            <ChipGroup
              options={s.options}
              value={prefs[s.key]}
              multi={s.multi}
              onChange={(v) => setPrefs((p) => ({ ...p, [s.key]: v }))}
            />
          </div>
        ))}

        <button
          disabled={!complete}
          onClick={onSubmit}
          style={{
            marginTop: 6, width: '100%', border: 'none', borderRadius: 14, padding: '14px 0',
            fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 13.5,
            background: complete ? C.trail : C.border, color: complete ? '#fff' : C.inkMuted,
            cursor: complete ? 'pointer' : 'not-allowed',
          }}
        >
          Get my recommendations
        </button>
        <div style={{ height: 10 }} />
      </div>
    </div>
  );
}

/* -------------------------------- RECOMMENDATION -------------------------------- */
function scoreDestination(dest, prefs) {
  let score = 50;
  const reasons = [];
  const fitOrder = ['Beginner', 'Intermediate', 'Advanced'];
  const diffToFit = { Easy: 'Beginner', Moderate: 'Intermediate', Difficult: 'Advanced', Extreme: 'Advanced' };
  const userFitIdx = fitOrder.indexOf(prefs.fitness);
  const destFitIdx = fitOrder.indexOf(diffToFit[dest.difficulty]);

  if (destFitIdx <= userFitIdx) { score += 22; reasons.push(`Matches your ${prefs.fitness.toLowerCase()} fitness level`); }
  else { score -= 18 * (destFitIdx - userFitIdx); }

  if (prefs.companions.includes('Family with kids') && dest.suitability.family) { score += 14; reasons.push('Family friendly'); }
  if (prefs.companions.includes('Family with kids') && dest.suitability.family === false) score -= 20;
  if (prefs.companions.includes('Elderly members') && dest.difficulty === 'Easy') { score += 12; reasons.push('Comfortable for elderly visitors'); }
  if (prefs.companions.includes('Elderly members') && (dest.difficulty === 'Difficult' || dest.difficulty === 'Extreme')) score -= 22;

  if (prefs.vehicle === 'Car' && dest.vehicle.car) { score += 8; reasons.push('Reachable by car'); }
  if (prefs.vehicle === 'Motorbike' && dest.vehicle.motorbike) { score += 8; reasons.push('Reachable by motorbike'); }
  if (prefs.vehicle === 'On foot only') { score += 4; }

  if (['13–17', '66+'].includes(prefs.age) && (dest.difficulty === 'Difficult' || dest.difficulty === 'Extreme')) score -= 15;
  if (['13–17', '66+'].includes(prefs.age) && dest.difficulty === 'Easy') { score += 8; reasons.push('Suitable for your age group'); }

  return { score: Math.max(4, Math.min(99, Math.round(score))), reasons: reasons.slice(0, 3) };
}

function RecommendationScreen({ prefs, onOpenDestination, onEditPrefs }) {
  const ranked = useMemo(
    () => DESTINATIONS.map((d) => ({ d, ...scoreDestination(d, prefs) })).sort((a, b) => b.score - a.score),
    [prefs]
  );
  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.mist }}>
      <div style={{ background: C.forest, padding: '18px 16px 20px', color: '#fff' }}>
        <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 19 }}>Recommended for you</div>
        <div style={{ fontSize: 12.5, color: C.leafSoft, marginTop: 4 }}>Based on your fitness, age and travel companions</div>
      </div>

      <div style={{ padding: '12px 16px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[prefs.age, prefs.fitness, prefs.vehicle, ...prefs.companions].filter(Boolean).map((p) => (
          <span key={p} style={{ fontSize: 11, background: C.leafSoft, color: C.forest, padding: '4px 10px', borderRadius: 999, fontWeight: 600 }}>{p}</span>
        ))}
        <button onClick={onEditPrefs} style={{ fontSize: 11, color: C.trail, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>Edit</button>
      </div>

      <div style={{ padding: '14px 16px 90px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ranked.map(({ d, score, reasons }) => {
          const Icon = CATEGORY_ICON[d.category];
          return (
            <button key={d.id} onClick={() => onOpenDestination(d.id)} style={{ textAlign: 'left', background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: 12, cursor: 'pointer' }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 58, height: 58, borderRadius: 12, flexShrink: 0, background: 'linear-gradient(160deg,#2D6A4F,#123527)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={24} color={C.leafSoft} strokeWidth={1.6} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 13.5, color: C.ink }}>{d.name}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.trail, flexShrink: 0 }}>{score}% match</div>
                  </div>
                  <div style={{ marginTop: 4 }}><DifficultyBadge level={d.difficulty} size="sm" /></div>
                </div>
              </div>
              {reasons.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
                  {reasons.map((r) => (
                    <span key={r} style={{ fontSize: 10.5, color: C.trail, background: C.leafSoft, padding: '3px 9px', borderRadius: 999, fontWeight: 600 }}>{r}</span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------- GOVERNMENT DASHBOARD -------------------------------- */
function GovernmentDashboard() {
  const diffCounts = ['Easy', 'Moderate', 'Difficult', 'Extreme'].map((lvl) => ({
    name: lvl,
    value: DESTINATIONS.reduce((n, d) => n + (d.difficulty === lvl ? 1 : 0) + d.alternatives.filter((a) => a.difficulty === lvl).length, 0),
    color: DIFF[lvl].c,
  }));
  const statusList = [
    { short: 'Coban Rondo', name: 'Coban Rondo', status: 'Open', note: 'Normal conditions, steps wet in the morning', visitors: 540 },
    { short: 'Paralayang', name: 'Paralayang Gunung Banyak', status: 'Caution', note: 'Strong wind, flights paused 10:00–14:00', visitors: 318 },
    { short: 'Cangar', name: 'Cangar — Welirang Trail', status: 'Closed', note: 'Welirang trail closed: heavy rain, landslide risk. Hot spring area open.', visitors: 41 },
  ];
  const visitorData = statusList.map((s) => ({ name: s.short, visitors: s.visitors }));
  const totalVisitors = statusList.reduce((n, s) => n + s.visitors, 0);
  const activeTrails = statusList.filter((s) => s.status !== 'Closed').length;
  const statusMeta = {
    Open: { c: DIFF.Easy.c, bg: DIFF.Easy.bg, Icon: CheckCircle2 },
    Caution: { c: DIFF.Moderate.c, bg: DIFF.Moderate.bg, Icon: AlertTriangle },
    Closed: { c: DIFF.Extreme.c, bg: DIFF.Extreme.bg, Icon: XCircle },
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: C.mist }}>
      <div style={{ background: C.forestDark, padding: '16px 16px 18px', color: '#fff' }}>
        <div style={{ fontSize: 11.5, color: C.leafSoft }}>Dinas Pariwisata Kota Batu</div>
        <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 18, marginTop: 2 }}>Tourism Management Dashboard</div>
        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>Wednesday, 14 October 2026</div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <KpiCard label="Visitors today" value={totalVisitors.toLocaleString()} tone={C.trail} />
          <KpiCard label="Active trails" value={`${activeTrails} / ${statusList.length}`} tone={C.sky} />
          <KpiCard label="Incidents (7d)" value="1" tone={DIFF.Moderate.c} />
          <KpiCard label="Avg. trail rating" value="4.7" tone={C.earth} />
        </div>

        <div style={{ marginTop: 18, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: '14px 10px 6px' }}>
          <div style={{ padding: '0 6px' }}><SectionTitle sub="Estimated visitors today per destination">Visitor traffic</SectionTitle></div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={visitorData} margin={{ top: 4, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 8.5, fill: C.inkMuted }} interval={0} angle={-25} textAnchor="end" height={46} axisLine={{ stroke: C.border }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: C.inkMuted }} axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 10, border: `1px solid ${C.border}` }} />
              <Bar dataKey="visitors" fill={C.trail} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ marginTop: 14, background: C.paper, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
          <ResponsiveContainer width={110} height={110}>
            <PieChart>
              <Pie data={diffCounts} dataKey="value" nameKey="name" innerRadius={30} outerRadius={50} paddingAngle={3}>
                {diffCounts.map((e) => <Cell key={e.name} fill={e.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div style={{ flex: 1 }}>
            <SectionTitle sub="All routes incl. alternatives">Difficulty distribution</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {diffCounts.map((e) => (
                <div key={e.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.ink }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: e.color }} />
                  {e.name} <span style={{ color: C.inkMuted }}>· {e.value} route{e.value !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18, paddingBottom: 24 }}>
          <SectionTitle sub="Live status and today's visitor count">Trail status</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {statusList.map((s) => {
              const m = statusMeta[s.status];
              return (
                <div key={s.name} style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 12.5, color: C.ink, paddingRight: 8 }}>{s.name}</div>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: m.c, background: m.bg, padding: '3px 9px', borderRadius: 999, flexShrink: 0 }}>
                      <m.Icon size={11} /> {s.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 5 }}>{s.note}</div>
                  <div style={{ fontSize: 10.5, color: C.inkMuted, marginTop: 4 }}>{s.visitors} visitors today</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, tone }) {
  return (
    <div style={{ background: C.paper, border: `1px solid ${C.border}`, borderRadius: 14, padding: 12 }}>
      <div style={{ fontSize: 10.5, color: C.inkMuted, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 19, color: tone, marginTop: 3 }}>{value}</div>
    </div>
  );
}

/* -------------------------------- BOTTOM NAV -------------------------------- */
function BottomNav({ active, onChange }) {
  const items = [
    { key: 'home', label: 'Home', icon: HomeIcon },
    { key: 'ai', label: 'AI Route Guide', icon: Sparkles },
    { key: 'recommendation', label: 'For You', icon: Compass },
    { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  ];
  return (
    <div style={{ display: 'flex', borderTop: `1px solid ${C.border}`, background: C.paper, padding: '8px 4px 10px' }}>
      {items.map((it) => {
        const isActive = active === it.key;
        return (
          <button key={it.key} onClick={() => onChange(it.key)} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <it.icon size={19} color={isActive ? C.trail : C.inkMuted} strokeWidth={isActive ? 2.3 : 1.8} />
            <span style={{ fontSize: 9, whiteSpace: 'nowrap', fontWeight: isActive ? 700 : 500, color: isActive ? C.trail : C.inkMuted }}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------ APP ------------------------------------ */
export default function App() {
  const [stage, setStage] = useState('splash'); // splash | onboarding | signin | signup | app
  const [tab, setTab] = useState('home');
  const [subScreen, setSubScreen] = useState(null); // null | 'detail' | 'difficulty' | 'profile' | 'ai'
  const [aiOrigin, setAiOrigin] = useState('detail');
  const [selectedId, setSelectedId] = useState('cobanrondo');
  const [prefs, setPrefs] = useState({ age: '', fitness: '', vehicle: '', companions: [] });

  const dest = DESTINATIONS.find((d) => d.id === selectedId);
  const inApp = stage === 'app';

  const openDestination = (id) => { setSelectedId(id); setTab('home'); setSubScreen('detail'); };
  const changeTab = (t) => { setTab(t); setSubScreen(null); };
  const openAI = (from) => { setAiOrigin(from); setSubScreen('ai'); };

  let content;
  if (stage === 'splash') {
    content = <SplashScreen onDone={() => setStage('onboarding')} />;
  } else if (stage === 'onboarding') {
    content = <OnboardingScreen onStart={() => setStage('signup')} onSignIn={() => setStage('signin')} />;
  } else if (stage === 'signin') {
    content = <AuthScreen key="signin" mode="signin" onSubmit={() => setStage('app')} onSwitch={() => setStage('signup')} />;
  } else if (stage === 'signup') {
    content = <AuthScreen key="signup" mode="signup" onSubmit={() => setStage('app')} onSwitch={() => setStage('signin')} />;
  } else if (tab === 'home' && subScreen === 'detail') {
    content = <DestinationDetail dest={dest} onBack={() => setSubScreen(null)} onDifficulty={() => setSubScreen('difficulty')} onProfile={() => setSubScreen('profile')} onAskAI={() => openAI('detail')} />;
  } else if (tab === 'home' && subScreen === 'difficulty') {
    content = <RouteDifficultyScreen dest={dest} onBack={() => setSubScreen('detail')} onProfile={() => setSubScreen('profile')} onAskAI={() => openAI('difficulty')} />;
  } else if (tab === 'home' && subScreen === 'profile') {
    content = <RouteProfileScreen dest={dest} onBack={() => setSubScreen('difficulty')} />;
  } else if (tab === 'home' && subScreen === 'ai') {
    content = <AIRouteGuideScreen key={`ai-${selectedId}`} contextId={selectedId} onBack={() => setSubScreen(aiOrigin)} onOpenDetail={openDestination} />;
  } else if (tab === 'home') {
    content = <HomeScreen onOpenDestination={openDestination} />;
  } else if (tab === 'ai') {
    content = <AIRouteGuideScreen key="ai-general" contextId={null} onBack={null} onOpenDetail={openDestination} />;
  } else if (tab === 'preference') {
    content = <UserPreferenceScreen prefs={prefs} setPrefs={setPrefs} onSubmit={() => setTab('recommendation')} />;
  } else if (tab === 'recommendation') {
    content = prefs.age && prefs.fitness ? (
      <RecommendationScreen prefs={prefs} onOpenDestination={openDestination} onEditPrefs={() => setTab('preference')} />
    ) : (
      <EmptyRecommendation onSetPrefs={() => setTab('preference')} />
    );
  } else if (tab === 'dashboard') {
    content = <GovernmentDashboard />;
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#EAF0EA', fontFamily: 'Inter, sans-serif', padding: 20 }}>
      <style>{FONT_IMPORT}</style>
      <div style={{ width: 390, height: 760, background: '#000', borderRadius: 46, padding: 12, boxShadow: '0 30px 60px rgba(18,42,32,0.35)' }}>
        <div style={{ width: '100%', height: '100%', background: C.paper, borderRadius: 34, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 28, background: inApp ? C.paper : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 26px', fontSize: 12, fontWeight: 700, color: inApp ? C.ink : '#000', flexShrink: 0, position: inApp ? 'static' : 'absolute', top: 0, left: 0, right: 0, zIndex: 20 }}>
            <span>9:41</span>
            <span style={{ width: 90, height: 22, background: '#000', borderRadius: 12, position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 2 }} />
            <span>100%</span>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>{content}</div>
          {inApp && <BottomNav active={tab} onChange={changeTab} />}
        </div>
      </div>
    </div>
  );
}

function EmptyRecommendation({ onSetPrefs }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 30, textAlign: 'center', background: C.mist }}>
      <Compass size={40} color={C.trail} strokeWidth={1.5} />
      <div style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 16, color: C.ink, marginTop: 14 }}>No recommendations yet</div>
      <div style={{ fontSize: 12.5, color: C.inkMuted, marginTop: 6, lineHeight: 1.5 }}>Tell us about your fitness level, age and travel companions to get matched routes.</div>
      <button onClick={onSetPrefs} style={{ marginTop: 18, background: C.trail, color: '#fff', border: 'none', borderRadius: 12, padding: '11px 22px', fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
        Set my preferences
      </button>
    </div>
  );
}
