import { describe, expect, it } from 'vitest';
import { InteractionController, type Interactable } from './Interaction';
import { Conversation } from '../story/Conversation';

const at = (x: number, z: number) => ({ x, y: 0, z });
const fwd = { x: 0, z: -1 };

/** A tiny mission model: Kenji's prompt is offered only in 'meet'; talking moves to 'talk'. */
function kenjiWorld() {
  const w = { step: 'meet' as 'meet' | 'talk', talks: 0, talk: new Conversation([[0, 'A'], [3.6, 'B']], 5) };
  const kenji: Interactable = {
    pos: at(0, -2),
    radius: 2.6,
    label: 'TALK TO KENJI',
    enabled: () => w.step === 'meet',
    action: () => {
      if (w.talk.start()) {
        w.talks++;
        w.step = 'talk';
      }
    },
  };
  return { w, kenji };
}

describe('interaction controller', () => {
  it('a single E press talks to Kenji, shows the first line at once and clears the prompt', () => {
    const { w, kenji } = kenjiWorld();
    const ic = new InteractionController();
    expect(ic.update([kenji], at(0, 0), fwd, false, false, 0.016)).toContain('TALK TO KENJI');
    const label = ic.update([kenji], at(0, 0), fwd, true, true, 0.016);
    expect(w.talks).toBe(1);
    expect(w.step).toBe('talk');
    expect(label).toBeNull();
    expect(w.talk.update(0.016).lines).toEqual(['A']);
  });

  it('holding or re-pressing E does not restart the conversation', () => {
    const { w, kenji } = kenjiWorld();
    const ic = new InteractionController();
    ic.update([kenji], at(0, 0), fwd, true, true, 0.016);
    for (let i = 0; i < 30; i++) ic.update([kenji], at(0, 0), fwd, i % 5 === 0, true, 0.016);
    expect(w.talks).toBe(1);
    const all: string[] = [];
    let done = false;
    for (let i = 0; i < 400 && !done; i++) {
      const r = w.talk.update(0.016);
      all.push(...r.lines);
      done = r.done;
    }
    expect(all).toEqual(['A', 'B']);
    expect(done).toBe(true);
  });

  it('out of reach or facing away: no prompt, no action', () => {
    const { w, kenji } = kenjiWorld();
    const ic = new InteractionController();
    expect(ic.update([kenji], at(0, 4), fwd, true, true, 0.016)).toBeNull();
    expect(ic.update([kenji], at(0, 0), { x: 0, z: 1 }, true, true, 0.016)).toBeNull();
    expect(w.talks).toBe(0);
  });

  it('hold interactables need the full hold, ignore taps, fire once', () => {
    let fired = 0;
    let on = true;
    const relay: Interactable = { pos: at(0, -1.5), radius: 2.4, label: 'RELAY', hold: 2, enabled: () => on, action: () => { fired++; on = false; } };
    const ic = new InteractionController();
    ic.update([relay], at(0, 0), fwd, true, false, 0.1);
    expect(fired).toBe(0);
    for (let i = 0; i < 15; i++) ic.update([relay], at(0, 0), fwd, false, true, 0.1);
    expect(fired).toBe(0);
    ic.update([relay], at(0, 0), fwd, false, false, 0.1); // let go: progress resets
    for (let i = 0; i < 19; i++) ic.update([relay], at(0, 0), fwd, false, true, 0.1);
    expect(fired).toBe(0);
    for (let i = 0; i < 30; i++) ic.update([relay], at(0, 0), fwd, false, true, 0.1);
    expect(fired).toBe(1);
  });

  it('picks the nearest of several and repeatable taps (the board) fire on each press', () => {
    let reads = 0;
    const board: Interactable = { pos: at(1, -2), radius: 3.2, label: 'READ', enabled: () => true, action: () => reads++ };
    const { kenji } = kenjiWorld();
    const ic = new InteractionController();
    expect(ic.update([board, kenji], at(0, -0.5), fwd, false, false, 0.016)).toContain('TALK TO KENJI');
    ic.update([board], at(0, 0), fwd, true, true, 0.016);
    ic.update([board], at(0, 0), fwd, false, true, 0.016);
    ic.update([board], at(0, 0), fwd, true, true, 0.016);
    expect(reads).toBe(2);
  });

  it('reset clears focus and hold progress (restart / checkpoint)', () => {
    const { w, kenji } = kenjiWorld();
    const ic = new InteractionController();
    ic.update([kenji], at(0, 0), fwd, false, false, 0.016);
    ic.reset();
    expect(ic.focus).toBeNull();
    w.talk.stop();
    w.step = 'meet';
    ic.update([kenji], at(0, 0), fwd, true, true, 0.016);
    expect(w.talks).toBe(1);
  });
});
