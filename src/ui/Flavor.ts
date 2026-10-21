import { jpNumber } from './jpNumber';

/*
  16.0, the UI's decorative sub-text by biome. Until 15.0 every label carried Japanese under or beside
  its English (VITAL 生命, PAUSED 一時停止), a legacy of Tokyo; in the desert or the jungle it read
  as a mistake. The English stays the same everywhere (it is the readable text); the flavor line is
  in the script of the place:
   - tokyo  (Tokyo Night, Neon Block): Japanese;
   - desert (Desert Outpost): Arabic;
   - docks  (Neon Docks): Russian, industrial (ДОК-7, ЗОНА ПОГРУЗКИ);
   - jungle (Deep Jungle, Crash Site): Thai, and military grid references where a place is named.

  One dictionary: key → the line in each biome. `setBiome` (the level manager, at every level load)
  switches it and rewrites every element marked `data-fl="key"` in one pass (no per-frame cost: the
  HUD's per-frame text, like the wave counter, asks `fl()` only when its number changes). Numerals
  follow the biome too (kanji, Arabic-Indic, Thai digits).

  Pure apart from `applyFlavor` (DOM): tested in flavor.test.ts.
*/

export type Biome = 'tokyo' | 'desert' | 'docks' | 'jungle';
export const BIOMES: readonly Biome[] = ['tokyo', 'desert', 'docks', 'jungle'];

/** The script's language tag (the stylesheet picks font and spacing by it: Arabic and Thai take no tracking). */
export const LANG: Record<Biome, string> = { tokyo: 'ja', desert: 'ar', docks: 'ru', jungle: 'th' };

type Line = Record<Biome, string>;
const L = (tokyo: string, desert: string, docks: string, jungle: string): Line => ({ tokyo, desert, docks, jungle });

export const FLAVOR = {
  // HUD
  vital: L('生命', 'الصحة', 'ЗДОРОВЬЕ', 'ชีวิต'),
  wave: L('波', 'الموجة', 'ВОЛНА', 'คลื่น'),
  waveBreak: L('小休止', 'استراحة', 'ПЕРЕДЫШКА', 'พัก'),
  cleared: L('突破', 'تم التطهير', 'ЗАЧИЩЕНО', 'เคลียร์แล้ว'),
  neutralized: L('排除', 'تم التحييد', 'НЕЙТРАЛИЗОВАН', 'กำจัดแล้ว'),
  // Main menu
  callsign: L('名前', 'رمز النداء', 'ПОЗЫВНОЙ', 'สัญญาณเรียกขาน'),
  mode: L('モード', 'النمط', 'РЕЖИМ', 'โหมด'),
  map: L('舞台', 'الخريطة', 'КАРТА', 'แผนที่'),
  armory: L('武器庫', 'مستودع السلاح', 'АРСЕНАЛ', 'คลังอาวุธ'),
  settings: L('設定', 'الإعدادات', 'НАСТРОЙКИ', 'ตั้งค่า'),
  controls: L('操作', 'التحكم', 'УПРАВЛЕНИЕ', 'การควบคุม'),
  back: L('戻る', 'رجوع', 'НАЗАД', 'กลับ'),
  deploy: L('出撃', 'انتشار', 'ВЫСАДКА', 'ส่งกำลัง'),
  modeTdm: L('チーム戦', 'قتال الفرق', 'КОМАНДНЫЙ БОЙ', 'เดธแมตช์ทีม'),
  modeArcade: L('生存', 'البقاء', 'ВЫЖИВАНИЕ', 'เอาชีวิตรอด'),
  modeStory: L('脱出', 'الهروب', 'ПОБЕГ', 'หลบหนี'),
  // Pause menu
  paused: L('一時停止', 'متوقف', 'ПАУЗА', 'หยุดชั่วคราว'),
  resume: L('再開', 'استئناف', 'ПРОДОЛЖИТЬ', 'เล่นต่อ'),
  restart: L('最初から', 'من البداية', 'ЗАНОВО', 'เริ่มใหม่'),
  quitToMenu: L('メニューへ', 'إلى القائمة', 'В МЕНЮ', 'ไปที่เมนู'),
  confirm: L('確認', 'تأكيد', 'ПОДТВЕРДИТЬ', 'ยืนยัน'),
  audio: L('音量', 'الصوت', 'ЗВУК', 'เสียง'),
  graphics: L('画質', 'الرسومات', 'ГРАФИКА', 'กราฟิก'),
  muted: L('消音', 'كتم', 'БЕЗ ЗВУКА', 'ปิดเสียง'),
  soundOn: L('音あり', 'مفعّل', 'ЗВУК ВКЛ', 'เปิดเสียง'),
  powerSave: L('省電力', 'توفير الطاقة', 'ЭКОНОМ', 'ประหยัดพลังงาน'),
  standard: L('標準', 'قياسي', 'СТАНДАРТ', 'มาตรฐาน'),
  smooth: L('高', 'سلس', 'ПЛАВНО', 'ลื่นไหล'),
  tips: L('ヒント', 'تلميحات', 'ПОДСКАЗКИ', 'คำแนะนำ'),
  saved: L('設定は保存されます', 'يتم حفظ الإعدادات', 'НАСТРОЙКИ СОХРАНЕНЫ', 'บันทึกการตั้งค่าแล้ว'),
  // Team Deathmatch
  ally: L('味方', 'حليف', 'СВОИ', 'พวกเรา'),
  enemy: L('敵', 'عدو', 'ЧУЖИЕ', 'ศัตรู'),
  tdmBanner: L('チームデスマッチ · 5v5', 'قتال الفرق · ٥ ضد ٥', 'КОМАНДНЫЙ БОЙ · 5 НА 5', 'เดธแมตช์ทีม · ๕ ต่อ ๕'),
  victory: L('勝利', 'نصر', 'ПОБЕДА', 'ชนะ'),
  defeat: L('敗北', 'هزيمة', 'ПОРАЖЕНИЕ', 'แพ้'),
  deploying: L('展開', 'جارٍ الانتشار', 'ВЫСАДКА', 'กำลังส่งกำลัง'),
  nextMap: L('次の舞台', 'الخريطة التالية', 'СЛЕДУЮЩАЯ КАРТА', 'แผนที่ถัดไป'),
  mainMenu: L('メニュー', 'القائمة', 'МЕНЮ', 'เมนู'),
  loadout: L('装備', 'العتاد', 'СНАРЯЖЕНИЕ', 'อาวุธ'),
  nextSpawn: L('次の装備', 'العتاد التالي', 'СЛЕД. ВЫСАДКА', 'อาวุธรอบถัดไป'),
  // Survival death screen
  flatline: L('雨は止まない', 'الرمال لا تنام', 'ДОК НЕ СПИТ', 'ป่าไม่เคยหลับ'),
  // Weapons (the armory's guns, by id)
  smg: L('狐', 'ثعلب', 'ЛИСА', 'จิ้งจอก'),
  ar: L('豺', 'ابن آوى', 'ШАКАЛ', 'หมาใน'),
  shotgun: L('猪', 'خنزير بري', 'КАБАН', 'หมูป่า'),
} satisfies Record<string, Line>;

