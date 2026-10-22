import { describe, expect, it } from 'vitest';
import { ARMORY, ARMORY_ORDER, armoryByKey, dealArm, isWeaponId } from '../entities/weapons/armory';
import { Loadout } from './Loadout';
import { NAME_MAX, cleanName, loadName, randomName, saveName } from './PlayerName';
import { CALLSIGNS, dealCallsigns } from '../enemies/Callsigns';
import { wantsAim } from '../enemies/arena/DeathmatchAI';

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An in-memory Storage. */
function store(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('13.0: the armory', () => {
  it('three weapons, keys 1–3 in order, each with a bot profile of its own id', () => {
    expect(ARMORY_ORDER).toEqual(['smg', 'ar', 'shotgun']);
    expect(ARMORY_ORDER.map((id) => ARMORY[id].key)).toEqual(['1', '2', '3']);
    for (const id of ARMORY_ORDER) expect(ARMORY[id].bot.id).toBe(id);
    expect(armoryByKey('Digit3')?.id).toBe('shotgun');
    expect(armoryByKey('Numpad1')?.id).toBe('smg');
    expect(armoryByKey('KeyR')).toBeNull();
    expect(isWeaponId('ar')).toBe(true);
    expect(isWeaponId('railgun')).toBe(false);
  });

  it('the rifle is exactly the 7.0–12.0 arena rifle; the bot ranges are ordered shotgun < SMG < rifle', () => {
    const ar = ARMORY.ar.bot;
    expect([ar.mag, ar.reload, ar.burst, ar.burstGap, ar.burstRest, ar.hipSpread, ar.damage]).toEqual([20, 1.5, 5, 0.1, 0.15, 0.012, 1]);
    expect(ar.band).toEqual([9, 20]);
    expect(ar.aim).toMatchObject({ enter: 13, exit: 11 });
    expect(ar.maxRange).toBe(40);
    const sg = ARMORY.shotgun.bot, smg = ARMORY.smg.bot;
    expect(sg.maxRange).toBeLessThan(smg.maxRange);
    expect(smg.maxRange).toBeLessThan(ar.maxRange);
    expect(sg.band[1]).toBeLessThan(smg.band[1]);
    expect(smg.band[1]).toBeLessThan(ar.band[1]);
    // A shotgun's full shell outhits a rifle burst up close; one pellet is weaker than a round.
    expect(sg.pellets * sg.damage).toBeGreaterThan(ar.burst * ar.damage * 0.8);
    expect(sg.damage).toBeLessThan(ar.damage);
  });

  it('bots aim by their own gun: the shotgun never, the SMG later than the rifle', () => {
    for (const d of [5, 12, 16, 30]) expect(wantsAim(d, false, ARMORY.shotgun.bot)).toBe(false);
    expect(wantsAim(14, false, ARMORY.ar.bot)).toBe(true);
    expect(wantsAim(14, false, ARMORY.smg.bot)).toBe(false);
    expect(wantsAim(18, false, ARMORY.smg.bot)).toBe(true);
    expect(wantsAim(ARMORY.smg.bot.maxRange + 1, true, ARMORY.smg.bot)).toBe(false);
    // The default stays the rifle (11.0 callers).
    expect(wantsAim(14, false)).toBe(true);
  });

  it('the deal is uniform, and never past the cap of one gun on a team', () => {
    const rng = mulberry32(3);
    const n: Record<string, number> = {};
    for (let i = 0; i < 3000; i++) {
      const a = dealArm([], Infinity, rng);
      n[a.id] = (n[a.id] ?? 0) + 1;
    }
    for (const id of ARMORY_ORDER) expect(n[id]).toBeGreaterThan(850);
    for (let i = 0; i < 200; i++) expect(dealArm(['shotgun', 'shotgun', 'ar'], 2, rng).id).not.toBe('shotgun');
    for (let i = 0; i < 200; i++) expect(dealArm(['shotgun', 'shotgun', 'ar', 'ar'], 2, rng).id).toBe('smg');
    // Everything capped (a cap below the team size): still a gun.
    expect(ARMORY_ORDER).toContain(dealArm(['smg', 'ar', 'shotgun'], 1, rng).id);
  });
});

describe('13.0: the loadout', () => {
  it('starts on the rifle, or the last pick remembered', () => {
    expect(new Loadout(store()).current).toBe('ar');
    expect(new Loadout(store({ 'gridfall.loadout': 'shotgun' })).current).toBe('shotgun');
    expect(new Loadout(store({ 'gridfall.loadout': 'bfg' })).current).toBe('ar');
    expect(new Loadout(null).current).toBe('ar');
  });

  it('a pick is queued, remembered, and carried only from the next commit (spawn)', () => {
    const s = store();
    const l = new Loadout(s);
    expect(l.queue('smg')).toBe(true);
    expect(l.queue('smg')).toBe(false);
    expect(l.current).toBe('ar');
    expect(s.m.get('gridfall.loadout')).toBe('smg');
    expect(l.commit()).toBe(true);
    expect(l.current).toBe('smg');
    expect(l.entry.spec.name).toBe('KITSUNE-9');
    expect(l.commit()).toBe(false);
  });

  it('survives storage that throws', () => {
    const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const l = new Loadout(bad);
    expect(l.current).toBe('ar');
    expect(l.queue('shotgun')).toBe(true);
    expect(l.commit()).toBe(true);
  });
});

describe('13.0: the player name (17.0: a random handle by default)', () => {
  const mem = (v: string | null = null) => {
    const m = new Map<string, string>();
    if (v !== null) m.set('gridfall.name', v);
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, x: string) => void m.set(k, x), removeItem: (k: string) => void m.delete(k), m };
  };

  it('with nothing saved, a title-cased handle from the callsign pool, different across boots', () => {
    const names = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const n = loadName(() => i / 30, mem());
      expect(CALLSIGNS).toContain(n.toUpperCase());
      expect(n).toBe(n.charAt(0) + n.slice(1).toLowerCase());
      names.add(n);
    }
    expect(names.size).toBe(30);
    expect(randomName(() => 0)).toBe('Jax');
    expect(randomName(() => 0.999999)).toBe('Quill');
    expect(loadName(() => 0, null)).toBe('Jax');
  });

  it('a saved name wins; only typed names are saved; clearing forgets', () => {
    expect(loadName(() => 0, mem('Neo Rider'))).toBe('Neo Rider');
    expect(loadName(() => 0, mem('  <>  '))).toBe('Jax');
    const s = mem();
    saveName('  Neo   Rider ', s);
    expect(s.m.get('gridfall.name')).toBe('Neo Rider');
    saveName('   ', s);
    expect(s.m.has('gridfall.name')).toBe(false);
  });

  it('keeps an ordinary name as typed; empty becomes the fallback', () => {
    expect(cleanName('')).toBe('');
    expect(cleanName('   ', 'Nova')).toBe('Nova');
    expect(cleanName(null, 'Nova')).toBe('Nova');
    expect(cleanName('Artem')).toBe('Artem');
    expect(cleanName('  Neo   Rider ')).toBe('Neo Rider');
  });

  it('is plain text (it is put inside the feed and scoreboard HTML) and short', () => {
    expect(cleanName('<img src=x onerror=alert(1)>')).toBe('img src=x oner');
    expect(cleanName('a&b"c\'d`e\\f')).toBe('abcdef');
    expect(cleanName('tab\there\nnew')).toBe('tabherenew');
    expect(cleanName('x'.repeat(40)).length).toBe(NAME_MAX);
    expect(cleanName('<>&', 'Vesper')).toBe('Vesper');
  });
});

describe('13.0: bot callsigns', () => {
  it('a pool of 20–30 distinct handles, none of the old fixed roster', () => {
    expect(CALLSIGNS.length).toBeGreaterThanOrEqual(20);
    expect(CALLSIGNS.length).toBeLessThanOrEqual(30);
    expect(new Set(CALLSIGNS).size).toBe(CALLSIGNS.length);
    for (const old of ['MAXIM', 'ANATOLY', 'KOSTYA', 'ILYA']) expect(CALLSIGNS).not.toContain(old);
  });

  it('a match deals distinct names, never the player’s, in a different order each time', () => {
    const a = dealCallsigns(9, ['Nova'], mulberry32(1));
    expect(a).toHaveLength(9);
    expect(new Set(a).size).toBe(9);
    expect(a).not.toContain('NOVA');
    expect(dealCallsigns(9, [], mulberry32(2))).not.toEqual(dealCallsigns(9, [], mulberry32(5)));
    // More slots than names: numbered handles fill in.
    const many = dealCallsigns(CALLSIGNS.length + 2, [], mulberry32(1));
    expect(new Set(many).size).toBe(CALLSIGNS.length + 2);
  });
});
