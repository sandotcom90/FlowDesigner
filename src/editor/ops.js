import { nodeSize } from "../nodes";

export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export const TYPE_LABEL = {
  ui: "UI", service: "Component", database: "Database", broker: "Broker",
  etl: "Process/Service", auth: "Auth", file: "File", external: "External", user: "User"
};
export const NODE_TYPES = Object.keys(TYPE_LABEL);

export function allIds(cfg) {
  return {
    nodes: new Set(cfg.nodes.map((n) => n.id)),
    edges: new Set(cfg.edges.map((e) => e.id)),
    groups: new Set((cfg.groups || []).map((g) => g.id)),
    processes: new Set(cfg.processes.map((p) => p.id))
  };
}

export function nextId(prefix, existing) {
  let i = 1;
  while (existing.has(`${prefix}-${i}`)) i++;
  return `${prefix}-${i}`;
}

export function slugId(name, existing) {
  let base = (name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!base || !/^[a-z0-9]/.test(base)) base = "process";
  let id = base, i = 2;
  while (existing.has(id)) id = `${base}-${i++}`;
  return id;
}

/* ---- add ---------------------------------------------------------------- */

/* Port codes are a side letter plus an optional position percentage:
   "r" = centre, "r25" = a quarter down the right edge, "t80", etc.
   Legacy codes "t1"/"t3" (from the fixed 3-per-side layout) mean 25% / 75%. */
export function portFraction(port) {
  if (!port || port.length < 2) return 0.5;
  const rest = port.slice(1);
  if (rest === "1") return 0.25;
  if (rest === "3") return 0.75;
  const pct = Number(rest);
  if (!isFinite(pct)) return 0.5;
  return Math.min(0.98, Math.max(0.02, pct / 100));
}

export const PORT_SIDES = ["t", "r", "b", "l"];
export const SIDE_NAME = { t: "top", r: "right", b: "bottom", l: "left" };
export const DEFAULT_PORTS = 3;
export const MAX_PORTS = 9;

export function portCount(node) {
  const n = Number(node?.ports);
  return Number.isInteger(n) && n >= 1 && n <= MAX_PORTS ? n : DEFAULT_PORTS;
}

/* n evenly spaced points per side; the middle one keeps the bare side code */
export function portCodesForSide(side, n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const pct = Math.round((i / (n + 1)) * 100);
    out.push({ code: pct === 50 ? side : `${side}${pct}`, pct });
  }
  return out;
}

export function portsOfNode(node) {
  const n = portCount(node);
  return PORT_SIDES.flatMap((side) =>
    portCodesForSide(side, n).map((p) => ({ ...p, side }))
  );
}

/* Every port a component must expose: the evenly spaced set it is configured
   for, plus any port an existing edge already lands on. Without the second
   half, raising or lowering the count would orphan those edges. */
export function portsForNode(cfg, node) {
  if (!node) return [];
  const base = portsOfNode(node);
  const seen = new Set(base.map((p) => p.code));
  const extra = [];
  const add = (code) => {
    if (!code || seen.has(code)) return;
    const side = code[0];
    if (!PORT_SIDES.includes(side)) return;
    seen.add(code);
    extra.push({ code, side, pct: Math.round(portFraction(code) * 100), kept: true });
  };
  (cfg?.edges || []).forEach((e) => {
    if (e.source === node.id) add(e.sourcePort || "r");
    if (e.target === node.id) add(e.targetPort || "l");
  });
  return [...base, ...extra];
}

export function isPoly(g) {
  return Array.isArray(g.points) && g.points.length >= 3;
}

/* point inside container: polygon (ray cast) or rectangle */
export function insideContainer(g, pos) {
  const inBox =
    pos.x >= g.position.x && pos.x <= g.position.x + g.size.w &&
    pos.y >= g.position.y && pos.y <= g.position.y + g.size.h;
  if (!isPoly(g)) return inBox;
  if (!inBox) return false;
  const px = pos.x - g.position.x, py = pos.y - g.position.y;
  let hit = false;
  const pts = g.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x)
      hit = !hit;
  }
  return hit;
}

function groupAt(cfg, pos, excludeId) {
  /* innermost (smallest bounding box) container containing the point */
  let best = null, bestArea = Infinity;
  for (const g of cfg.groups || []) {
    if (g.id === excludeId) continue;
    if (insideContainer(g, pos)) {
      const area = g.size.w * g.size.h;
      if (area < bestArea) { bestArea = area; best = g.id; }
    }
  }
  return best;
}

