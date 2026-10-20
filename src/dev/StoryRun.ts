import * as THREE from 'three';
import type { Game } from '../core/Game';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const down = (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
const up = (code: string) => window.dispatchEvent(new KeyboardEvent('keyup', { code }));
async function tap(code: string, ms = 70) {
  down(code);
  await wait(ms);
  up(code);
}

export interface RunLog {
  t: number;
  what: string;
}

/**
 * DEV only. Plays Story Escape the way a player who only reads the screen would: it steers the real
 * player controller with real key events along the objective route the game shows (the minimap
 * route / marker), presses E when the prompt says so, holds E for the relay, hides on a roof when
 * hunted, and walks into the express when its doors open. Logs every objective, subtitle and step.
 */
export async function runStory(game: Game, opts: { watchIntro?: boolean; timeScale?: number } = {}) {
  const g = game as unknown as { timeScale: number };
  const log: RunLog[] = [];
  const t0 = performance.now();
  const note = (what: string) => log.push({ t: +((performance.now() - t0) / 1000).toFixed(1), what });
  // Subtitles and objectives as the player sees them.
  const seen = new Set<string>();
  const mo = new MutationObserver(() => {
    for (const e of Array.from(document.querySelectorAll('.subtitles .sub'))) {
      const s = e.textContent ?? '';
      if (!seen.has(s)) {
        seen.add(s);
        note(`SUB ${s.slice(0, 90)}`);
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
  let lastObj = '';
  const objWatch = window.setInterval(() => {
    const o = game.story.def?.title ?? '';
    if (o !== lastObj) {
      lastObj = o;
      note(`OBJECTIVE ${o || '(none)'} · act ${game.mission.act} · step ${game.mission.step}`);
    }
  }, 100);

  const P = game.player;
  /** Walk along points with the real controller; returns true if `done` became true. */
  const walk = async (points: () => THREE.Vector3[], done: () => boolean, maxS: number, sprint = true) => {
    down('KeyW');
    if (sprint) down('ShiftLeft');
    let ref = P.pos.clone();
    let refT = performance.now();
    const end = performance.now() + maxS * 1000;
    let ok = false;
    while (performance.now() < end) {
      if (done()) {
        ok = true;
        break;
      }
      if (game.state === 'paused') (window as unknown as { __dev: { lock(): void } }).__dev.lock();
      const pts = points();
      const next = pts.find((q) => Math.hypot(q.x - P.pos.x, q.z - P.pos.z) > 2);
      if (next) P.yaw = Math.atan2(-(next.x - P.pos.x), -(next.z - P.pos.z));
      // Stuck: hop (vaults low rails) and nudge sideways.
      if (performance.now() - refT > 1500) {
        if (P.pos.distanceTo(ref) < 0.4) {
          await tap('Space');
          P.yaw += (Math.random() - 0.5) * 1.2;
        }
        ref = P.pos.clone();
        refT = performance.now();
      }
      await wait(50);
    }
    up('KeyW');
    up('ShiftLeft');
    return ok;
  };
  const route = () => game.story.guidance.path;
  const prompt = () => document.querySelector('#story .prompt.on')?.textContent ?? '';

  try {
    // ---- 1. Opening.
    if (opts.watchIntro) {
      (document.querySelector('[data-mode=story]') as HTMLElement).click();
      note('clicked STORY ESCAPE');
      await wait(7000);
      note(`intro shot 1: ${game.crowd.civs.filter((c) => !c.hidden).length} civilians in detail, ${game.security.guards.length} officers on duty`);
      while (game.state === 'intro') await wait(200);
      note(`intro finished → ${game.state}`);
    } else {
      (window as unknown as { __dev: { start(m: string): void } }).__dev.start('story');
    }
    (window as unknown as { __dev: { lock(): void; god(): void } }).__dev.lock();
    (window as unknown as { __dev: { god(): void } }).__dev.god();
    g.timeScale = opts.timeScale ?? 1;
    await wait(600);
    note(`play · weapon ${game.weapon.visible ? 'drawn' : 'holstered'}`);
    await tap('KeyX');
    await wait(500);
    note(`X → weapon ${game.weapon.visible ? 'drawn' : 'holstered'}`);
    await tap('KeyX');
    await wait(500);
    note(`X → weapon ${game.weapon.visible ? 'drawn' : 'holstered'}`);

    // ---- 2. Find Kenji: follow the route until the prompt offers the talk.
    const met = await walk(route, () => prompt().includes('KENJI'), 90, false);
    note(`reached Kenji: ${met} · prompt "${prompt()}"`);
    await tap('KeyE');
    await wait(400);
    note(`E → step ${game.mission.step}`);

    // ---- 3. Ambush: when hunted, run for the Sky Garden roof and stay out of sight.
    while (game.mission.step === 'talk') await wait(200);
    note(`ambush · alert ${game.security.alert.level}, ${game.security.guards.filter((x) => x.hostile).length} hunting`);
    // Like a player: run for whichever hideout is furthest from the hunters; re-pick when blocked.
    const hideouts = [
      new THREE.Vector3(30, 8.5, 9), // Sky Garden
      new THREE.Vector3(-12, 8.5, 12), // West Terrace
      new THREE.Vector3(12, 8.5, 20), // Lantern Roof
      new THREE.Vector3(-40, 0, -4), // Service Passage, far end
      new THREE.Vector3(0, 0, -48), // Railway Street, far end
    ];
    const pick = () => {
      const hunters = game.security.guards.filter((x) => x.alive && x.hostile);
      const score = (h: THREE.Vector3) => Math.min(...hunters.map((x) => x.pos.distanceTo(h)), 999) - 0.25 * P.pos.distanceTo(h);
      return hideouts.slice().sort((a, b) => score(b) - score(a))[0];
    };
    let roof = pick();
    const roofRoute = () => {
      const ids = game.nav.route(P.pos.clone().setY(P.pos.y + 1), roof.clone().setY(roof.y + 1));
      return ids.map((i) => game.nav.nodes[i].clone().setY(game.nav.nodes[i].y - 1)).concat([roof]);
    };
    let cached = roofRoute();
    let cachedT = 0;
    for (let attempt = 0; attempt < 4 && P.pos.distanceTo(roof) >= 2; attempt++) {
      note(`running for the hideout at ${roof.toArray().join(',')}`);
      await walk(
        () => {
          if (performance.now() - cachedT > 800) {
            cached = roofRoute();
            cachedT = performance.now();
          }
          return cached;
        },
        () => P.pos.distanceTo(roof) < 2,
        30,
      );
      if (P.pos.distanceTo(roof) >= 2) {
        const before = roof;
        roof = pick();
        if (roof === before) roof = hideouts[(hideouts.indexOf(before) + 1) % hideouts.length];
      }
    }
    note(`hiding (${P.pos.toArray().map((v) => v.toFixed(0)).join(',')}) · alert ${game.security.alert.level}`);
    // Wait it out; fight anyone who has eyes on us, move on if they close in, holster when clear.
    const lostBy = performance.now() + 240000;
    let kills = 0;
    while (game.mission.step === 'ambush' && performance.now() < lostBy) {
      const eye = P.pos.clone().setY(P.pos.y + 1.6);
      const threats = game.security.guards
        .filter((x) => x.alive && x.hostile && x.pos.distanceTo(P.pos) < 22 && game.col.lineOfSight(eye, x.chest.clone()))
        .sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos));
      if (threats.length) {
        if (!game.weapon.visible) {
          await tap('KeyX');
          await wait(450);
        }
        const tgt = threats[0];
        const c = tgt.chest.clone();
        const before = tgt.alive;
        P.yaw = Math.atan2(-(c.x - P.pos.x), -(c.z - P.pos.z));
        P.pitch = Math.atan2(c.y - (P.pos.y + 1.65), Math.hypot(c.x - P.pos.x, c.z - P.pos.z));
        game.input.mouseDown = true;
        await wait(260);
        game.input.mouseDown = false;
        if (before && !tgt.alive) kills++;
        if (game.weapon.ammo === 0) await tap('KeyR');
        await wait(120);
        continue;
      }
      if (game.weapon.visible && game.security.hostiles(30) === 0) await tap('KeyX');
      const near = game.security.guards.some((x) => x.alive && x.hostile && x.pos.distanceTo(P.pos) < 10);
      if (near) {
        roof = pick();
        cached = roofRoute();
        cachedT = performance.now();
        await walk(() => cached, () => P.pos.distanceTo(roof) < 2 || game.mission.step !== 'ambush', 15);
      }
      await wait(300);
    }
    note(`fought: ${kills} officers down`);
    note(`after hiding: step ${game.mission.step} · alert ${game.security.alert.level} · escapes ${game.security.alert.escapes}`);

    // ---- 4. Departure board.
    const atBoard = await walk(route, () => prompt().includes('DEPARTURES'), 90, false);
    note(`board reached: ${atBoard}`);
    await tap('KeyE');
    while (game.mission.step === 'board') await wait(200);
    note(`board read → step ${game.mission.step}`);

    // ---- 5. Relay: follow the route up to the roof, hold E.
    const atRelay = await walk(route, () => prompt().includes('RELAY'), 120, false);
    note(`relay reached: ${atRelay} · ${P.pos.toArray().map((v) => v.toFixed(1)).join(',')}`);
    down('KeyE');
    await wait(2400);
    up('KeyE');
    await wait(300);
    note(`relay held → step ${game.mission.step} · alert ${game.security.alert.level}`);

    // ---- 6. Station and the last express.
    await walk(route, () => game.mission.step === 'train' && P.pos.distanceTo(new THREE.Vector3(0, -6, 31)) < 6, 150);
    note(`on the platform: step ${game.mission.step} · ${P.pos.toArray().map((v) => v.toFixed(1)).join(',')}`);
    const deadline = performance.now() + 240000;
    while (game.state === 'play' && performance.now() < deadline) {
      const a = game.rail.tt.active();
      if (a && a.s.escape && game.rail.train.doorK > 0.9) {
        const cabin = game.rail.train.cabinPoint(1, new THREE.Vector3()).setY(-6);
        note('the express is open: walking in');
        await walk(() => [cabin], () => game.rail.train.inside(P.pos) || game.state !== 'play', 20);
        note(`inside: ${game.rail.train.inside(P.pos)}`);
        while (game.state === 'play' && performance.now() < deadline) await wait(200);
        break;
      }
      await wait(200);
    }
    note(`state ${game.state}`);
    while (game.state === 'ending' && game.endScreen.root.classList.contains('hidden')) await wait(300);
    note(`end card: ${!game.endScreen.root.classList.contains('hidden')}`);
  } finally {
    up('KeyW');
    up('ShiftLeft');
    up('KeyE');
    mo.disconnect();
    window.clearInterval(objWatch);
    g.timeScale = 1;
  }
  return log;
}
