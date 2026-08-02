/* Mermaid flowchart importer.
   Parses the flowchart/graph dialect (nodes, all 14 shape syntaxes, links with
   labels, & fan-out, chained links, subgraphs) and lays the result out in
   ranks, producing a Flow Designer config. Other Mermaid diagram types
   (sequence, gantt, class, ...) have no node-edge equivalent here and are
   rejected with a clear message. */

const OTHER_DIAGRAMS =
  /^(sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|mindmap|timeline|quadrantChart|gitGraph|sankey|xychart)/i;

/* shape syntax, longest/most specific first */
const SHAPES = [
  [/^\(\(\((.+)\)\)\)$/, "circle2"],
  [/^\(\((.+)\)\)$/, "circle"],
  [/^\(\[(.+)\]\)$/, "stadium"],
  [/^\((.+)\)$/, "service"],          /* ( ) rounded == Component */
  [/^\[\[(.+)\]\]$/, "subroutine"],
  [/^\[\((.+)\)\]$/, "database"],     /* [( )] cylinder == Database */
  [/^\[\/(.+)\\\]$/, "trapezoid"],
  [/^\[\\(.+)\/\]$/, "trapezoid2"],
  [/^\[\/(.+)\/\]$/, "parallelogram"],
  [/^\[\\(.+)\\\]$/, "parallelogram2"],
  [/^\[(.+)\]$/, "rect"],
  [/^>(.+)\]$/, "flag"],
  [/^\{\{(.+)\}\}$/, "broker"],       /* {{ }} hexagon == Broker */
  [/^\{(.+)\}$/, "diamond"]
];

const SKIP = /^(classDef|class\s|style\s|linkStyle|click\s|accTitle|accDescr|direction\s)/;

function cleanLabel(raw) {
  let t = raw.trim();
  if (/^".*"$/.test(t)) t = t.slice(1, -1);
  t = t.replace(/<br\s*\/?>/gi, "\n").replace(/#quot;/g, '"').replace(/&quot;/g, '"');
  return t.trim();
}

function safeId(raw, used) {
  let id = String(raw).replace(/[^A-Za-z0-9_-]/g, "_").replace(/^[_-]+/, "");
  if (!id) id = "n";
  let out = id, i = 2;
  while (used.has(out)) out = `${id}_${i++}`;
  used.add(out);
  return out;
}

/* split one statement into node-groups and connectors */
const LINK_RE = /\s*(<)?(-{2,}\.*-*|={2,}|-\.{1,3}-)(>)?\s*(?:\|([^|]*)\|)?\s*/;

function normalizeInlineLabels(s) {
  return s
    .replace(/--\s+([^-|<>][^-|]*?)\s+-->/g, (_, t) => `-->|${t}|`)
    .replace(/--\s+([^-|<>][^-|]*?)\s+---/g, (_, t) => `---|${t}|`)
    .replace(/-\.\s+([^.|]*?)\s+\.->/g, (_, t) => `-.->|${t}|`)
    .replace(/==\s+([^=|]*?)\s+==>/g, (_, t) => `==>|${t}|`);
}

function parseNodeToken(token) {
  const m = token.match(/^([A-Za-z0-9_.:-]+)\s*(.*)$/s);
  if (!m) return null;
  const rawId = m[1];
  const rest = m[2].trim();
  if (!rest) return { rawId, label: null, type: null };
  for (const [re, type] of SHAPES) {
    const s = rest.match(re);
    if (s) return { rawId, label: cleanLabel(s[1]), type };
  }
  return { rawId, label: null, type: null, unparsed: rest };
}

export function parseMermaid(text) {
  const warnings = [];
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.replace(/%%.*$/, "").trim())
    .filter(Boolean);
  if (!lines.length) return { error: "No Mermaid code found." };
  if (OTHER_DIAGRAMS.test(lines[0]))
    return {
      error:
        `"${lines[0].split(/\s/)[0]}" is not a flowchart. Only Mermaid flowcharts ` +
        `(flowchart TD / graph LR / ...) can be represented as an interface diagram.`
    };

  let dir = "TD";
  let start = 0;
  const head = lines[0].match(/^(?:flowchart|graph)\s*(TD|TB|BT|LR|RL)?/i);
  if (head) {
    dir = (head[1] || "TD").toUpperCase();
    start = 1;
  } else {
    warnings.push('No "flowchart"/"graph" header found — assuming "flowchart TD".');
  }
  if (dir === "TB") dir = "TD";

  const nodes = new Map();  /* rawId -> {label, type, subgraph} */
  const edges = [];
  const subgraphs = [];     /* {rawId, title, parent} in stack order */
  const sgStack = [];

  const touch = (tok) => {
    const cur = nodes.get(tok.rawId);
    if (!cur) {
      nodes.set(tok.rawId, {
        label: tok.label ?? tok.rawId,
        type: tok.type ?? "rect",
        explicit: !!tok.type,
        subgraph: sgStack.length ? sgStack[sgStack.length - 1].rawId : null
      });
    } else if (tok.type && !cur.explicit) {
      cur.label = tok.label ?? cur.label;
      cur.type = tok.type;
      cur.explicit = true;
    }
    if (tok.unparsed) warnings.push(`Could not read the shape of "${tok.rawId}${tok.unparsed}" — using a rectangle.`);
  };

  for (let li = start; li < lines.length; li++) {
    const rawLine = lines[li];
    for (let stmt of rawLine.split(";")) {
      stmt = stmt.trim();
      if (!stmt) continue;

      const sg = stmt.match(/^subgraph\s+(.+)$/i);
      if (sg) {
        let rest = sg[1].trim();
        let rawId, title;
        const withBracket = rest.match(/^([A-Za-z0-9_.:-]+)\s*\[(.+)\]$/);
        if (withBracket) {
          rawId = withBracket[1];
          title = cleanLabel(withBracket[2]);
        } else {
          title = cleanLabel(rest);
          rawId = title.replace(/\s+/g, "_") || `sg${subgraphs.length + 1}`;
        }
        const rec = {
          rawId,
          title,
          parent: sgStack.length ? sgStack[sgStack.length - 1].rawId : null
        };
        subgraphs.push(rec);
        sgStack.push(rec);
        continue;
      }
      if (/^end$/i.test(stmt)) {
        if (sgStack.length) sgStack.pop();
        else warnings.push('Stray "end" ignored.');
        continue;
      }
      if (SKIP.test(stmt)) {
        warnings.push(`"${stmt.split(/\s/)[0]}" statements are not imported (styling/interaction only).`);
        continue;
      }

      const norm = normalizeInlineLabels(stmt);
      const parts = [];
      let rest = norm;
      while (true) {
        const m = rest.match(LINK_RE);
        if (!m || m.index === undefined || m.index === 0) break;
        parts.push({ seg: rest.slice(0, m.index) });
        parts.push({ link: { bidi: !!m[1], body: m[2], head: !!m[3], label: m[4] } });
        rest = rest.slice(m.index + m[0].length);
      }
      parts.push({ seg: rest });

      const groups = [];
      const links = [];
      for (const p of parts) {
        if (p.seg !== undefined) {
          const toks = p.seg
            .split("&")
            .map((t) => t.trim())
            .filter(Boolean)
            .map(parseNodeToken)
            .filter(Boolean);
          groups.push(toks);
          toks.forEach(touch);
        } else links.push(p.link);
      }

      if (groups.length === 1 && !links.length) continue; /* bare node defs */
      for (let i = 0; i < links.length; i++) {
        const from = groups[i] || [];
        const to = groups[i + 1] || [];
        if (!from.length || !to.length) {
          warnings.push(`A link in "${stmt}" is missing one of its ends — skipped.`);
          continue;
        }
        for (const a of from)
          for (const b of to)
            edges.push({
              source: a.rawId,
              target: b.rawId,
              label: links[i].label ? cleanLabel(links[i].label) : undefined,
              direction: links[i].bidi && links[i].head ? "both" : "one"
            });
      }
    }
  }
  if (sgStack.length) warnings.push(`${sgStack.length} subgraph(s) were never closed with "end".`);
  if (!nodes.size) return { error: "No nodes found in the flowchart." };

  return { model: { dir, nodes, edges, subgraphs }, warnings };
}