export function descendantGroups(cfg, gid) {
  const out = [];
  const stack = [gid];
  while (stack.length) {
    const cur = stack.pop();
    for (const g of cfg.groups || []) {
      if (g.group === cur && !out.includes(g.id)) { out.push(g.id); stack.push(g.id); }
    }
  }
  return out;
}

export function addNode(cfg, type, pos) {
  const next = structuredClone(cfg);
  const id = nextId(type, allIds(next).nodes);
  const node = {
    id, type,
    label: `New ${TYPE_LABEL[type]}`,
    position: { x: Math.round(pos.x), y: Math.round(pos.y) }
  };
  const g = groupAt(next, pos);
  if (g) node.group = g;
  next.nodes.push(node);
  return { cfg: next, id };
}

export function addGroup(cfg, pos) {
  const next = structuredClone(cfg);
  next.groups = next.groups || [];
  const id = nextId("grp", allIds(next).groups);
  const g = {
    id, label: "New Group",
    position: { x: Math.round(pos.x), y: Math.round(pos.y) },
    size: { w: 340, h: 190 }
  };
  const parent = groupAt(next, pos);
  if (parent) g.group = parent;
  next.groups.push(g);
  return { cfg: next, id };
}

export function addEdge(cfg, { source, target, sourcePort, targetPort }) {
  if (source === target) return { cfg, id: null };
  const next = structuredClone(cfg);
  const id = nextId("edge", allIds(next).edges);
  const e = { id, source, target };
  if (sourcePort) e.sourcePort = sourcePort;
  if (targetPort) e.targetPort = targetPort;
  next.edges.push(e);
  return { cfg: next, id };
}

/* ---- delete (with impact summary) --------------------------------------- */

export function deleteNode(cfg, id) {
  const next = structuredClone(cfg);
  const removedEdges = next.edges.filter((e) => e.source === id || e.target === id).map((e) => e.id);
  next.edges = next.edges.filter((e) => !removedEdges.includes(e.id));
  next.nodes = next.nodes.filter((n) => n.id !== id);
  const emptied = [];
  next.processes = next.processes
    .map((p) => ({
      ...p,
      nodes: p.nodes.filter((x) => x !== id),
      ...(p.edges ? { edges: p.edges.filter((x) => !removedEdges.includes(x)) } : {})
    }))
    .filter((p) => {
      if (p.nodes.length === 0) { emptied.push(p.name); return false; }
      return true;
    });
  const summary = [];
  if (removedEdges.length) summary.push(`${removedEdges.length} connected edge(s) will also be deleted`);
  if (emptied.length) summary.push(`group(s) left empty and removed: ${emptied.join(", ")}`);
  return { cfg: next, summary };
}

export function deleteEdge(cfg, id) {
  const next = structuredClone(cfg);
  next.edges = next.edges.filter((e) => e.id !== id);
  next.processes = next.processes.map((p) =>
    p.edges ? { ...p, edges: p.edges.filter((x) => x !== id) } : p
  );
  return { cfg: next, summary: [] };
}

export function deleteGroup(cfg, id) {
  const next = structuredClone(cfg);
  next.groups = (next.groups || []).filter((g) => g.id !== id);
  let freed = 0, freedGroups = 0;
  next.nodes.forEach((n) => {
    if (n.group === id) { delete n.group; freed++; }
  });
  next.groups.forEach((g) => {
    if (g.group === id) { delete g.group; freedGroups++; }
  });
  const summary = [];
  if (freed) summary.push(`${freed} member node(s) will be released from the container (kept on canvas)`);
  if (freedGroups) summary.push(`${freedGroups} child container(s) will be un-nested (kept on canvas)`);
  return { cfg: next, summary };
}

