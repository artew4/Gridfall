import * as THREE from 'three';
import { mulberry32 } from '../../core/math';

/*
  Favelas' surfaces (40.0): canvases drawn once at load (0 external assets), and a material patch that
  maps a texture by world position instead of the mesh's UVs, so one unit box scaled into a house of
  any size (an InstancedMesh) keeps its plaster and its bricks at their real size.
*/

function canvas(S: number) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  return { c, g: c.getContext('2d')! };
}
function tex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Sun-bleached render over block: near white (the house's paint is its instance colour), patches, rain streaks, a dado of grime. */
export function plasterTexture() {
  const S = 512;
  const { c, g } = canvas(S);
  const rnd = mulberry32(2207);
  g.fillStyle = '#f4f1ea';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 160; i++) {
    const r = 8 + rnd() * 50;
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grd.addColorStop(0, rnd() < 0.5 ? 'rgba(150,130,110,0.06)' : 'rgba(255,255,250,0.14)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.translate(rnd() * S, rnd() * S);
    g.fillStyle = grd;
    g.fillRect(-r, -r, 2 * r, 2 * r);
    g.restore();
  }
  // Streaks down from the roofline (v runs up the wall: the top of the canvas is the top of a 4 m tile).
  for (let i = 0; i < 40; i++) {
    const x = rnd() * S, w = 2 + rnd() * 9;
    const grd = g.createLinearGradient(0, 0, 0, S * 0.6);
    grd.addColorStop(0, 'rgba(90,75,60,0.18)');
    grd.addColorStop(1, 'rgba(90,75,60,0)');
    g.fillStyle = grd;
    g.fillRect(x, 0, w, S * (0.15 + rnd() * 0.45));
  }
  // A band of grime at the foot, chipped render showing the block underneath.
  const foot = g.createLinearGradient(0, S * 0.8, 0, S);
  foot.addColorStop(0, 'rgba(110,95,80,0)');
  foot.addColorStop(1, 'rgba(110,95,80,0.28)');
  g.fillStyle = foot;
  g.fillRect(0, S * 0.8, S, S * 0.2);
  // (A few, faint: at full strength they read as camouflage blotches.)
  for (let i = 0; i < 5; i++) {
    g.fillStyle = `rgba(${170 + rnd() * 40},${140 + rnd() * 30},${115 + rnd() * 20},0.22)`;
    const x = rnd() * S, y = S * (0.6 + rnd() * 0.35);
    g.beginPath();
    g.ellipse(x, y, 5 + rnd() * 14, 3 + rnd() * 7, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c);
}

/** Hollow terracotta block, the unfinished house: courses of orange blocks, grey mortar, a few chipped. */
export function blockTexture() {
  const S = 512;
  const { c, g } = canvas(S);
  const rnd = mulberry32(4511);
  g.fillStyle = '#9b9488';
  g.fillRect(0, 0, S, S);
  const rows = 16, cols = 8, h = S / rows, w = S / cols;
  for (let r = 0; r < rows; r++) {
    for (let k = -1; k < cols; k++) {
      const x = k * w + (r % 2 ? w / 2 : 0);
      const tone = 0.85 + rnd() * 0.3;
      g.fillStyle = `rgb(${Math.round(176 * tone)},${Math.round(92 * tone)},${Math.round(58 * tone)})`;
      g.fillRect(x + 2, r * h + 2, w - 4, h - 4);
      // The block's hollows, showing on the broken ones.
      if (rnd() < 0.06) {
        g.fillStyle = 'rgba(60,35,25,0.8)';
        g.fillRect(x + w * 0.2, r * h + h * 0.3, w * 0.6, h * 0.4);
      }
    }
  }
  return tex(c);
}

/** Cast concrete for the roofs (lajes) and the terraces: grey, trowel marks, stains, rebar rust spots. */
export function lajeTexture() {
  const S = 512;
  const { c, g } = canvas(S);
  const rnd = mulberry32(733);
  g.fillStyle = '#a9a49b';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(80,75,70,0.06)' : 'rgba(255,250,240,0.06)';
    g.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 12, 1 + rnd() * 3);
  }
  for (let i = 0; i < 20; i++) {
    const r = 10 + rnd() * 40;
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grd.addColorStop(0, rnd() < 0.3 ? 'rgba(140,80,40,0.18)' : 'rgba(60,55,50,0.14)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.translate(rnd() * S, rnd() * S);
    g.fillStyle = grd;
    g.fillRect(-r, -r, 2 * r, 2 * r);
    g.restore();
  }
  g.strokeStyle = 'rgba(70,65,60,0.25)';
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    let x = rnd() * S, y = rnd() * S;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) g.lineTo((x += (rnd() - 0.5) * 60), (y += (rnd() - 0.5) * 60));
    g.stroke();
  }
  return tex(c);
}

/** Corrugated zinc sheet, sun-faded with rust: the tin roofs and awnings. */
export function zincTexture() {
  const S = 256;
  const { c, g } = canvas(S);
  const rnd = mulberry32(1188);
  for (let x = 0; x < S; x++) {
    const k = 0.5 + 0.5 * Math.sin((x / S) * Math.PI * 2 * 16);
    const v = Math.round(130 + k * 70);
    g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
    g.fillRect(x, 0, 1, S);
  }
  for (let i = 0; i < 30; i++) {
    const r = 6 + rnd() * 30;
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grd.addColorStop(0, 'rgba(150,70,30,0.45)');
    grd.addColorStop(1, 'rgba(150,70,30,0)');
    g.save();
    g.translate(rnd() * S, rnd() * S);
    g.fillStyle = grd;
    g.fillRect(-r, -r, 2 * r, 2 * r);
    g.restore();
  }
  return tex(c);
}

/** Packed earth and dust on the cliff over the crest: ochre, rocks, tufts of green. */
export function earthTexture() {
  const S = 512;
  const { c, g } = canvas(S);
  const rnd = mulberry32(377);
  g.fillStyle = '#9a7552';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) {
    const t = rnd();
    g.fillStyle = t < 0.15 ? 'rgba(70,95,50,0.5)' : t < 0.5 ? 'rgba(120,90,60,0.35)' : 'rgba(180,150,110,0.25)';
    const r = 1 + rnd() * (t < 0.15 ? 9 : 5);
    g.beginPath();
    g.arc(rnd() * S, rnd() * S, r, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c);
}

/**
 * Maps `mat`'s texture by world position (the face's dominant axis: tops by xz, walls by xy or zy),
 * `tile` metres a repeat; works on InstancedMesh (the instance's matrix is applied). Returns `mat`.
 */
export function worldUv<T extends THREE.MeshStandardMaterial>(mat: T, tile: number): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTileInv = { value: 1 / tile };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTileInv;').replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      #ifdef USE_MAP
        vec4 wpU = vec4(position, 1.0);
        vec3 wnU = normal;
        #ifdef USE_INSTANCING
          wpU = instanceMatrix * wpU;
          wnU = mat3(instanceMatrix) * wnU;
        #endif
        wpU = modelMatrix * wpU;
        wnU = abs(normalize(mat3(modelMatrix) * wnU));
        vec2 wuv = wnU.y > 0.5 ? wpU.xz : (wnU.x > wnU.z ? wpU.zy : wpU.xy);
        vMapUv = wuv * uTileInv;
      #endif`,
    );
  };
  mat.customProgramCacheKey = () => `worldUv${tile}`;
  return mat;
}
