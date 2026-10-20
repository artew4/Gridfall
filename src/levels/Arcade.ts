import type { Game } from '../core/Game';
import type { ModeRules } from './Level';

/**
 * Arcade Survival on any level: designed waves, then endless escalation, from the level's spawn
 * points, perches and cover. Nothing here knows which setting is loaded.
 */
export class ArcadeRules implements ModeRules {
  constructor(private game: Game) {}

  begin() {
    const g = this.game;
    const st = g.level.data.start;
    g.level.enterArcade?.();
    g.player.reset(st.x, st.z, st.yaw, st.y ?? 0);
    g.safety.reset(g.player.pos);
    g.weapon.raiseTarget = 1;
    g.weapon.setHolstered(false, true);
    g.ctx.enemies = g.waves.enemies;
    g.storyHud.show(false);
    g.waves.startNext();
  }

  update(dt: number) {
    const g = this.game;
    g.ctx.difficulty = g.waves.difficulty;
    g.waves.update(dt, g.ctx);
  }

  onKill() {
    this.game.waves.kills++;
  }

  musicIntensity(): number {
    const g = this.game;
    if (g.waves.state !== 'fighting') return 0.15;
    const hp = g.player.health / g.player.maxHealth;
    const alive = g.waves.enemies.filter((e) => e.alive).length;
    return Math.min(1, 0.72 + alive * 0.03 + (hp < 0.3 ? 0.1 : 0));
  }

  reset() {}

  toTitle() {}

  death() {
    return { story: false, kills: this.game.waves.kills };
  }
}
