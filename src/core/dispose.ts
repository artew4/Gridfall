import * as THREE from 'three';

/**
 * Frees the GPU side of everything in a scene graph: geometries, materials and every texture they
 * reference (maps and shader uniforms), plus the scene's background and environment. Shared
 * resources are freed once; three.js uploads a freed resource again if something still uses it.
 * Returns what was freed (for the level-switch leak check).
 */
export function disposeScene(root: THREE.Object3D, scene?: THREE.Scene) {
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  const texs = new Set<THREE.Texture>();
  const addTex = (v: unknown) => {
    if (v && (v as THREE.Texture).isTexture) texs.add(v as THREE.Texture);
    else if (Array.isArray(v)) for (const x of v) if (x && (x as THREE.Texture).isTexture) texs.add(x as THREE.Texture);
  };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) geos.add(m.geometry);
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (mat) for (const x of Array.isArray(mat) ? mat : [mat]) mats.add(x);
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
  for (const mat of mats) {
    for (const v of Object.values(mat)) addTex(v);
    const u = (mat as THREE.ShaderMaterial).uniforms;
    if (u) for (const k in u) addTex(u[k]?.value);
  }
  if (scene) {
    addTex(scene.background);
    addTex(scene.environment);
  }
  for (const g of geos) g.dispose();
  for (const m of mats) m.dispose();
  for (const t of texs) t.dispose();
  return { geometries: geos.size, materials: mats.size, textures: texs.size };
}
