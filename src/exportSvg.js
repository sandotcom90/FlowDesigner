import { getSmoothStepPath, Position } from "@xyflow/react";
import { nodeSize } from "./nodes";
import { anchorOf, TYPE_LABEL, labelAnchor } from "./editor/ops";

const POS = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left };
const GRAY = "#5b6470";
const PAPER = "#f2f3ee";

/* SVG <text> never wraps, so labels are split into tspans here. Monospace
   glyphs are ~0.6em wide, which makes the fit predictable without measuring. */
function wrapLines(text, fontSize, maxWidth) {
  const raw = String(text ?? "").split(/\r?\n/);
  if (!maxWidth || maxWidth <= 0) return raw;
  const maxChars = Math.max(4, Math.floor(maxWidth / (fontSize * 0.6)));
  const out = [];
  raw.forEach((para) => {
    if (para.length <= maxChars) { out.push(para); return; }
    let line = "";
    para.split(/\s+/).filter(Boolean).forEach((word) => {
      while (word.length > maxChars) {
        if (line) { out.push(line); line = ""; }
        out.push(word.slice(0, maxChars - 1) + "\u2010");
        word = word.slice(maxChars - 1);
      }
      if (!line) line = word;
      else if ((line + " " + word).length <= maxChars) line += " " + word;
      else { out.push(line); line = word; }
    });
    if (line) out.push(line);
  });
  return out.length ? out : [""];
}

function tspans(lines, x, fontSize) {
  const lh = fontSize * 1.25;
  const start = -((lines.length - 1) / 2) * lh;
  return lines
    .map(
      (l, i) =>
        `<tspan x="${x}" dy="${i === 0 ? start.toFixed(1) : lh.toFixed(1)}">${esc(l)}</tspan>`
    )
    .join("");
}

function tooltipText(label, kindName, attrs) {
  const lines = [`${label} — ${kindName}`];
  Object.entries(attrs || {}).forEach(([k, v]) => lines.push(`${k}: ${v}`));
  return lines.join("\n");
}

const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function roundedPath(pts, r = 10) {
  if (pts.length < 3) {
    return `M ${pts[0].x},${pts[0].y} L ${pts[pts.length - 1].x},${pts[pts.length - 1].y}`;
  }
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
    const v1 = { x: p1.x - p0.x, y: p1.y - p0.y };
    const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
    const l1 = Math.hypot(v1.x, v1.y) || 1;
    const l2 = Math.hypot(v2.x, v2.y) || 1;
    const r1 = Math.min(r, l1 / 2);
    const r2 = Math.min(r, l2 / 2);
    const a = { x: p1.x - (v1.x / l1) * r1, y: p1.y - (v1.y / l1) * r1 };
    const b = { x: p1.x + (v2.x / l2) * r2, y: p1.y + (v2.y / l2) * r2 };
    d += ` L ${a.x},${a.y} Q ${p1.x},${p1.y} ${b.x},${b.y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x},${last.y}`;
  return d;
}

/* Shape geometry mirrors nodes.jsx exactly (local coordinates). */
function shapeMarkup(type, w, h) {
  switch (type) {
    case "ui":
      return `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="6" class="shape"/>
<line x1="1.5" y1="17" x2="${w - 1.5}" y2="17" class="stroke"/>
<circle cx="11" cy="9.5" r="2.4" class="dot"/><circle cx="19" cy="9.5" r="2.4" class="dot"/><circle cx="27" cy="9.5" r="2.4" class="dot"/>`;
    case "database": {
      const ry = 12;
      return `<path d="M 1.5 ${ry} V ${h - ry} A ${w / 2 - 1.5} ${ry} 0 0 0 ${w - 1.5} ${h - ry} V ${ry}" class="shape"/>
<ellipse cx="${w / 2}" cy="${ry}" rx="${w / 2 - 1.5}" ry="${ry - 1.5}" class="shape"/>`;
    }
    case "broker": {
      const c = 16;
      return `<polygon points="${c},1.5 ${w - c},1.5 ${w - 1.5},${h / 2} ${w - c},${h - 1.5} ${c},${h - 1.5} 1.5,${h / 2}" class="shape"/>`;
    }
    case "etl": {
      const n = 14;
      return `<polygon points="1.5,1.5 ${w - n},1.5 ${w - 1.5},${h / 2} ${w - n},${h - 1.5} 1.5,${h - 1.5} ${n},${h / 2}" class="shape"/>`;
    }
    case "auth":
      return `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="10" class="shape"/>
<path d="M 16 ${h / 2 - 9} l 7 -3.5 l 7 3.5 v 6 q 0 6.5 -7 9.5 q -7 -3 -7 -9.5 z" class="glyph"/>`;
    case "file": {
      const f = 16;
      return `<path d="M 1.5 1.5 H ${w - f} L ${w - 1.5} ${f} V ${h - 1.5} H 1.5 Z" class="shape"/>
<path d="M ${w - f} 1.5 V ${f} H ${w - 1.5}" class="stroke"/>`;
    }
    case "external":
      return `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="6" class="shape dashed"/>`;
    case "user":
      return `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="${(h - 3) / 2}" class="shape"/>
<circle cx="24" cy="${h / 2 - 7}" r="5.5" class="glyph"/>
<path d="M 14 ${h / 2 + 12} a 10 8 0 0 1 20 0" class="glyph"/>`;
    default: /* service */
      return `<rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="10" class="shape"/>`;
  }
}

