import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { gunThemeFor } from './weapons/theme';
import { OPERATOR_KITS, kitColours } from './enemies/operators';
import { DESERT_CAMO, DESERT_GEAR, DESERT_TAPE } from './desertCamo';

/* 81.0: the Desert's sand-khaki teams: one palette for the player's sleeves, the bots' cloth and gear. */

const hsl = (n: number) => new THREE.Color(n).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);

describe('81.0: the desert finish', () => {
  it('the Desert wears it; the other maps keep theirs', () => {
    expect(gunThemeFor('desert')).toBe('desert');
    expect(gunThemeFor('oldport')).toBe('military');
    expect(gunThemeFor('jungle')).toBe('military');
    expect(gunThemeFor('tokyo')).toBe('blaster');
    expect(gunThemeFor('maglev')).toBe('corporate');
  });
  it('both teams in sand: cloth and plates warm, mid-light, never black', () => {
    for (const team of ['alpha', 'omega'] as const) {
      const c = kitColours('desert', team);
      for (const k of ['cloth', 'armor', 'webbing'] as const) {
        const { h, l } = hsl(c[k]);
        expect(h * 360).toBeGreaterThan(20);
        expect(h * 360).toBeLessThan(70);
        expect(l).toBeGreaterThan(0.3);
      }
      for (const s of DESERT_CAMO[team].spots) expect(hsl(s).l).toBeGreaterThan(0.2);
    }
  });
  it('and told apart: ALPHA the greener, OMEGA the browner; their tape the HUD\'s blue and orange', () => {
    expect(hsl(DESERT_GEAR.alpha.armor).h).toBeGreaterThan(hsl(DESERT_GEAR.omega.armor).h + 0.03);
    expect(hsl(DESERT_GEAR.alpha.team).h).toBeGreaterThan(hsl(DESERT_GEAR.omega.team).h + 0.05);
    expect(DESERT_TAPE.alpha.b).toBeGreaterThan(DESERT_TAPE.alpha.r);
    expect(DESERT_TAPE.omega.r).toBeGreaterThan(DESERT_TAPE.omega.b);
  });
});

describe('81.0: the desert operators', () => {
  it('a rig in the desert kit: its cloth marked for the camo, its accents tape (not lit), its own program', () => {
    for (const team of ['alpha', 'omega'] as const) {
      const rig = OPERATOR_KITS.desert[team].buildGunner();
      let camo = 0, cloth = 0;
      rig.root.traverse((o) => {
        const m = o as THREE.Mesh;
        const a = m.isMesh ? m.geometry.getAttribute('camo') : null;
        if (!a) return;
        for (let i = 0; i < a.count; i++) {
          cloth += a.getX(i);
          camo++;
        }
      });
      expect(camo).toBeGreaterThan(0);
      expect(cloth).toBeGreaterThan(0);
      expect(cloth).toBeLessThan(camo);
      const g = rig.glowMat.color;
      expect(Math.max(g.r, g.g, g.b)).toBeLessThanOrEqual(1);
      const mat = rig.armorMat as THREE.MeshStandardMaterial;
      expect(mat.customProgramCacheKey()).toBe(`desertCloth-${team}`);
      const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
      mat.onBeforeCompile(sh, {} as THREE.WebGLRenderer);
      expect(sh.vertexShader).toContain('attribute float camo');
      expect(sh.fragmentShader).toContain('uCamo[2]');
    }
  });
  it('the night and corporate kits are as they were (no camo)', () => {
    const rig = OPERATOR_KITS.night.alpha.buildGunner();
    let any = false;
    rig.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.getAttribute('camo')) any = true;
    });
    expect(any).toBe(false);
  });
});
