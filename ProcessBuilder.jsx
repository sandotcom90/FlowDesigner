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

function groupAt(cfg, pos) {
  for (const g of cfg.groups || []) {
    if (
      pos.x >= g.position.x && pos.x <= g.position.x + g.size.w &&
      pos.y >= g.position.y && pos.y <= g.position.y + g.size.h
    ) return g.id;
  }
  return null;
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
  next.groups.push({
    id, label: "New Group",
    position: { x: Math.round(pos.x), y: Math.round(pos.y) },
    size: { w: 340, h: 190 }
  });
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
  if (emptied.length) summary.push(`process(es) left empty and removed: ${emptied.join(", ")}`);
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
  let freed = 0;
  next.nodes.forEach((n) => {
    if (n.group === id) { delete n.group; freed++; }
  });
  const summary = freed ? [`${freed} member node(s) will be ungrouped (kept on canvas)`] : [];
  return { cfg: next, summary };
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
  switch (port) {
    case "t": return { x: x + w / 2, y };
    case "b": return { x: x + w / 2, y: y + h };
    case "l": return { x, y: y + h / 2 };
    default: return { x: x + w, y: y + h / 2 };
  }
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