function labelOffsets(type) {
  return {
    dx: type === "auth" ? 11 : type === "user" ? 13 : 0,
    dy: type === "ui" ? 8.5 : type === "database" ? 7 : 0
  };
}

/**
 * Build a standalone SVG of the diagram from the config.
 * proc: the currently highlighted process object, or null.
 * Returns { svg, width, height }.
 */
function membershipMaps(cfg) {
  const nodeP = {}, edgeP = {}, grpP = {};
  const add = (m, id, pid) => ((m[id] = m[id] || []).push(pid));
  cfg.processes.forEach((p) => {
    p.nodes.forEach((n) => add(nodeP, n, p.id));
    /* mirror the live view: with no explicit edge list, any link whose both
       ends are in the group counts as part of it */
    const list =
      p.edges ||
      cfg.edges
        .filter((e) => p.nodes.includes(e.source) && p.nodes.includes(e.target))
        .map((e) => e.id);
    list.forEach((e) => add(edgeP, e, p.id));
  });
  (cfg.groups || []).forEach((g) => {
    const tree = new Set([g.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const o of cfg.groups || [])
        if (o.group && tree.has(o.group) && !tree.has(o.id)) { tree.add(o.id); changed = true; }
    }
    cfg.processes.forEach((p) => {
      if (p.nodes.some((nid) => {
        const n = cfg.nodes.find((x) => x.id === nid);
        return n && n.group && tree.has(n.group);
      })) add(grpP, g.id, p.id);
    });
  });
  return { nodeP, edgeP, grpP };
}

const pcls = (m, id) => (m[id] || []).map((p) => ` p-${p}`).join("");