export function deleteMany(cfg, sel) {
  const nodeSet = new Set(sel.nodes || []);
  const edgeSet = new Set(sel.edges || []);
  const groupSet = new Set(sel.groups || []);
  const next = structuredClone(cfg);
  const removedEdges = next.edges
    .filter((e) => edgeSet.has(e.id) || nodeSet.has(e.source) || nodeSet.has(e.target))
    .map((e) => e.id);
  const removedEdgeSet = new Set(removedEdges);
  next.edges = next.edges.filter((e) => !removedEdgeSet.has(e.id));
  next.nodes = next.nodes.filter((n) => !nodeSet.has(n.id));
  let freed = 0;
  if (groupSet.size) {
    next.groups = (next.groups || []).filter((g) => !groupSet.has(g.id));
    next.nodes.forEach((n) => {
      if (n.group && groupSet.has(n.group)) { delete n.group; freed++; }
    });
    next.groups.forEach((g) => {
      if (g.group && groupSet.has(g.group)) delete g.group;
    });
  }
  const emptied = [];
  next.processes = next.processes
    .map((p) => ({
      ...p,
      nodes: p.nodes.filter((x) => !nodeSet.has(x)),
      ...(p.edges ? { edges: p.edges.filter((x) => !removedEdgeSet.has(x)) } : {})
    }))
    .filter((p) => {
      if (p.nodes.length === 0) { emptied.push(p.name); return false; }
      return true;
    });
  const summary = [];
  const cascaded = removedEdges.filter((id) => !edgeSet.has(id)).length;
  if (cascaded) summary.push(`${cascaded} connected edge(s) will also be deleted`);
  if (freed) summary.push(`${freed} member node(s) will be released from the container (kept on canvas)`);
  if (emptied.length) summary.push(`group(s) left empty and removed: ${emptied.join(", ")}`);
  return { cfg: next, summary };
}

export function applyNodeResize(cfg, nodeId, p) {
  const next = structuredClone(cfg);
  const n = next.nodes.find((x) => x.id === nodeId);
  if (!n) return cfg;
  const base = n.group
    ? (next.groups || []).find((g) => g.id === n.group)?.position || { x: 0, y: 0 }
    : { x: 0, y: 0 };
  n.size = { w: Math.round(p.width), h: Math.round(p.height) };
  n.position = { x: Math.round(base.x + p.x), y: Math.round(base.y + p.y) };
  return next;
}

export function applyGroupResize(cfg, groupId, p) {
  const next = structuredClone(cfg);
  const g = (next.groups || []).find((x) => x.id === groupId);
  if (!g) return cfg;
  const base = g.group
    ? (next.groups || []).find((x) => x.id === g.group)?.position || { x: 0, y: 0 }
    : { x: 0, y: 0 };
  g.size = { w: Math.round(p.width), h: Math.round(p.height) };
  g.position = { x: Math.round(base.x + p.x), y: Math.round(base.y + p.y) };
  return next;
}

export function setFontSizes(cfg, ids, size) {
  const next = structuredClone(cfg);
  const apply = (list, set) =>
    list.forEach((el) => {
      if (set.has(el.id)) {
        if (size === null || size === undefined) delete el.fontSize;
        else el.fontSize = size;
      }
    });
  apply(next.nodes, new Set(ids.nodes || []));
  apply(next.edges, new Set(ids.edges || []));
  apply(next.groups || [], new Set(ids.groups || []));
  return next;
}

export function deleteProcess(cfg, id) {
  const next = structuredClone(cfg);
  next.processes = next.processes.filter((p) => p.id !== id);
  return { cfg: next, summary: [] };
}

/* ---- rename with referential updates ------------------------------------ */

export function renameId(cfg, kind, oldId, newId) {
  if (oldId === newId) return { cfg };
  if (!ID_PATTERN.test(newId))
    return { cfg, error: "Ids use letters, digits, _ or -, starting with a letter or digit." };
  const ids = allIds(cfg);
  const pool = { node: ids.nodes, edge: ids.edges, group: ids.groups, process: ids.processes }[kind];
  if (pool.has(newId)) return { cfg, error: `A ${kind} with id "${newId}" already exists.` };

  const next = structuredClone(cfg);
  if (kind === "node") {
    next.nodes.find((n) => n.id === oldId).id = newId;
    next.edges.forEach((e) => {
      if (e.source === oldId) e.source = newId;
      if (e.target === oldId) e.target = newId;
    });
    next.processes.forEach((p) => {
      p.nodes = p.nodes.map((x) => (x === oldId ? newId : x));
    });
  } else if (kind === "edge") {
    next.edges.find((e) => e.id === oldId).id = newId;
    next.processes.forEach((p) => {
      if (p.edges) p.edges = p.edges.map((x) => (x === oldId ? newId : x));
    });
  } else if (kind === "group") {
    next.groups.find((g) => g.id === oldId).id = newId;
    next.nodes.forEach((n) => {
      if (n.group === oldId) n.group = newId;
    });
    next.groups.forEach((g) => {
      if (g.group === oldId) g.group = newId;
    });
  } else if (kind === "process") {
    next.processes.find((p) => p.id === oldId).id = newId;
  }
  return { cfg: next };
}

/* ---- updates ------------------------------------------------------------- */

