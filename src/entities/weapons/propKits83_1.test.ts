import { describe, expect, it } from 'vitest';
// @ts-ignore: node's fs in the test runner (the app's tsconfig has no node types)
import { readFileSync, readdirSync } from 'node:fs';
import { readGlb } from './glbRead';

/* 83.1: every prop kit in public/models/props is loaded (83.0 shipped landmark.glb unregistered: its boxes stayed boxes). */

const src: string = readFileSync(new URL('./models.ts', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('const PROP_KITS'), src.indexOf('};', src.indexOf('const PROP_KITS')));
const registered = Object.fromEntries([...block.matchAll(/^\s+(\w+): \[([^\]]*)\]/gm)].map(([, k, list]) => [k, [...list.matchAll(/'(\w+)'/g)].map((m) => m[1])]));
const files = readdirSync(new URL('../../../public/models/props/', import.meta.url)).filter((f: string) => f.endsWith('.glb')).map((f: string) => f.slice(0, -4));

describe('83.1: the prop kits', () => {
  it('every kit file is registered, every registered kit has its file', () => {
    expect(Object.keys(registered).sort()).toEqual(files.sort());
  });
  it("each kit's registered nodes are the file's", () => {
    for (const k of files) expect(registered[k].slice().sort(), k).toEqual(Object.keys(readGlb(`props/${k}`).nodes).sort());
  });
  it('the overpass girder (106 of them) stays light', () => {
    expect(readGlb('props/landmark').nodes.girder.reduce((s, p) => s + p.tris.length, 0)).toBeLessThan(600);
  });
});