export function buildDiagramSvg(cfg, proc, opts = {}) {
  const inter = !!opts.interactive;
  if (inter) proc = null;
  const maps = inter ? membershipMaps(cfg) : null;
  const color = proc?.color || "#2563eb";
  let litNodes = null, litEdges = null;
  if (proc) {
    litNodes = new Set(proc.nodes);
    litEdges = new Set(
      proc.edges ||
        cfg.edges.filter((e) => litNodes.has(e.source) && litNodes.has(e.target)).map((e) => e.id)
    );
  }

  /* bounds over nodes, groups, waypoints */
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x, y) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  cfg.nodes.forEach((n) => {
    const { w, h } = nodeSize(n);
    grow(n.position.x, n.position.y);
    grow(n.position.x + w, n.position.y + h);
  });
  (cfg.groups || []).forEach((g) => {
    grow(g.position.x, g.position.y);
    grow(g.position.x + g.size.w, g.position.y + g.size.h);
    (g.points || []).forEach((p) => grow(g.position.x + p.x, g.position.y + p.y));
  });
  cfg.edges.forEach((e) => (e.waypoints || []).forEach((p) => grow(p.x, p.y)));
  const PAD = 50;
  minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD;
  const width = Math.ceil(maxX - minX);
  const height = Math.ceil(maxY - minY);

  /* arrow markers per color */
  const markers = new Map();
  const markerFor = (c) => {
    if (!markers.has(c)) markers.set(c, `arw${markers.size}`);
    return markers.get(c);
  };

  /* edges */
  const edgeParts = [];
  const edgeLabelParts = [];
  cfg.edges.forEach((e) => {
    const lit = litNodes ? litEdges.has(e.id) : false;
    const dim = litNodes && !lit;
    const stroke = lit ? color : GRAY;
    const sw = lit ? 2.6 : 1.6;
    const sp = e.sourcePort || "r", tp = e.targetPort || "l";
    const s = anchorOf(cfg, e.source, sp);
    const t = anchorOf(cfg, e.target, tp);
    let d, lx, ly;
    if (e.waypoints?.length) {
      const pts = [s, ...e.waypoints, t];
      d = roundedPath(pts);
      const a = pts[Math.floor(pts.length / 2) - 1];
      const b = pts[Math.ceil(pts.length / 2)];
      lx = (a.x + b.x) / 2; ly = (a.y + b.y) / 2;
    } else {
      [d, lx, ly] = getSmoothStepPath({
        sourceX: s.x, sourceY: s.y, sourcePosition: POS[sp[0]],
        targetX: t.x, targetY: t.y, targetPosition: POS[tp[0]],
        borderRadius: 10
      });
    }
    const both = e.direction === "both" ? ` marker-start="url(#${markerFor(stroke)})"` : "";
    const tt = tooltipText(e.label || `${e.source} \u2192 ${e.target}`, "connection", e.attrs);
    const gCls = inter
      ? ` class="el edge${pcls(maps.edgeP, e.id)}${e.direction === "both" ? " two" : ""}"`
      : dim ? ' class="dim"' : "";
    edgeParts.push(
      `<g${gCls}><title>${esc(tt)}</title><path class="vis" d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" marker-end="url(#${markerFor(stroke)})"${both}/><path d="${d}" fill="none" stroke="transparent" stroke-width="14"/></g>`
    );
    if (e.label) {
      lx += e.labelOffset?.x || 0;
      ly += e.labelOffset?.y || 0;
      edgeLabelParts.push(
        `<text x="${lx}" y="${ly}" class="elabel${inter ? ` el${pcls(maps.edgeP, e.id)}` : ""}" text-anchor="middle" dominant-baseline="central"${
          e.fontSize ? ` font-size="${e.fontSize}px"` : ""
        }${lit ? ` fill="${color}"` : ""}${dim ? ' opacity="0.14"' : ""}>${
          String(e.label).includes("\n")
            ? tspans(String(e.label).split(/\r?\n/), lx, e.fontSize || 10.5)
            : esc(e.label)
        }</text>`
      );
    }
  });

  /* groups: parents first so nested boxes draw on top */
  const gById = Object.fromEntries((cfg.groups || []).map((g) => [g.id, g]));
  const gDepth = (g) => {
    let d = 0, cur = g;
    const seen = new Set();
    while (cur.group && gById[cur.group] && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = gById[cur.group];
      d++;
      if (d > 50) break;
    }
    return d;
  };
  const inGroupTree = (gid) => {
    const set = new Set([gid]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const g of cfg.groups || []) {
        if (g.group && set.has(g.group) && !set.has(g.id)) { set.add(g.id); changed = true; }
      }
    }
    return set;
  };
  const groupParts = [...(cfg.groups || [])]
    .sort((a, b) => gDepth(a) - gDepth(b))
    .map((g) => {
      const tree = inGroupTree(g.id);
      const hasLit = litNodes
        ? cfg.nodes.some((n) => n.group && tree.has(n.group) && litNodes.has(n.id))
        : true;
      const tt = tooltipText(g.label, "container", g.attrs);
      const gCls = inter ? ` class="el grp${pcls(maps.grpP, g.id)}"` : !hasLit ? ' class="dim"' : "";
      return `<g${gCls}>
<title>${esc(tt)}</title>
${
        Array.isArray(g.points) && g.points.length >= 3
          ? `<polygon points="${g.points.map((p) => `${g.position.x + p.x},${g.position.y + p.y}`).join(" ")}" fill="rgba(255,255,255,0.35)" stroke="#9aa2ad" stroke-width="1.5" stroke-linejoin="round"/>`
          : `<rect x="${g.position.x}" y="${g.position.y}" width="${g.size.w}" height="${g.size.h}" rx="10" fill="rgba(255,255,255,0.35)" stroke="#9aa2ad" stroke-width="1.5"/>`
      }
${(() => {
        const a = labelAnchor(g);
        const gfs = g.fontSize || 10.5;
        const gw = a.center ? (a.width ? a.width - 10 : g.size.w - 16) : g.size.w - 24;
        const glines = wrapLines(g.label.toUpperCase(), gfs * 1.15, gw);
        return `<text x="${g.position.x + a.x}" y="${g.position.y + a.y}" class="glabel"${
          a.center ? ' text-anchor="middle" dominant-baseline="central"' : ""
        }${g.fontSize ? ` font-size="${g.fontSize}px"` : ""}>${
          glines.length > 1
            ? tspans(glines, g.position.x + a.x, gfs)
            : esc(g.label.toUpperCase())
        }</text>`;
      })()}
</g>`;
    });

  /* nodes */
  const nodeParts = cfg.nodes.map((n) => {
    const { w, h } = nodeSize(n);
    const lit = litNodes ? litNodes.has(n.id) : false;
    const dim = litNodes && !lit;
    const { dx, dy } = labelOffsets(n.type);
    const cls = lit ? "lit" : dim ? "dim" : "";
    const tt = tooltipText(n.label, TYPE_LABEL[n.type] || n.type, n.attrs);
    const nCls = inter ? `el node${pcls(maps.nodeP, n.id)}` : cls;
    return `<g transform="translate(${n.position.x},${n.position.y})"${nCls ? ` class="${nCls}"` : ""}${
      lit ? ' filter="url(#litshadow)"' : ""
    }>
<title>${esc(tt)}</title>
${shapeMarkup(n.type, w, h)}
<text x="${w / 2 + dx}" y="${h / 2 + dy}" class="nlabel" text-anchor="middle" dominant-baseline="central"${n.fontSize ? ` font-size="${n.fontSize}px"` : ""}>${tspans(
      wrapLines(n.label, n.fontSize || 12.5, w - 18 - Math.abs(dx) * 2),
      w / 2 + dx,
      n.fontSize || 12.5
    )}</text>
</g>`;
  });

  const procMarkers = inter
    ? Object.fromEntries(cfg.processes.map((p) => [p.id, markerFor(p.color || "#2563eb")]))
    : null;

  const markerDefs = [...markers.entries()]
    .map(
      ([c, id]) =>
        `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`
    )
    .join("\n");

  const title = esc(cfg.meta?.title || "Interface Diagram");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">
