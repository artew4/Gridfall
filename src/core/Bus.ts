/** Minimal typed event bus: systems announce facts (gunshot, sighting, report, train state) without knowing who listens. */
export class Bus<E extends Record<string, unknown>> {
  private map = new Map<keyof E, Set<(p: never) => void>>();

  on<K extends keyof E>(type: K, fn: (payload: E[K]) => void): () => void {
    let set = this.map.get(type);
    if (!set) this.map.set(type, (set = new Set()));
    set.add(fn as (p: never) => void);
    return () => set!.delete(fn as (p: never) => void);
  }

  emit<K extends keyof E>(type: K, payload: E[K]) {
    const set = this.map.get(type);
    if (!set) return;
    for (const fn of Array.from(set)) (fn as (p: E[K]) => void)(payload);
  }

  clear() {
    this.map.clear();
  }
}
