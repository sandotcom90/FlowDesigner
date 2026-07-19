import { getSmoothStepPath, Position } from "@xyflow/react";
import { nodeSize } from "./nodes";
import { anchorOf } from "./editor/ops";

const POS = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left };
const GRAY = "#5b6470";
const PAPER = "#f2f3ee";

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
export function buildDiagramSvg(cfg, proc) {
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
        sourceX: s.x, sourceY: s.y, sourcePosition: POS[sp],
        targetX: t.x, targetY: t.y, targetPosition: POS[tp],
        borderRadius: 10
      });
    }
    const both = e.direction === "both" ? ` marker-start="url(#${markerFor(stroke)})"` : "";
    edgeParts.push(
      `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" marker-end="url(#${markerFor(stroke)})"${both}${dim ? ' class="dim"' : ""}/>`
    );
    if (e.label) {
      edgeLabelParts.push(
        `<text x="${lx}" y="${ly}" class="elabel" text-anchor="middle" dominant-baseline="central"${
          lit ? ` fill="${color}"` : ""
        }${dim ? ' opacity="0.14"' : ""}>${esc(e.label)}</text>`
      );
    }
  });

  /* groups */
  const groupParts = (cfg.groups || []).map((g) => {
    const hasLit = litNodes ? cfg.nodes.some((n) => n.group === g.id && litNodes.has(n.id)) : true;
    return `<g${!hasLit ? ' class="dim"' : ""}>
<rect x="${g.position.x}" y="${g.position.y}" width="${g.size.w}" height="${g.size.h}" rx="10" fill="rgba(255,255,255,0.35)" stroke="#9aa2ad" stroke-width="1.5"/>
<text x="${g.position.x + 12}" y="${g.position.y + 14}" class="glabel">${esc(g.label.toUpperCase())}</text>
</g>`;
  });

  /* nodes */
  const nodeParts = cfg.nodes.map((n) => {
    const { w, h } = nodeSize(n);
    const lit = litNodes ? litNodes.has(n.id) : false;
    const dim = litNodes && !lit;
    const { dx, dy } = labelOffsets(n.type);
    const cls = lit ? "lit" : dim ? "dim" : "";
    return `<g transform="translate(${n.position.x},${n.position.y})"${cls ? ` class="${cls}"` : ""}${
      lit ? ' filter="url(#litshadow)"' : ""
    }>
${shapeMarkup(n.type, w, h)}
<text x="${w / 2 + dx}" y="${h / 2 + dy}" class="nlabel" text-anchor="middle" dominant-baseline="central">${esc(n.label)}</text>
</g>`;
  });

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

  return { svg, width, height };
}