<title>${title}</title>
<style>
.shape{fill:#ffffff;stroke:#38404a;stroke-width:1.5}
.dashed{stroke-dasharray:6 4}
.stroke{stroke:#38404a;stroke-width:1.5;fill:none}
.dot{fill:#38404a}
.glyph{fill:none;stroke:#38404a;stroke-width:1.5}
.lit .shape,.lit .stroke,.lit .glyph{stroke:${color}}
.lit .shape{stroke-width:2.5}
.lit .dot{fill:${color}}
.dim{opacity:0.14}
text{font-family:ui-monospace,'Cascadia Mono','SF Mono',Consolas,'Liberation Mono',monospace}
.nlabel{font-size:12.5px;fill:#22272e}
.lit .nlabel{font-weight:600}
.elabel{font-size:10.5px;fill:${GRAY};paint-order:stroke;stroke:${PAPER};stroke-width:5px;stroke-linejoin:round}
.glabel{font-size:10.5px;fill:${GRAY};letter-spacing:1.4px}
</style>
<defs>
<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1.4" cy="1.4" r="1.4" fill="#c9cdc4"/></pattern>
<filter id="litshadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(20,26,34,0.28)"/></filter>
${markerDefs}
</defs>
<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${PAPER}"/>
<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="url(#dots)"/>
${groupParts.join("\n")}
${edgeParts.join("\n")}
${nodeParts.join("\n")}
${edgeLabelParts.join("\n")}
</svg>`;

  return { svg, width, height, procMarkers };
}


/**
 * Standalone, script-free HTML page of the diagram. Highlighting and zoom
 * work without any JavaScript: hidden radio inputs + CSS sibling selectors,
 * so it survives hosts that strip <script> (Confluence, SharePoint).
 */
export function buildStaticHtml(cfg, proc) {
  const { svg, width, height, procMarkers } = buildDiagramSvg(cfg, null, { interactive: true });

  const miniSvg = svg
    .replace(/<style>[\s\S]*?<\/style>/, "")
    .replace(/<defs>[\s\S]*?<\/defs>/, "")
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    /* only the root tag loses its fixed size — inner shapes keep theirs */
    .replace(/^<svg\b[^>]*>/, (tag) =>
      tag.replace(/ (width|height)="[^"]*"/g, "").replace("<svg", '<svg class="mini"')
    );
  const title = esc(cfg.meta?.title || "Interface Diagram");

  const ZOOM_STEPS = [50, 75, 100, 125, 150, 175, 200, 250, 300, 400];
  const ZOOMS = [
    ...ZOOM_STEPS.map((p) => [String(p), p === 100 ? "100%" : `${p}%`, p / 100]),
    ["fit", "fit", null]
  ];

  const radios =
    `<input type="radio" name="proc" id="r-none"${proc ? "" : " checked"}>` +
    cfg.processes
      .map((p) => `<input type="radio" name="proc" id="r-${p.id}"${proc && proc.id === p.id ? " checked" : ""}>`)
      .join("") +
    ZOOMS.map(([z]) => `<input type="radio" name="zoom" id="z-${z}"${z === "100" ? " checked" : ""}>`).join("");

  const groupChips =
    cfg.processes
      .map(
        (p) =>
          `<label class="lg" for="r-${p.id}" title="${esc(p.description || p.name)}"><i style="background:${p.color || "#2563eb"}"></i>${esc(p.name)}</label>`
      )
      .join("") + `<label class="lg all" for="r-none">show all</label>`;

  const zoomChips = ZOOMS.map(([z, name]) => `<label class="zg" for="z-${z}">${name}</label>`).join("");

  /* Anchor-based navigation: each minimap cell is a link to an invisible
     target sitting at that spot on the canvas. Following an in-page link
     scrolls the nearest scrollable ancestor — no script needed. */
  const COLS = 6, ROWS = 4;
  const cells = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) cells.push([r, c]);

  const jumpTargets = cells
    .map(
      ([r, c]) =>
        `<span class="jt" id="j${r}-${c}" style="left:${((c + 0.5) / COLS * 100).toFixed(2)}%;top:${((r + 0.5) / ROWS * 100).toFixed(2)}%"></span>`
    )
    .join("");

  const jumpGrid = cells
    .map(
      ([r, c]) =>
        `<a href="#j${r}-${c}" title="Jump here" style="left:${(c / COLS * 100).toFixed(2)}%;top:${(r / ROWS * 100).toFixed(2)}%;width:${(100 / COLS).toFixed(2)}%;height:${(100 / ROWS).toFixed(2)}%"></a>`
    )
    .join("");

  const procRules = cfg.processes
    .map((p) => {
      const c = p.color || "#2563eb";
      const m = procMarkers[p.id];
      const S = `#r-${p.id}:checked ~ .wrap svg`;
      return `
${S} .el:not(.p-${p.id}){opacity:.12;filter:grayscale(.85)}
${S} g.node.p-${p.id} .shape,${S} g.node.p-${p.id} .stroke,${S} g.node.p-${p.id} .glyph{stroke:${c}}
${S} g.node.p-${p.id} .shape{stroke-width:2.5}
${S} g.node.p-${p.id} .dot{fill:${c}}
${S} g.node.p-${p.id} .nlabel{font-weight:600;fill:${c}}
${S} g.node.p-${p.id}{filter:url(#litshadow)}
${S} g.edge.p-${p.id} path.vis{stroke:${c};stroke-width:2.6;marker-end:url(#${m})}
${S} g.edge.p-${p.id}.two path.vis{marker-start:url(#${m})}
${S} text.elabel.p-${p.id}{fill:${c};font-weight:600}
${S} g.grp.p-${p.id} polygon,${S} g.grp.p-${p.id} rect{stroke:${c}}
#r-${p.id}:checked ~ .wrap aside label[for=r-${p.id}]{font-weight:bold;border-color:${c};background:#fff;box-shadow:inset 3px 0 0 ${c}}`;
    })
    .join("\n");

  const zoomRules = ZOOMS.filter(([, , f]) => f)
    .map(
      ([z, , f]) =>
        `#z-${z}:checked ~ .wrap .cv > svg{width:${Math.round(width * f)}px;max-width:none}
#z-${z}:checked ~ .wrap aside label[for=z-${z}]{font-weight:bold;background:#fff;border-color:currentColor}`
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:Consolas,'Cascadia Mono',monospace;background:#e9eae5;color:#22272e;height:100vh;display:flex;flex-direction:column}
input[name=proc],input[name=zoom]{position:absolute;opacity:0;pointer-events:none}
header{padding:12px 20px;border-bottom:2px solid #38404a;background:#fafaf7;flex:0 0 auto}
h1{font-size:16px;margin:0;letter-spacing:.02em}
.wrap{flex:1 1 auto;display:flex;min-height:0}
main{flex:1 1 auto;overflow:auto;padding:20px}
.cv{position:relative;display:inline-block;line-height:0}
.cv > svg{width:${Math.round(width)}px;max-width:none;height:auto;box-shadow:0 2px 10px rgba(0,0,0,.15);border-radius:8px;background:#f2f3ee;display:block}
.jt{position:absolute;width:1px;height:1px;scroll-margin:45vh 45vw}
.cv svg .el{transition:opacity .18s ease}
aside{flex:0 0 216px;overflow-y:auto;border-left:2px solid #38404a;background:#fafaf7;padding:14px}
aside .sec{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#5b6470;margin:0 0 8px}
aside .sec+.sec{margin-top:18px}
.groups,.zooms{display:flex;flex-direction:column;gap:6px;margin-bottom:18px}
.lg,.zg{display:flex;align-items:center;cursor:pointer;padding:6px 10px;border:1.5px solid #c9cdc4;border-radius:8px;font-size:12px;user-select:none}
.lg:hover,.zg:hover{background:#fff}
.lg i{display:inline-block;flex:0 0 10px;width:10px;height:10px;border-radius:3px;margin-right:8px}
.lg.all{color:#5b6470}
#r-none:checked ~ .wrap aside label.all{font-weight:bold;background:#fff;border-color:currentColor}
#z-fit:checked ~ .wrap aside label[for=z-fit]{font-weight:bold;background:#fff;border-color:currentColor}
footer{padding:8px 20px;font-size:11px;color:#5b6470;border-top:1px solid #c9cdc4;background:#fafaf7;flex:0 0 auto}
.wrap{position:relative}
.minimap{
  position:absolute;right:232px;bottom:16px;width:190px;
  border:1.5px solid #38404a;border-radius:6px;background:#f2f3ee;
  box-shadow:0 3px 12px rgba(0,0,0,.2);overflow:hidden;z-index:20;
}
.minimap svg{width:100%;height:auto;display:block;box-shadow:none;border-radius:0}
.minimap text{display:none}
.minimap .el{transition:none}
.mm-grid{position:absolute;inset:0}
.mm-grid a{position:absolute;display:block;border-radius:2px}
.mm-grid a:hover{background:rgba(37,99,235,.22);box-shadow:inset 0 0 0 1.5px #2563eb}
.zooms{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:18px}
.zg{flex:1 1 44px;justify-content:center;padding:5px 4px;font-size:11px;text-align:center}
${procRules}
${zoomRules}
</style>
</head>
<body>
${radios}
<header><h1>${title}</h1></header>
<div class="wrap">
<main id="canvas"><div class="cv">${svg}${jumpTargets}</div></main>
<div class="minimap" title="Overview \u2014 click any area to jump there">${miniSvg}<div class="mm-grid">${jumpGrid}</div></div>
<aside>
<p class="sec">Groups</p>
<div class="groups">${groupChips}</div>
<p class="sec">Zoom</p>
<div class="zooms">${zoomChips}</div>
</aside>
</div>
<footer>rev ${esc(cfg.meta?.version || "\u2014")} \u00b7 ${cfg.nodes.length} nodes \u00b7 ${cfg.edges.length} links \u00b7 click a group to highlight its path \u00b7 shown at actual size \u00b7 pick a zoom level, scroll to pan \u00b7 hover any element for details \u00b7 click the overview map to jump</footer>
</body>
</html>
`;
}