/* ---------------- layout ---------------- */

function nodeDims(label, type) {
  const longest = Math.max(...String(label).split("\n").map((l) => l.length), 4);
  let w = Math.min(260, Math.max(120, 30 + longest * 7.6));
  let h = 60;
  if (type === "diamond") { w = Math.max(w + 30, 150); h = 80; }
  if (type === "circle" || type === "circle2") { w = Math.max(w, 96); h = Math.max(84, Math.min(w, 120)); }
  if (type === "database") h = 92;
  return { w: Math.round(w), h: Math.round(h) };
}

export function mermaidToConfig(text) {
  const parsed = parseMermaid(text);
  if (parsed.error) return parsed;
  const { dir, nodes, edges, subgraphs } = parsed.model;
  const warnings = parsed.warnings;

  /* ranks: longest path from sources, cycle-safe via bounded relaxation */
  const rank = new Map([...nodes.keys()].map((k) => [k, 0]));
  for (let pass = 0; pass < nodes.size + 1; pass++) {
    let changed = false;
    for (const e of edges) {
      if (!rank.has(e.source) || !rank.has(e.target) || e.source === e.target) continue;
      const r = rank.get(e.source) + 1;
      if (r > rank.get(e.target) && r <= nodes.size) {
        rank.set(e.target, r);
        changed = true;
      }
    }
    if (!changed) break;
  }

  /* group by rank; keep subgraph members adjacent within a rank */
  const byRank = new Map();
  for (const [id, meta] of nodes) {
    const r = rank.get(id) || 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r).push({ id, ...meta, ...nodeDims(meta.label, meta.type) });
  }
  const sgOrder = new Map(subgraphs.map((s, i) => [s.rawId, i + 1]));
  for (const list of byRank.values())
    list.sort((a, b) => (sgOrder.get(a.subgraph) || 0) - (sgOrder.get(b.subgraph) || 0));

  const RANK_GAP = 90, ITEM_GAP = 60, ORIGIN = 60;
  const vertical = dir === "TD" || dir === "BT";
  const ranksSorted = [...byRank.keys()].sort((a, b) => a - b);
  if (dir === "BT" || dir === "RL") ranksSorted.reverse();

  const pos = new Map();
  let main = ORIGIN;
  const rankSpan = (list) =>
    list.reduce((t, n) => t + (vertical ? n.w : n.h), 0) + ITEM_GAP * (list.length - 1);
  const maxSpan = Math.max(...ranksSorted.map((r) => rankSpan(byRank.get(r))));

  for (const r of ranksSorted) {
    const list = byRank.get(r);
    const span = rankSpan(list);
    let cross = ORIGIN + (maxSpan - span) / 2;
    const thick = Math.max(...list.map((n) => (vertical ? n.h : n.w)));
    for (const n of list) {
      pos.set(n.id, vertical ? { x: cross, y: main } : { x: main, y: cross });
      cross += (vertical ? n.w : n.h) + ITEM_GAP;
    }
    main += thick + RANK_GAP;
  }

  /* build config with schema-safe unique ids */
  const used = new Set();
  const idMap = new Map();
  for (const rawId of nodes.keys()) idMap.set(rawId, safeId(rawId, used));

  const cfgNodes = [...nodes.entries()].map(([rawId, meta]) => {
    const p = pos.get(rawId);
    const dims = nodeDims(meta.label, meta.type);
    return {
      id: idMap.get(rawId),
      type: meta.type,
      label: meta.label,
      position: { x: Math.round(p.x), y: Math.round(p.y) },
      size: dims,
      ...(meta.subgraph ? { group: `sg_${meta.subgraph}` } : {})
    };
  });

  const sgUsed = new Set();
  const sgIdMap = new Map(subgraphs.map((s) => [s.rawId, safeId(`sg_${s.rawId}`, sgUsed)]));
  cfgNodes.forEach((n) => {
    if (n.group) n.group = sgIdMap.get(n.group.slice(3)) || undefined;
  });

  /* containers wrap their members (deepest first so parents include children) */
  const cfgGroups = [];
  const depthOf = (s) => {
    let d = 0, cur = s;
    while (cur.parent) { d++; cur = subgraphs.find((x) => x.rawId === cur.parent) || {}; if (d > 20) break; }
    return d;
  };
  for (const s of [...subgraphs].sort((a, b) => depthOf(b) - depthOf(a))) {
    const gid = sgIdMap.get(s.rawId);
    const memberNodes = cfgNodes.filter((n) => n.group === gid);
    const childBoxes = cfgGroups.filter((g) => g.group === gid);
    const xs = [], ys = [], xe = [], ye = [];
    memberNodes.forEach((n) => { xs.push(n.position.x); ys.push(n.position.y); xe.push(n.position.x + n.size.w); ye.push(n.position.y + n.size.h); });
    childBoxes.forEach((g) => { xs.push(g.position.x); ys.push(g.position.y); xe.push(g.position.x + g.size.w); ye.push(g.position.y + g.size.h); });
    if (!xs.length) { warnings.push(`Subgraph "${s.title}" has no members — skipped.`); continue; }
    const PAD = 28, TOP = 40;
    cfgGroups.push({
      id: gid,
      label: s.title,
      position: { x: Math.round(Math.min(...xs) - PAD), y: Math.round(Math.min(...ys) - TOP) },
      size: {
        w: Math.round(Math.max(...xe) - Math.min(...xs) + PAD * 2),
        h: Math.round(Math.max(...ye) - Math.min(...ys) + TOP + PAD)
      },
      ...(s.parent && sgIdMap.get(s.parent) ? { group: sgIdMap.get(s.parent) } : {})
    });
  }

  const sp = vertical ? (dir === "BT" ? "t" : "b") : dir === "RL" ? "l" : "r";
  const tp = vertical ? (dir === "BT" ? "b" : "t") : dir === "RL" ? "r" : "l";
  const cfgEdges = edges.map((e, i) => ({
    id: `e${i + 1}`,
    source: idMap.get(e.source),
    target: idMap.get(e.target),
    ...(e.label ? { label: e.label } : {}),
    sourcePort: sp,
    targetPort: tp,
    ...(e.direction === "both" ? { direction: "both" } : {})
  }));

  return {
    config: {
      meta: { title: "Imported from Mermaid", version: "1.0" },
      groups: cfgGroups,
      nodes: cfgNodes,
      edges: cfgEdges,
      /* the schema requires at least one highlight group; one covering the
         whole flow is a useful starting point the user can edit or replace */
      processes: [
        {
          id: "main-flow",
          name: "Main Flow",
          color: "#2563eb",
          nodes: cfgNodes.map((n) => n.id),
          edges: cfgEdges.map((e) => e.id)
        }
      ]
    },
    warnings
  };
}
