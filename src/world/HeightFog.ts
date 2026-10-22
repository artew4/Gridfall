import * as THREE from 'three';

/*
  25.0, ground fog: a layer of fog lying in the streets, on top of the scene's distance fog. No
  raymarching: three.js's fog chunks are patched (once, at import, before any material compiles) to
  carry each fragment's world position, and the fog it sits behind is integrated in closed form along
  the camera-to-fragment segment.

  34.0, the profile (was D·(1 − y/H)², gone by 4.5 m: a look from the roofs down crossed only its thin
  bottom, so the high ground saw into the street): dense up to `dense` (H₀), densest at the ground
  (× 1 + g), fading out linearly to nothing at `top` (H₁):

    density profile   ρ(y) = D·(1 + g·(1 − y/H₀))      0 ≤ y ≤ H₀
                             D·(H₁ − y)/(H₁ − H₀)       H₀ < y < H₁,   0 above, ρ(0) below the ground
    its antiderivative Φ(y) = D·((1+g)·y − g·y²/(2H₀))   (y ≤ H₀), then + D·(u − u²/(2(H₁ − H₀))), u = y − H₀
    along the segment  τ = L · (Φ(y₁) − Φ(y₀)) / (y₁ − y₀)  (the mean density over the heights it
                       crosses, × its length; ρ(y₀) when the segment is level)
    transmittance      T = exp(−τ²)   (τ squared: clear close by, a wall further out)
    fog                colour = mix(c', fogColour, (1 − T)·opacity), c' = c with its HDR excess × T

  A look along the street crosses ρ(1.5) the whole way; a look from the roofs (above H₁) down into the
  street crosses the whole depth of the layer at a slant; a look across the roofs crosses nothing.
  The HDR excess (a neon tube, a bot's glowing visor: colour over 1) is scaled by T too: a glow
  diffuses in the smog instead of shining through a fog that hides the body round it (the picture the
  bots' sight is held to: heightFogAt).

  The parameters are two uniforms every built-in material gets (`hFog`, `hFogColor`), shared by
  reference (plain objects: three clones Vector4s into each material, but not plain objects), so one
  `setHeightFog` reaches every material without recompiling. Density 0 (the default, every other map):
  the branch is skipped.
*/

/** x: density D (per m), y: the dense layer's top H₀ (m), z: the most it can hide (0..1), w: where it's gone H₁ (m). */
export const HFOG = { x: 0, y: 4.5, z: 0.96, w: 4.5 };
/** x: the ground's extra density g (ρ(0) = D·(1 + g)). */
export const HFOG_SHAPE = { x: 0, y: 0, z: 0 };
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
	uniform vec3 hFogShape;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
	float hFogRho( float y ) {
		float g = hFogShape.x, H0 = hFog.y, H1 = hFog.w;
		if ( y <= H0 ) return 1.0 + g * ( 1.0 - max( y, 0.0 ) / H0 );
		if ( y < H1 ) return ( H1 - y ) / ( H1 - H0 );
		return 0.0;
	}
	float hFogPhi( float y ) {
		float g = hFogShape.x, H0 = hFog.y, H1 = hFog.w;
		if ( y < 0.0 ) return ( 1.0 + g ) * y;
		if ( y <= H0 ) return ( 1.0 + g ) * y - g * y * y / ( 2.0 * H0 );
		float p0 = H0 * ( 1.0 + 0.5 * g );
		float u = min( y, H1 ) - H0;
		return p0 + u - u * u / ( 2.0 * ( H1 - H0 ) );
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
		float y0 = cameraPosition.y, y1 = vFogWorld.y;
		float dy = y1 - y0;
		float mean = abs( dy ) < 0.05 ? hFogRho( y0 ) : ( hFogPhi( y1 ) - hFogPhi( y0 ) ) / dy;
		float tau = hFog.x * length( vFogWorld - cameraPosition ) * mean;
		float T = exp( - tau * tau );
		gl_FragColor.rgb = mix( min( gl_FragColor.rgb, vec3( 1.0 ) ), gl_FragColor.rgb, T );
		gl_FragColor.rgb = mix( gl_FragColor.rgb, hFogColor, ( 1.0 - T ) * hFog.z );
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
    u.hFogShape = { value: HFOG_SHAPE };
  };
  // ShaderMaterials that merge UniformsLib.fog get them too (merging keeps plain objects by reference).
  add(THREE.UniformsLib.fog as unknown as Record<string, THREE.IUniform>);
  for (const s of Object.values(THREE.ShaderLib)) if ('fogDensity' in s.uniforms) add(s.uniforms as Record<string, THREE.IUniform>);
}
installHeightFog();

/** A ground fog's shape (34.0): D, H₀ (`dense`), H₁ (`top`), g (`ground`), its most (`opacity`), its colour. */
export interface GroundFog {
  density: number;
  dense: number;
  top: number;
  ground: number;
  opacity: number;
  color: number;
}

/** Ground fog on (see the header for the profile). */
export function setHeightFog(f: GroundFog) {
  const { density, dense, top, ground, opacity, color } = f;
  HFOG.x = density;
  HFOG.y = dense;
  HFOG.w = top;
  HFOG.z = opacity;
  HFOG_SHAPE.x = ground;
  const c = new THREE.Color(color);
  HFOG_COLOR.x = c.r;
  HFOG_COLOR.y = c.g;
  HFOG_COLOR.z = c.b;
}

export function clearHeightFog() {
  HFOG.x = 0;
}

/** The profile's density (per m of D) and its antiderivative, as in the shader. */
function rho(y: number, H0: number, H1: number, g: number) {
  if (y <= H0) return 1 + g * (1 - Math.max(y, 0) / H0);
  return y < H1 ? (H1 - y) / (H1 - H0) : 0;
}
function phi(y: number, H0: number, H1: number, g: number) {
  if (y < 0) return (1 + g) * y;
  if (y <= H0) return (1 + g) * y - (g * y * y) / (2 * H0);
  const u = Math.min(y, H1) - H0;
  return H0 * (1 + 0.5 * g) + u - (u * u) / (2 * (H1 - H0));
}

/**
 * The same fog on the CPU (the bots' sight, the tests, the DEV report): the share of a target at `to`
 * hidden from an eye at `from`, both world positions; the live fog unless a shape is given.
 */
export function heightFogAt(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, f: Pick<GroundFog, 'density' | 'dense' | 'top' | 'ground' | 'opacity'> = { density: HFOG.x, dense: HFOG.y, top: HFOG.w, ground: HFOG_SHAPE.x, opacity: HFOG.z }) {
  if (f.density <= 0) return 0;
  const dy = to.y - from.y;
  const mean = Math.abs(dy) < 0.05 ? rho(from.y, f.dense, f.top, f.ground) : (phi(to.y, f.dense, f.top, f.ground) - phi(from.y, f.dense, f.top, f.ground)) / dy;
  const tau = f.density * Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) * mean;
  return (1 - Math.exp(-tau * tau)) * f.opacity;
}
