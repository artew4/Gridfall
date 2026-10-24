import * as THREE from 'three';

/*
  44.0, the warm-up: what the first minutes of a match used to pay for as hitches, paid behind the
  loading screen instead.

  WebGL does three kinds of work the first time something is drawn, not when it is built:
   - a texture is uploaded (and its mips made) the first time a material using it is drawn, so every
     new part of a map turned to for the first time stalled a frame;
   - `compile()` compiles only the programs of what is visible now: the bots, their name tags, the
     effect pools (empty and hidden at the start), and every shadow caster's depth program were left
     to the first frame that drew them (hitchprobe.mjs: 9-15 programs during the intro, more mid-match);
   - a geometry's buffers are uploaded the first time it is drawn.

  So: every texture of the scenes is uploaded, every program compiled (in parallel where the driver
  can, KHR_parallel_shader_compile), then the whole scene is drawn once into a small target with
  everything shown and nothing culled, shadows on: the depth programs and the buffers. Lights are never
  touched (their count is part of every program).
*/

/** Every texture `root`'s materials hold (their maps, and a shader's uniforms). */
export function texturesOf(root: THREE.Object3D, out = new Set<THREE.Texture>()) {
  const add = (v: unknown) => {
    if (v && (v as THREE.Texture).isTexture && !(v as THREE.Texture & { isRenderTargetTexture?: boolean }).isRenderTargetTexture) out.add(v as THREE.Texture);
  };
  const scan = (m: THREE.Material) => {
    for (const v of Object.values(m)) add(v);
    const u = (m as THREE.ShaderMaterial).uniforms;
    if (u) for (const k in u) add(u[k]?.value);
  };
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (Array.isArray(m)) m.forEach(scan);
    else if (m) scan(m);
  });
  if (root instanceof THREE.Scene) {
    add(root.background);
    add(root.environment);
  }
  return out;
}

/** Show everything under `root` and cull nothing (lights aside); returns the undo. */
export function exposeAll(root: THREE.Object3D) {
  const hidden: THREE.Object3D[] = [];
  const culled: THREE.Object3D[] = [];
  root.traverse((o) => {
    if ((o as THREE.Light).isLight) return;
    if (!o.visible) {
      hidden.push(o);
      o.visible = true;
    }
    if (o.frustumCulled) {
      culled.push(o);
      o.frustumCulled = false;
    }
  });
  return () => {
    for (const o of hidden) o.visible = false;
    for (const o of culled) o.frustumCulled = true;
  };
}

export interface WarmScene {
  scene: THREE.Scene;
  camera: THREE.Camera;
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * Warm `scenes` up (see the header), reporting progress 0..1 as it goes and yielding a frame between
 * chunks so the loading screen paints. The scenes' visibility is put back as it was.
 */
export async function warmUp(renderer: THREE.WebGLRenderer, scenes: readonly WarmScene[], onProgress: (f: number, what: 'textures' | 'shaders' | 'scene') => void, offscreen = true) {
  const stats = { textures: 0, programs0: renderer.info.programs?.length ?? 0, programs: 0, ms: 0 };
  const t0 = performance.now();
  const undo = scenes.map((s) => exposeAll(s.scene));
  try {
    // Textures, a few milliseconds of uploads between frames.
    const tex = new Set<THREE.Texture>();
    for (const s of scenes) texturesOf(s.scene, tex);
    const list = [...tex];
    let k = 0, slice = performance.now();
    for (const t of list) {
      // (A canvas or image not there yet would upload as nothing and again later: left to its first draw.)
      const img = t.image as { width?: number } | undefined;
      if (!(t as THREE.DataTexture).isDataTexture && !(t as THREE.CubeTexture).isCubeTexture && !(img && img.width)) continue;
      renderer.initTexture(t);
      stats.textures++;
      if (performance.now() - slice > 8) {
        onProgress((++k / list.length) * 0.4, 'textures');
        await frame();
        slice = performance.now();
      } else k++;
    }
    onProgress(0.4, 'textures');
    await frame();
    // Programs: compiled in parallel by the driver where it can, awaited without blocking. The composer
    // draws the scene into a target (no tone mapping, linear output: other programs than the canvas's),
    // so they are compiled with one bound (`offscreen`; the RAW pipeline draws to the canvas).
    const rt = new THREE.WebGLRenderTarget(64, 64, { type: THREE.HalfFloatType });
    const prevRt = renderer.getRenderTarget();
    const target = offscreen ? rt : null;
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      renderer.setRenderTarget(target);
      const done = renderer.compileAsync(s.scene, s.camera);
      renderer.setRenderTarget(prevRt);
      await done;
      onProgress(0.4 + (0.4 * (i + 1)) / scenes.length, 'shaders');
      await frame();
    }
    // One draw of everything with shadows: the depth programs, the buffers, whatever else waits for a draw.
    const shadows = renderer.shadowMap.enabled;
    for (let i = 0; i < scenes.length; i++) {
      renderer.setRenderTarget(target);
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scenes[i].scene, scenes[i].camera);
      renderer.setRenderTarget(prevRt);
      onProgress(0.8 + (0.2 * (i + 1)) / scenes.length, 'scene');
      await frame();
    }
    rt.dispose();
    // Levels with static shadows draw them again from the real view.
    if (shadows) renderer.shadowMap.needsUpdate = true;
  } finally {
    for (const u of undo) u();
  }
  stats.programs = (renderer.info.programs?.length ?? 0) - stats.programs0;
  stats.ms = Math.round(performance.now() - t0);
  onProgress(1, 'scene');
  return stats;
}
