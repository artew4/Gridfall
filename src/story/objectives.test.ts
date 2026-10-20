import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { KENJI, PLATFORM, STREET_BOARD, objectiveFor, type Step } from './Objectives';
import { floorBand } from '../stealth/PlayerIntel';

const ctx = { escapeTime: '01:30', relay: new THREE.Vector3(45.6, 8.5, 3.6) };
const steps: Step[] = ['meet', 'talk', 'ambush', 'board', 'relay', 'manhunt', 'train', 'done'];

describe('objectives', () => {
  it('every playable step has a title, a one-line instruction and a reason', () => {
    for (const s of steps.slice(0, -1)) {
      const o = objectiveFor(s, ctx)!;
      expect(o.title.length, s).toBeGreaterThan(5);
      expect(o.title, s).toBe(o.title.toUpperCase());
      expect(o.text.length, s).toBeGreaterThan(10);
      expect(o.why.length, s).toBeGreaterThan(10);
    }
    expect(objectiveFor('done', ctx)).toBeNull();
  });

  it('destinations sit on the right level', () => {
    expect(objectiveFor('meet', ctx)!.target).toEqual(KENJI);
    expect(objectiveFor('board', ctx)!.target).toEqual(STREET_BOARD);
    expect(floorBand(objectiveFor('relay', ctx)!.target!.y)).toBe('roof');
    expect(floorBand(objectiveFor('manhunt', ctx)!.target!.y)).toBe('under');
    expect(objectiveFor('train', ctx)!.target).toEqual(PLATFORM);
    expect(objectiveFor('ambush', ctx)!.target).toBeNull();
  });

  it('steps the player can get stuck on have hints, and train times are in the text', () => {
    for (const s of ['meet', 'ambush', 'board', 'relay', 'manhunt', 'train'] as Step[]) expect(objectiveFor(s, ctx)!.hints.length, s).toBeGreaterThan(0);
    expect(objectiveFor('manhunt', ctx)!.text).toContain('01:30');
    expect(objectiveFor('train', ctx)!.text).toContain('01:30');
  });

  it('the relay objective says why it matters and how to do it', () => {
    const o = objectiveFor('relay', ctx)!;
    expect(o.text).toMatch(/Hold E/);
    expect(o.why).toMatch(/lockdown/i);
  });
});