export function updateElement(cfg, kind, id, patch) {
  const next = structuredClone(cfg);
  const list = kind === "node" ? next.nodes : kind === "edge" ? next.edges : next.groups;
  const el = list.find((x) => x.id === id);
  if (!el) return cfg;
  Object.entries(patch).forEach(([k, v]) => {
    if (v === undefined || v === null) delete el[k];
    else el[k] = v;
  });
  return next;
}

export function coerceAttr(v) {
  const t = v.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return v;
}

/* ---- waypoints ----------------------------------------------------------- */

export function anchorOf(cfg, nodeId, port) {
  const n = cfg.nodes.find((x) => x.id === nodeId);
  if (!n) return { x: 0, y: 0 };
  const { w, h } = nodeSize(n);
  const { x, y } = n.position;
  const side = port ? port[0] : "r";
  const f = portFraction(port);
  switch (side) {
    case "t": return { x: x + w * f, y };
    case "b": return { x: x + w * f, y: y + h };
    case "l": return { x, y: y + h * f };
    default: return { x: x + w, y: y + h * f };
  }
}

/* After a drag, nest an element under the innermost container beneath its
   center (excluding itself and, for containers, its own descendants). */
export function reparentByPosition(cfg, kind, id) {
  const next = structuredClone(cfg);
  const el =
    kind === "group"
      ? (next.groups || []).find((g) => g.id === id)
      : next.nodes.find((n) => n.id === id);
  if (!el) return cfg;
  const size = kind === "group" ? el.size : nodeSize(el);
  const center = { x: el.position.x + size.w / 2, y: el.position.y + size.h / 2 };
  const banned = new Set(kind === "group" ? [id, ...descendantGroups(next, id)] : []);
  let best = null, bestArea = Infinity;
  for (const g of next.groups || []) {
    if (banned.has(g.id)) continue;
    if (insideContainer(g, center)) {
      const area = g.size.w * g.size.h;
      if (area < bestArea) { bestArea = area; best = g.id; }
    }
  }
  if ((el.group || null) === best) return cfg;
  if (best) el.group = best;
  else delete el.group;
  return next;
}

export function edgePoints(cfg, e) {
  return [
    anchorOf(cfg, e.source, e.sourcePort || "r"),
    ...(e.waypoints || []),
    anchorOf(cfg, e.target, e.targetPort || "l")
  ];
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function insertWaypoint(cfg, edgeId, p) {
  const next = structuredClone(cfg);
  const e = next.edges.find((x) => x.id === edgeId);
  if (!e) return cfg;
  const pts = edgePoints(next, e);
  let best = 0, bestD = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegment(p, pts[i], pts[i + 1]);
    if (d < bestD) { bestD = d; best = i; }
  }
  e.waypoints = e.waypoints || [];
  e.waypoints.splice(best, 0, { x: Math.round(p.x), y: Math.round(p.y) });
  return next;
}

export function insertWaypointAt(cfg, edgeId, index, p) {
  const next = structuredClone(cfg);
  const e = next.edges.find((x) => x.id === edgeId);
  if (!e) return cfg;
  e.waypoints = e.waypoints || [];
  const i = Math.max(0, Math.min(index, e.waypoints.length));
  e.waypoints.splice(i, 0, { x: Math.round(p.x), y: Math.round(p.y) });
  return next;
}

export function reverseEdge(cfg, edgeId) {
  const next = structuredClone(cfg);
  const e = next.edges.find((x) => x.id === edgeId);
  if (!e) return cfg;
  const s = e.source, sp = e.sourcePort, tp = e.targetPort;
  e.source = e.target;
  e.target = s;
  if (tp) e.sourcePort = tp; else delete e.sourcePort;
  if (sp) e.targetPort = sp; else delete e.targetPort;
  if (e.waypoints) e.waypoints.reverse();
  return next;
}

export function moveWaypoint(cfg, edgeId, index, p) {
  const next = structuredClone(cfg);
  const e = next.edges.find((x) => x.id === edgeId);
  if (!e || !e.waypoints?.[index]) return cfg;
  e.waypoints[index] = { x: Math.round(p.x), y: Math.round(p.y) };
  return next;
}

export function removeWaypoint(cfg, edgeId, index) {
  const next = structuredClone(cfg);
  const e = next.edges.find((x) => x.id === edgeId);
  if (!e || !e.waypoints) return cfg;
  e.waypoints.splice(index, 1);
  if (e.waypoints.length === 0) delete e.waypoints;
  return next;
}


/* Re-anchor a polygon container so its points' bbox starts at (0,0);
   absolute geometry (and members, which are absolute) are unaffected. */
