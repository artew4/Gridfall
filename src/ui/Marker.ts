import * as THREE from 'three';

/**
 * Objective marker: a slim diamond that floats over the objective, always visible (no depth test),
 * shrinking with distance and fading out when you're on top of it. A HUD line carries the distance.
 */
export class Marker {
  sprite: THREE.Sprite;
  target: THREE.Vector3 | null = null;
  private mat: THREE.SpriteMaterial;

  constructor(scene: THREE.Scene) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.strokeStyle = '#ffd27a';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(32, 6);
    g.lineTo(54, 32);
    g.lineTo(32, 58);
    g.lineTo(10, 32);
    g.closePath();
    g.stroke();
    g.fillStyle = 'rgba(255,210,122,0.35)';
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, color: new THREE.Color(1.6, 1.4, 1.1) });
    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.renderOrder = 20;
    this.sprite.visible = false;
    scene.add(this.sprite);
  }

  set(p: THREE.Vector3 | null) {
    this.target = p ? p.clone() : null;
    this.sprite.visible = !!p;
  }

  /** Returns the distance to the target (or -1). */
  update(cam: THREE.Vector3, t: number) {
    if (!this.target) return -1;
    const d = cam.distanceTo(this.target);
    this.sprite.position.copy(this.target).setY(this.target.y + 2.4 + Math.sin(t * 2) * 0.08);
    const s = THREE.MathUtils.clamp(d * 0.035, 0.35, 2.2);
    this.sprite.scale.set(s, s, 1);
    this.mat.opacity = THREE.MathUtils.smoothstep(d, 2.5, 7) * 0.9;
    return d;
  }
}
