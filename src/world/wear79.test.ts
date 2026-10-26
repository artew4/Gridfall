import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ROLE_WEAR, applyWear, wearNoise, wearRoles } from './Wear';

/* 79.0: wear on the models' materials (Wear.ts). */

/** The standard material's shaders as three hands them to onBeforeCompile. */
function compile(mat: THREE.Material) {
  const sh = {
    uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
  mat.onBeforeCompile(sh, {} as THREE.WebGLRenderer);
  return sh;
}

describe('79.0: wear', () => {
  it('patches a standard material once: its shaders carry the wear, its cache key names it', () => {
    const m = new THREE.MeshStandardMaterial();
    applyWear(m, 'paint');
    applyWear(m, 'rust');
    const sh = compile(m);
    expect(sh.vertexShader).toContain('vWearP');
    expect(sh.vertexShader).toContain('USE_INSTANCING');
    expect(sh.fragmentShader).toContain('wearEdge');
    expect(sh.fragmentShader).toContain('roughnessFactor = mix(roughnessFactor, 0.9, rust)');
    expect(sh.fragmentShader).toContain('metalnessFactor = mix(metalnessFactor, 0.85');
    expect((sh.uniforms.uWear.value as THREE.Vector2).x).toBe(0);
    expect(m.customProgramCacheKey()).toContain('wearpaint');
    expect(m.customProgramCacheKey()).not.toContain('wearrust');
  });
  it('chains after a patch the material already had (the ground fog, the AO, worldUv)', () => {
    const m = new THREE.MeshStandardMaterial();
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = '// before\n' + sh.fragmentShader;
    };
    m.customProgramCacheKey = () => 'mine';
    applyWear(m, 'plaster');
    const sh = compile(m);
    expect(sh.fragmentShader.startsWith('// before')).toBe(true);
    expect(sh.fragmentShader).toContain('wearN');
    expect(m.customProgramCacheKey()).toBe('mine|wearplaster');
  });
  it('leaves glass, chrome, lights and other materials alone', () => {
    const basic = new THREE.MeshBasicMaterial();
    expect(applyWear(basic, 'paint')).toBe(basic);
    expect(basic.onBeforeCompile.toString()).not.toContain('wear');
    const mats = { glass: new THREE.MeshStandardMaterial(), chrome: new THREE.MeshStandardMaterial(), paint: new THREE.MeshStandardMaterial() };
    wearRoles(mats);
    expect(mats.glass.customProgramCacheKey()).not.toContain('wear');
    expect(mats.paint.customProgramCacheKey()).toContain('wearpaint');
    expect(ROLE_WEAR.glass).toBeUndefined();
  });
  it('the noise tiles (its edges meet) and spans its range', () => {
    const t = wearNoise();
    const d = t.image.data as Uint8Array, S = t.image.width;
    for (let c = 0; c < 4; c++) {
      let lo = 255, hi = 0, seam = 0;
      for (let y = 0; y < S; y++) {
        const a = d[(y * S) * 4 + c], b = d[(y * S + S - 1) * 4 + c];
        seam = Math.max(seam, Math.abs(a - b));
        for (let x = 0; x < S; x += 7) {
          const v = d[(y * S + x) * 4 + c];
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
      }
      expect(seam).toBeLessThan(40);
      expect(hi - lo).toBeGreaterThan(80);
    }
  });
});
