import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { SettingId } from '../levels/Level';

/** DEV-only console helpers for automated browser checks (never bundled in production). */
export function installDevTools(game: Game) {
  const g = game as unknown as { beginPlay(): void; resume(): void; shoot(): void };
  const dev = {
    /**
     * Skip title and intro and play immediately (pointer lock is faked: automation can't hold it).
     * `setting` loads another level first (synchronously).
     */
    start(mode: 'story' | 'arcade' | 'tdm' = 'story', setting?: SettingId) {
      if (setting && setting !== game.setting) game.loadLevel(setting);
      if (!game.level.info.modes.includes(mode)) throw new Error(`${game.setting} has no ${mode} mode`);
      game.mode = mode;
      game.hud.show(game.hud.title, false);
      g.beginPlay();
      game.input.locked = true;
      if (game.state === 'paused') g.resume();
      return game.state;
    },
    /** 21.0: put a gun in his hands, in a finish (default: the map's). */
    async gun(id: 'pistol' | 'smg' | 'ar' | 'shotgun', theme?: 'blaster' | 'military' | 'corporate') {
      const { ARMORY } = await import('../entities/weapons/armory');
      const { gunThemeFor } = await import('../entities/weapons/theme');
      const spec = ARMORY[id].spec;
      game.weapon.setSpec(spec, theme ?? gunThemeFor(game.setting));
      game.player.gun = spec.handling;
      game.hud.setWeapon(spec.name, '', spec.mag, game.weapon.lowAmmo);
      return { name: spec.name, theme: game.weapon.theme, ballistic: game.weapon.ballistic, sound: game.weapon.sound };
    },
    /**
     * 21.0: every gun in every finish, `laps` times over, rendered each time: GPU geometries, textures
     * (and the programs) after each lap. Flat after the first lap: the swaps free what they build.
     */
    async gunCycle(laps = 4) {
      const ids = ['pistol', 'smg', 'ar', 'shotgun'] as const, themes = ['blaster', 'military', 'corporate'] as const;
      const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
      const info = game.renderer.renderer.info;
      const out: { geometries: number; textures: number; programs: number }[] = [];
      const start = game.weapon.spec;
      for (let l = 0; l < laps; l++) {
        for (const t of themes) for (const id of ids) {
          await dev.gun(id, t);
          await frame();
        }
        out.push({ geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0 });
      }
      game.weapon.setSpec(start, (await import('../entities/weapons/theme')).gunThemeFor(game.setting));
      game.player.gun = start.handling;
      return out;
    },
    /**
     * 22.0: a line-up of merc rigs in front of him, one per gun, posed with the bots' own hold and IK
     * (`raise` 0 the hip, 1 aimed; `pitch` the gun's; `yaw` turns them, 0 facing him). Returns a
     * function that removes them. For screenshots of the grips.
     */
    async rigs(opts: { raise?: number; pitch?: number; yaw?: number; kit?: 'night' | 'corporate'; team?: 'alpha' | 'omega'; dist?: number } = {}) {
      const { OPERATOR_KITS, ARM, setRigGun } = await import('../entities/enemies/operators');
      const { holdPose, gripTargets } = await import('../entities/enemies/rigGuns');
      const { solveArm } = await import('../enemies/RigIK');
      const { RIG_GUNS } = await import('../entities/enemies/rigGuns');
      const p = game.player, dist = opts.dist ?? 3.2;
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      const made: THREE.Object3D[] = [];
      const ids = ['pistol', 'smg', 'ar', 'shotgun'] as const;
      ids.forEach((id, i) => {
        const team = opts.team ?? (i % 2 ? 'omega' : 'alpha');
        const rig = OPERATOR_KITS[opts.kit ?? 'corporate'][team].buildGunner();
        setRigGun(rig, id);
        const s = RIG_GUNS[id];
        const off = (i - 1.5) * 1.1;
        rig.root.position.set(p.pos.x + fx * dist + rx * off, p.pos.y, p.pos.z + fz * dist + rz * off);
        rig.root.rotation.y = Math.atan2(-fx, -fz) + (opts.yaw ?? 0);
        rig.torso.rotation.set(0, -s.blade, 0);
        rig.head.rotation.set(0, s.blade, 0);
        const pos = rig.weapon!.position, rot = rig.weapon!.rotation;
        holdPose(id, rig.head.position, opts.raise ?? 1, 0, opts.pitch ?? 0, pos, rot);
        const g = new THREE.Vector3(), f = new THREE.Vector3(), gq = new THREE.Quaternion(), fq = new THREE.Quaternion();
        gripTargets(id, pos, rig.weapon!.quaternion, g, f, gq, fq);
        const chain = (a: THREE.Object3D, fo: THREE.Object3D, h: THREE.Object3D, sx: number) => ({ arm: a, fore: fo, hand: h, upper: ARM.upper, lower: ARM.lower, pole: new THREE.Vector3(sx > 0 ? 0.5 : -0.6, -1, sx > 0 ? -0.1 : -0.3) });
        solveArm(chain(rig.armR, rig.foreR, rig.handR!, -1), g, gq);
        solveArm(chain(rig.armL, rig.foreL, rig.handL!, 1), f, fq);
        game.scene.add(rig.root);
        made.push(rig.root);
      });
      (window as unknown as { __rigs?: () => void }).__rigs = () => made.forEach((m) => game.scene.remove(m));
      return made.length;
    },
    /**
     * 22.0: the rig's costs: IK solves so far and rigs built (and how many merged geometry), and a
     * micro-benchmark of one solve (µs, `n` solves of a rifle's two arms in a loop).
     */
    async ik(n = 20000) {
      const { ikStats, solveArm } = await import('../enemies/RigIK');
      const { OPERATOR_KITS, ARM, rigStats, setRigGun } = await import('../entities/enemies/operators');
      const { holdPose, gripTargets } = await import('../entities/enemies/rigGuns');
      const rig = OPERATOR_KITS.night.alpha.buildGunner();
      setRigGun(rig, 'ar');
      const R = { arm: rig.armR, fore: rig.foreR, hand: rig.handR!, upper: ARM.upper, lower: ARM.lower, pole: new THREE.Vector3(-0.6, -1, -0.3) };
      const L = { arm: rig.armL, fore: rig.foreL, hand: rig.handL!, upper: ARM.upper, lower: ARM.lower, pole: new THREE.Vector3(0.5, -1, -0.1) };
      const pos = new THREE.Vector3(), rot = new THREE.Euler(), q = new THREE.Quaternion();
      const g = new THREE.Vector3(), f = new THREE.Vector3(), gq = new THREE.Quaternion(), fq = new THREE.Quaternion();
      const before = { ...ikStats, ...rigStats };
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        holdPose('ar', rig.head.position, (i % 100) / 100, 0, 0.1, pos, rot);
        gripTargets('ar', pos, q.setFromEuler(rot), g, f, gq, fq);
        solveArm(R, g, gq);
        solveArm(L, f, fq);
      }
      const us = ((performance.now() - t0) * 1000) / n;
      ikStats.solves = before.solves;
      return { solvesSoFar: before.solves, rigsBuilt: before.built, rigsThatMerged: before.merged, usPerHoldAndTwoSolves: +us.toFixed(3) };
    },
    /** 25.0: the procedural themes measured offline: energy above 1 kHz and 2.5 kHz, RMS, peak. */
    async musicSpectrum(opts: { ids?: string[]; seconds?: number; intensity?: number } = {}) {
      return (await import('./MusicRender')).musicSpectrum(opts);
    },
    lock() {
      game.input.locked = true;
      if (game.state === 'paused') g.resume();
    },
    tp(x: number, y: number, z: number, yaw = game.player.yaw, pitch = 0) {
      const p = game.player;
      p.pos.set(x, y, z);
      p.vel.set(0, 0, 0);
      p.yaw = yaw;
      p.pitch = pitch;
      p.eyeY = y + 1.65;
      game.safety.reset(p.pos);
    },
    /** Face a world point. */
    look(x: number, y: number, z: number) {
      const p = game.player;
      p.yaw = Math.atan2(-(x - p.pos.x), -(z - p.pos.z));
      p.pitch = Math.atan2(y - (p.pos.y + 1.65), Math.hypot(x - p.pos.x, z - p.pos.z));
    },
    god(on = true) {
      const p = game.player as unknown as { damage: unknown; __damage?: unknown };
      if (on && !p.__damage) {
        p.__damage = p.damage;
        p.damage = () => {};
      } else if (!on && p.__damage) {
        p.damage = p.__damage;
        delete p.__damage;
      }
    },
    noGuards() {
      for (const x of game.tokyo.security.guards) x.dispose(game.scene);
      game.tokyo.security.guards.length = 0;
    },
    shoot() {
      g.shoot();
    },
    /** World overlay: cones, lines of sight, goals, search points, last known position. */
    async ai(on = true) {
      const { AIDebug } = await import('./AIDebug');
      const w = window as unknown as { __aiDebug?: InstanceType<typeof AIDebug> };
      w.__aiDebug ??= new AIDebug(game);
      w.__aiDebug.set(on);
    },
    /** Plays Story Escape end to end like a player reading the screen (logs into window.__run). */
    async story(opts: { watchIntro?: boolean; timeScale?: number } = {}) {
      const w = window as unknown as { __run: unknown };
      w.__run = 'running';
      w.__run = await (await import('./StoryRun')).runStory(game, opts);
      return w.__run;
    },
    /** Physics overlay around the camera: colliders by type, the player cylinder and ground point. */
    async colliders(on = true, radius = 25) {
      const { CollisionDebug } = await import('./CollisionDebug');
      const w = window as unknown as { __colDebug?: InstanceType<typeof CollisionDebug> };
      w.__colDebug ??= new CollisionDebug(game);
      w.__colDebug.radius = radius;
      w.__colDebug.set(on);
    },
    /** World validation: reachability, escapes, traps, invisible walls, walk-through visuals. */
    async world(opts: { cell?: number; stationOpen?: boolean; bodyHeight?: number } = {}) {
      return (await import('./WorldCheck')).checkWorld(game, opts);
    },
    /** Real-controller stress runs from sampled reachable cells (walls, falls, voids). */
    async stress(opts: { samples?: number; seconds?: number; fps?: (number | 'spiky')[]; crouch?: boolean } = {}) {
      return (await import('./WorldCheck')).stressController(game, opts);
    },
    /** 9.1: stair-to-wall gaps: their widths, and that a body pressed into one keeps its floor. */
    async stairGaps() {
      return (await import('./WorldCheck')).stairGapProbe(game);
    },
    /** Any level: nav graph from every spawn, runners to every test goal, gunners get a shot off. */
    async levelAI(opts: { spawns?: number; seconds?: number; sight?: number } = {}) {
      return (await import('./LevelAICheck')).checkLevelAI(game, opts);
    },
    /** Train and platform doors: boarding, closed doors, riding, doorway obstruction (real Rail). */
    async train() {
      return (await import('./TrainCheck')).checkTrain(game);
    },
    /** The fixed version-comparison benchmark (current preset). */
    async bench(seconds = 3, opts: { pipelines?: ('v4' | 'raw' | 'v37')[] } = {}) {
      return (await import('./Bench')).bench(game, seconds, opts);
    },
    /** Survival tactics overlay: roles, actions, cover (blown or not), slots, LKP, search plan. */
    async tactics(on = true) {
      const { TacticsDebug } = await import('./TacticsDebug');
      const w = window as unknown as { __tacDebug?: InstanceType<typeof TacticsDebug> };
      w.__tacDebug ??= new TacticsDebug(game);
      w.__tacDebug.set(on);
    },
    /** Headless tactical scenarios on the loaded level (roles, flank, suppress, ghost, soak). */
    async tactical(which?: ('roles' | 'rolesMoving' | 'flank' | 'suppress' | 'ghost' | 'ghostStorm' | 'soak')[], opts: { soakSeconds?: number; stormSight?: number } = {}) {
      return (await import('./TacticsCheck')).checkTactics(game, which, opts);
    },
    /** Arcade Survival played live by a bot (moves, aims, fires): AI behaviour, barks, integrity. */
    async survival(opts: { setting?: SettingId; seconds?: number; startWave?: number } = {}) {
      return (await import('./SurvivalRun')).survivalRun(game, opts);
    },
    /** Survival AI under load on each level: frame cost, AI wall time, rays per frame. */
    async aiBench(opts: { levels?: SettingId[]; seconds?: number; settle?: number } = {}) {
      return (await import('./AIBench')).aiBench(game, opts);
    },
    /** TDM played by the bots alone (the player spectates): kills, ranges, stuck bots, friendly fire, AI cost. */
    async tdmSoak(opts: { seconds?: number; timeScale?: number; tickets?: number; ai?: 'arena' | 'tactical' } = {}) {
      return (await import('./TdmCheck')).tdmSoak(game, opts);
    },
    /** TDM frame cost with nine bots fighting (spectating or with the player shooting). */
    async tdmBench(opts: { seconds?: number; settle?: number; withPlayer?: boolean; ai?: 'arena' | 'tactical'; spotting?: boolean; size?: number } = {}) {
      return (await import('./TdmCheck')).tdmBench(game, opts);
    },
    /** 7.0: a whole TDM match stepped headless at a fixed 1/60 s (bot vs bot): length, movement, aggression, AI cost. */
    async tdmSim(opts: { ai?: 'arena' | 'tactical'; tickets?: number; maxSeconds?: number; dt?: number; roster?: 'ranged' | 'any'; laneLeave?: number; ads?: boolean; v12?: boolean; arms?: 'random' | 'pistol' | 'smg' | 'ar' | 'shotgun'; vantage?: boolean; pressure?: boolean; size?: number; profile?: boolean; forward?: boolean; directRise?: number; fog?: boolean } = {}) {
      return (await import('./TdmCheck')).tdmSim(game, opts);
    },
    /**
     * 13.0: the map-to-map teardown check: TDM through the result screen's next-map cards round
     * `maps` (default desert, docks, jungle), `laps` times; GPU, scene, DOM and heap per map, and
     * WeakRefs to everything each left level built (alive after a forced GC = leaked).
     */
    async mapCycle(opts: { maps?: SettingId[]; laps?: number; play?: number } = {}) {
      return (await import('./MapCycle')).mapCycle(game, opts);
    },
    /**
     * 20.0: camouflage contrast of the operators on the loaded TDM map: a match with `kit` (default the
     * map's), one OMEGA bot posed in fixed views at each distance, rendered with and without it.
     */
    async camo(opts: { kit?: 'night' | 'corporate'; distances?: number[]; setting?: SettingId } = {}) {
      const { TDM } = await import('../levels/Tdm');
      TDM.force.kit = opts.kit ?? null;
      try {
        dev.start('tdm', opts.setting ?? 'maglev');
        dev.god();
        // Past the opening (it owns the camera), the pointer "locked".
        const gi = game as unknown as { intro: { t: number } | null; skipIntro(): void };
        for (let i = 0; i < 300 && game.state === 'intro'; i++) {
          if (gi.intro && gi.intro.t >= 0.4) gi.skipIntro();
          await new Promise((r) => setTimeout(r, 16));
        }
        dev.lock();
        await new Promise((r) => setTimeout(r, 400));
        return (await import('./Camo')).camo(game, opts);
      } finally {
        TDM.force.kit = null;
      }
    },
    /**
     * 20.0: the sniper drill: a TDM match on the loaded map (5v5 unless `size`), the player a perfect
     * marksman at `at`; kills a minute, the share of bots it hit that got out of sight alive. `profile:
     * false` runs it without the map's AI profile.
     */
    async sniperDrill(opts: { seconds?: number; at?: [number, number, number]; size?: number; profile?: boolean; minRange?: number } = {}) {
      const { TDM } = await import('../levels/Tdm');
      const keep = { ...TDM.force };
      TDM.force.size = opts.size ?? null;
      TDM.force.noProfile = opts.profile === false;
      // The match must outlast the drill (the god-mode marksman never loses, OMEGA would run out).
      TDM.force.tickets = 999;
      try {
        dev.start('tdm', game.setting);
        dev.god();
        const gi = game as unknown as { intro: { t: number } | null; skipIntro(): void };
        for (let i = 0; i < 300 && game.state === 'intro'; i++) {
          if (gi.intro && gi.intro.t >= 0.4) gi.skipIntro();
          await new Promise((r) => setTimeout(r, 16));
        }
        return await (await import('./SniperDrill')).sniperDrill(game, opts);
      } finally {
        Object.assign(TDM.force, keep);
      }
    },
    /** 20.0: how much of a TDM map is in sight from far off (spawn side to spawn side, long pairs anywhere). */
    async sightlines(opts: { front?: number; minDist?: number; pairs?: number; band?: [number, number] } = {}) {
      return (await import('./Sightlines')).sightlines(game, opts);
    },
    /** 17.0: GPU memory (renderer.info) across Neon Block → Crash Site → menu → Docks, lap over lap. */
    async vramCycle(opts: { laps?: number; play?: number } = {}) {
      return (await import('./VramCycle')).vramCycle(game, opts);
    },
    /** 7.0: tdmSim for the arena AI and the 6.0 tactical AI, n runs each, side by side. */
    async tdmAB(opts: { runs?: number; tickets?: number } = {}) {
      return (await import('./TdmCheck')).tdmAB(game, opts);
    },
    /** 9.0: cycle every level and the title, checking the MusicManager for leaked sources. */
    async musicSoak(opts: { cycles?: number; dwell?: number } = {}) {
      return (await import('./MusicCheck')).musicSoak(game, opts);
    },
    /** TDM friendly-fire check on frozen bots: rounds, shots, blades, check-fire, rounds at the player. */
    async friendlyFire() {
      return (await import('./TdmCheck')).friendlyFire(game);
    },
    /** Render pipeline for comparisons (the F8 cycle): 'v4', 'raw' (no composer) or 'v37'. */
    pipeline(p?: 'v4' | 'raw' | 'v37') {
      if (p) game.setPipeline(p);
      return game.renderer.pipeline;
    },
    /** Frozen-frame contact sheet of the level's fixed views (× pipelines for an A/B). */
    async sheet(names?: string[], pipes?: ('v4' | 'raw' | 'v37')[]) {
      const c = await (await import('./Shots')).sheet(game, names, pipes);
      return [c.width, c.height];
    },
    async hideSheet() {
      (await import('./Shots')).hideSheet();
    },
    /** Linear HDR luminance percentiles per view (optionally of what `hide()` returns, by diff). */
    async hdr(names?: string[], hide?: () => THREE.Object3D[]) {
      return (await import('./Shots')).hdr(game, names, hide);
    },
    /** Frame rate, CPU and GPU milliseconds per frame, busy share (power proxy). */
    async perf(seconds = 4) {
      return (await import('./PerfProbe')).probe(game, seconds);
    },
    /** Headless pursuit scenarios (escape, hide, shots, re-detection). */
    async pursuit() {
      return (await import('./PursuitCheck')).checkPursuit(game);
    },
    /** Perception scenarios against the real map geometry. */
    async vision() {
      return (await import('./VisionCheck')).checkVision(game);
    },
    v: (x: number, y: number, z: number) => new THREE.Vector3(x, y, z),
    /** Collects `fn()` every `ms` into window.__log (for observations longer than one call). */
    record(fn: () => unknown, ms = 1000) {
      const w = window as unknown as { __log: unknown[]; __li: number };
      clearInterval(w.__li);
      w.__log = [];
      const t0 = performance.now();
      w.__li = window.setInterval(() => w.__log.push([Math.round((performance.now() - t0) / 100) / 10, fn()]), ms);
    },
    stop() {
      const w = window as unknown as { __log: unknown[]; __li: number };
      clearInterval(w.__li);
      return w.__log;
    },
  };
  (window as unknown as { __dev: typeof dev }).__dev = dev;
  bindPipelineKey(game);
}

/**
 * F8 cycles the render pipeline for side-by-side comparison: 4.0 → RAW (no composer) → 3.7 → 4.0,
 * with a short label. Capture phase: F8 never reaches the game's input (it would skip the opening).
 */
function bindPipelineKey(game: Game) {
  const label = document.createElement('div');
  label.style.cssText = 'position:fixed;left:16px;top:12px;z-index:50;font:600 12px monospace;letter-spacing:2px;color:#9ff;background:rgba(0,0,0,.55);padding:4px 8px;pointer-events:none;opacity:0;transition:opacity .4s';
  document.body.appendChild(label);
  let hide = 0;
  const names = { v4: 'PIPELINE 4.0 · COMPOSER', raw: 'PIPELINE RAW · NO COMPOSER', v37: 'PIPELINE 3.7 · LEGACY LOOK' } as const;
  const order = ['v4', 'raw', 'v37'] as const;
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.code !== 'F8') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      game.setPipeline(order[(order.indexOf(game.renderer.pipeline) + 1) % order.length]);
      label.textContent = names[game.renderer.pipeline];
      label.style.opacity = '1';
      clearTimeout(hide);
      hide = window.setTimeout(() => (label.style.opacity = '0'), 1600);
    },
    true,
  );
}
