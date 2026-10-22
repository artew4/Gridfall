import * as THREE from 'three';

/*
  25.0, ground fog: a layer of fog lying in the streets, thickest at the ground and gone by `top` m,
  on top of the scene's distance fog. No raymarching: three.js's fog chunks are patched (once, at
  import, before any material compiles) to carry each fragment's world position, and the fog it sits
  behind is integrated in closed form along the camera-to-fragment segment.

    density profile   ρ(y) = D · clamp(1 − y/H, 0, 1)²          (D at the ground, 0 from H up)
    its antiderivative F(y) = y − H/3 (y ≤ 0); −(H/3)(1 − y/H)³ (0 < y < H); 0 (y ≥ H)
    along the segment  τ = D · L · (F(y₁) − F(y₀)) / (y₁ − y₀)  (the mean density over the heights it
                       crosses, × its length; ρ(y₀) when the segment is level)
    fog                f = 1 − exp(−τ²) · …  (τ squared: clear close by, a wall further out, so a
                       figure 5 m away in the street reads and one at 15 m is gone)

  So a look along the street at eye height crosses ρ(1.6) the whole way; a look from the roofs down
  into it crosses only the bottom of the segment; a look across the roofs crosses nothing.

  The parameters are two uniforms every built-in material gets (`hFog`, `hFogColor`), shared by
  reference (plain objects: three clones Vector4s into each material, but not plain objects), so one
  `setHeightFog` reaches every material without recompiling. Density 0 (the default, every other map):
  the branch is skipped.
*/

/** x: density at the ground (per m), y: the top H (m), z: the most it can hide (0..1). */
export const HFOG = { x: 0, y: 4.5, z: 0.96, w: 0 };
/** The fog's own colour (linear RGB): lit by the street, lighter than the night sky. */
export const HFOG_COLOR = { x: 0.08, y: 0.07, z: 0.12 };

const PARS_V = /* glsl */ `
#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFogWorld;
#endif`;
const VERT = /* glsl */ `
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	// World position from the view-space one (the view matrix is a rotation and a translation).
	vFogWorld = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz );
#endif`;
const PARS_F = /* glsl */ `
#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vFogWorld;
	uniform vec4 hFog;
	uniform vec3 hFogColor;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
	float hFogF( float y, float H ) {
		if ( y <= 0.0 ) return y - H / 3.0;
		if ( y >= H ) return 0.0;
		float u = 1.0 - y / H;
		return - H / 3.0 * u * u * u;
	}
#endif`;
const FRAG = /* glsl */ `
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
	if ( hFog.x > 0.0 ) {
		float y0 = cameraPosition.y, y1 = vFogWorld.y, H = hFog.y;
		float dy = y1 - y0;
		float mean;
		if ( abs( dy ) < 0.05 ) { float u = clamp( 1.0 - y0 / H, 0.0, 1.0 ); mean = u * u; }
		else mean = ( hFogF( y1, H ) - hFogF( y0, H ) ) / dy;
		float tau = hFog.x * length( vFogWorld - cameraPosition ) * mean;
		gl_FragColor.rgb = mix( gl_FragColor.rgb, hFogColor, ( 1.0 - exp( - tau * tau ) ) * hFog.z );
	}
#endif`;

let installed = false;
/** Patch the fog chunks and give every built-in shader the two uniforms (idempotent). */
export function installHeightFog() {
  if (installed) return;
  installed = true;
  const C = THREE.ShaderChunk as unknown as Record<string, string>;
  C.fog_pars_vertex = PARS_V;
  C.fog_vertex = VERT;
  C.fog_pars_fragment = PARS_F;
  C.fog_fragment = FRAG;
  const add = (u: Record<string, THREE.IUniform>) => {
    u.hFog = { value: HFOG };
    u.hFogColor = { value: HFOG_COLOR };
  };
  // ShaderMaterials that merge UniformsLib.fog get them too (merging keeps plain objects by reference).
  add(THREE.UniformsLib.fog as unknown as Record<string, THREE.IUniform>);
  for (const s of Object.values(THREE.ShaderLib)) if ('fogDensity' in s.uniforms) add(s.uniforms as Record<string, THREE.IUniform>);
}
installHeightFog();

/** Ground fog on: `density` at the ground (per m), gone by `top` m, `color` (sRGB hex), `opacity` its most. */
export function setHeightFog(density: number, top: number, color: number, opacity = 0.96) {
  HFOG.x = density;
  HFOG.y = top;
  HFOG.z = opacity;
  const c = new THREE.Color(color);
  HFOG_COLOR.x = c.r;
  HFOG_COLOR.y = c.g;
  HFOG_COLOR.z = c.b;
}

export function clearHeightFog() {
  HFOG.x = 0;
}

/**
 * The same fog on the CPU (tests, the DEV report): the share of a target at `to` hidden from an eye at
 * `from`, both world positions.
 */
export function heightFogAt(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, density = HFOG.x, top = HFOG.y, opacity = HFOG.z) {
  if (density <= 0) return 0;
  const F = (y: number) => (y <= 0 ? y - top / 3 : y >= top ? 0 : -(top / 3) * (1 - y / top) ** 3);
  const dy = to.y - from.y;
  const mean = Math.abs(dy) < 0.05 ? Math.max(0, Math.min(1, 1 - from.y / top)) ** 2 : (F(to.y) - F(from.y)) / dy;
  const tau = density * Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) * mean;
  return (1 - Math.exp(-tau * tau)) * opacity;
}