export type FlavorKey = keyof typeof FLAVOR;

let current: Biome = 'tokyo';
const listeners = new Set<(b: Biome) => void>();

export function getBiome() {
  return current;
}

/** The flavor line for `key` (in `biome`, default the current one). */
export function fl(key: FlavorKey, biome: Biome = current) {
  return FLAVOR[key][biome];
}

const DIGITS: Record<Biome, string | null> = { tokyo: null, desert: '٠١٢٣٤٥٦٧٨٩', docks: null, jungle: '๐๑๒๓๔๕๖๗๘๙' };

/** A number in the biome's numerals (kanji in Tokyo, Arabic-Indic, Western, Thai). */
export function flNumber(n: number, biome: Biome = current) {
  if (biome === 'tokyo') return jpNumber(n);
  const d = DIGITS[biome];
  return d ? String(n).replace(/[0-9]/g, (c) => d[+c]) : String(n);
}

/** "Wave n" as the flavor line: 第三波, الموجة ٣, ВОЛНА 03, คลื่น ๓. */
export function flWave(n: number, biome: Biome = current) {
  if (biome === 'tokyo') return `第${jpNumber(n)}波`;
  if (biome === 'docks') return `${fl('wave', biome)} ${String(n).padStart(2, '0')}`;
  return `${fl('wave', biome)} ${flNumber(n, biome)}`;
}

/**
 * A flavored span (the `jp` class is the sub-text's style; `data-fl` lets `applyFlavor` rewrite it).
 * With `biome`, fixed in that biome's script (a card for another place) and left alone by `applyFlavor`.
 */
export function flSpan(key: FlavorKey, tag = 'span', cls = 'jp', biome?: Biome) {
  const c = cls ? ` class="${cls}"` : '';
  if (biome) return `<${tag}${c} lang="${LANG[biome]}">${fl(key, biome)}</${tag}>`;
  return `<${tag}${c} data-fl="${key}" lang="${LANG[current]}">${fl(key)}</${tag}>`;
}

/** Rewrite every flavored element under `root` in the current biome. */
export function applyFlavor(root: ParentNode) {
  for (const e of Array.from(root.querySelectorAll<HTMLElement>('[data-fl]'))) {
    const t = fl(e.dataset.fl as FlavorKey);
    if (e.textContent !== t) e.textContent = t;
    e.lang = LANG[current];
  }
}

/**
 * Switch the biome (a level loaded): the document's `data-biome` (fonts and spacing per script, in
 * the stylesheet), every flavored element, then the listeners (UI that builds its own text).
 */
export function setBiome(b: Biome) {
  current = b;
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.biome = b;
    applyFlavor(document);
  }
  for (const f of listeners) f(b);
}

/**
 * Lay out every flavor line in every script once, off screen, at boot (and the menu's typefaces in
 * each weight): the first biome switch then finds its fonts resolved and its glyphs cached, and
 * `document.fonts.ready` waits for the web fonts before the menu shows.
 */
export function prewarmFlavor(parent: HTMLElement) {
  const box = document.createElement('div');
  box.className = 'fl-prewarm';
  box.setAttribute('aria-hidden', 'true');
  const all = Object.values(FLAVOR);
  box.innerHTML =
    BIOMES.map((b) => `<span class="jp" lang="${LANG[b]}">${all.map((l) => l[b]).join(' ')} ${flWave(10, b)}</span>`).join('') +
    ['500', '600', '700'].map((w) => `<span style="font-family:Rajdhani;font-weight:${w}">GRIDFALL 0123456789</span>`).join('') +
    ['700', '900'].map((w) => `<span style="font-family:Orbitron;font-weight:${w}">GRIDFALL</span>`).join('');
  parent.appendChild(box);
  return box;
}

export function onBiome(f: (b: Biome) => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}
