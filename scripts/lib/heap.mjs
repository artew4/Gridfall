/*
  Heap-snapshot analysis for the DEV memory checks: objects tagged in the page with instances of
  uniquely named classes (`new ({[name]: class{}})[name]()`, stored on a `__tag` property) are found
  by name; for each one still alive, the shortest strong retainer path from the GC root is returned.
*/
export function aliveTags(snap, namePattern) {
  const m = snap.snapshot.meta;
  const NF = m.node_fields.length, EF = m.edge_fields.length;
  const nT = m.node_fields.indexOf('type'), nN = m.node_fields.indexOf('name'), nE = m.node_fields.indexOf('edge_count');
  const eT = m.edge_fields.indexOf('type'), eN = m.edge_fields.indexOf('name_or_index'), eTo = m.edge_fields.indexOf('to_node');
  const { nodes, edges, strings } = snap;
  const N = nodes.length / NF;
  const retainers = Array.from({ length: N }, () => []);
  for (let i = 0, e = 0; i < N; i++) {
    for (let k = 0; k < nodes[i * NF + nE]; k++, e += EF) {
      const type = m.edge_types[0][edges[e + eT]];
      if (type === 'weak') continue;
      const name = type === 'element' || type === 'hidden' ? `[${edges[e + eN]}]` : strings[edges[e + eN]];
      retainers[edges[e + eTo] / NF].push([i, `${type}:${name}`]);
    }
  }
  const label = (i) => `${m.node_types[0][nodes[i * NF + nT]]}:${strings[nodes[i * NF + nN]]}`;
  const alive = [];
  for (let i = 0; i < N; i++) {
    const name = strings[nodes[i * NF + nN]];
    if (m.node_types[0][nodes[i * NF + nT]] !== 'object' || !namePattern.test(name)) continue;
    const owner = retainers[i].find(([, e]) => e.endsWith(':__tag'));
    if (!owner) continue;
    const prev = new Map([[owner[0], null]]);
    const q = [owner[0]];
    while (q.length) {
      const x = q.shift();
      if (x === 0) break;
      for (const [r, e] of retainers[x]) if (!prev.has(r)) { prev.set(r, [x, e]); q.push(r); }
    }
    const path = [];
    for (let x = 0; prev.get(x); x = prev.get(x)[0]) path.push(`${label(x)} -${prev.get(x)[1]}->`);
    alive.push({ tag: name, path: path.slice(-12) });
  }
  return alive;
}