function normalizePoly(g) {
  const minX = Math.min(...g.points.map((p) => p.x));
  const minY = Math.min(...g.points.map((p) => p.y));
  g.position = { x: g.position.x + minX, y: g.position.y + minY };
  g.points = g.points.map((p) => ({ x: Math.round(p.x - minX), y: Math.round(p.y - minY) }));
  g.size = {
    w: Math.max(120, Math.max(...g.points.map((p) => p.x))),
    h: Math.max(80, Math.max(...g.points.map((p) => p.y)))
  };
}




/* Where a container's label should sit.
   Rectangles keep the top-left header slot. Drawn loops get an anchor on the
   widest interior span near the top of the outline, so the text always lands
   inside the shape (an L-shape's bbox corner is outside it). */
export function labelAnchor(g) {
  if (g.labelPos) return { x: g.labelPos.x, y: g.labelPos.y, center: true, width: 0 };
  if (!isPoly(g)) return { x: 12, y: 14, center: false };
  const pts = g.points;
  const maxY = Math.max(...pts.map((p) => p.y));
  const h = maxY || 1;

  const widestSpanAt = (y) => {
    const xs = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if (a.y > y !== b.y > y) xs.push(((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x);
    }
    xs.sort((p, q) => p - q);
    let best = null;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const w = xs[k + 1] - xs[k];
      if (!best || w > best.w) best = { x: (xs[k] + xs[k + 1]) / 2, w };
    }
    return best;
  };

  for (const frac of [0.08, 0.15, 0.25, 0.4, 0.5, 0.65]) {
    const y = Math.max(9, h * frac);
    if (y >= maxY) break;
    const s = widestSpanAt(y);
    if (s && s.w >= 30)
      return { x: Math.round(s.x), y: Math.round(y), center: true, width: Math.round(s.w) };
  }
  const cx = pts.reduce((t, p) => t + p.x, 0) / pts.length;
  const cy = pts.reduce((t, p) => t + p.y, 0) / pts.length;
  return { x: Math.round(cx), y: Math.round(cy), center: true, width: 0 };
}

/* Move a container's label; the point is relative to the container origin
   and is clamped to its bounding box. Pass null to restore the default slot. */
export function setLabelPos(cfg, gid, pt) {
  const next = structuredClone(cfg);
  const g = (next.groups || []).find((x) => x.id === gid);
  if (!g) return cfg;
  if (!pt) delete g.labelPos;
  else
    g.labelPos = {
      x: Math.round(Math.max(0, Math.min(g.size.w, pt.x))),
      y: Math.round(Math.max(0, Math.min(g.size.h, pt.y)))
    };
  return next;
}

/* Create a container from a drawn closed loop of absolute canvas points. */
export function addPolyGroup(cfg, absPts) {
  const next = structuredClone(cfg);
  next.groups = next.groups || [];
  const id = nextId("grp", allIds(next).groups);
  const g = {
    id,
    label: "New Container",
    position: { x: 0, y: 0 },
    size: { w: 0, h: 0 },
    points: absPts.map((p) => ({ x: p.x, y: p.y }))
  };
  normalizePoly(g);
  const parent = groupAt(next, {
    x: g.position.x + g.size.w / 2,
    y: g.position.y + g.size.h / 2
  });
  if (parent) g.group = parent;
  next.groups.push(g);

  /* components whose centers fall inside the loop become members */
  next.nodes.forEach((n) => {
    const s = nodeSize(n);
    if (insideContainer(g, { x: n.position.x + s.w / 2, y: n.position.y + s.h / 2 })) n.group = id;
  });
  return { cfg: next, id };
}

/* Convex hull (monotone chain) of padded node corners -> polygon container
   wrapped around the given components, which become its members. */
export function wrapSelection(cfg, nodeIds, pad = 28) {
  const next = structuredClone(cfg);
  const nodes = next.nodes.filter((n) => nodeIds.includes(n.id));
  if (!nodes.length) return { cfg, id: null };
  const pts = [];
  nodes.forEach((n) => {
    const { w, h } = nodeSize(n);
    const { x, y } = n.position;
    pts.push(
      { x: x - pad, y: y - pad }, { x: x + w + pad, y: y - pad },
      { x: x + w + pad, y: y + h + pad }, { x: x - pad, y: y + h + pad }
    );
  });
  pts.sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));

  next.groups = next.groups || [];
  const id = nextId("grp", allIds(next).groups);
  const g = { id, label: "New Container", position: { x: 0, y: 0 }, size: { w: 0, h: 0 }, points: hull };
  normalizePoly(g);
  next.groups.push(g);
  nodes.forEach((n) => (n.group = id));
  return { cfg: next, id };
}