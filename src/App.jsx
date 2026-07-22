import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant,
  Controls, MiniMap, MarkerType, SelectionMode, applyNodeChanges, applyEdgeChanges, useReactFlow
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { ShapeNode, GroupNode, UnderlayNode, DrawPreviewNode, nodeSize } from "./nodes";
import WaypointEdge from "./WaypointEdge";
import { validateConfig } from "./validate";
import { buildDiagramSvg, buildStaticHtml } from "./exportSvg";
import sampleConfig from "./sample-config.json";
import schema from "./schema.json";
import Palette from "./editor/Palette";
import PropertiesPanel from "./editor/PropertiesPanel";
import ProcessBuilder from "./editor/ProcessBuilder";
import {
  addNode, addGroup, addEdge, deleteNode, deleteEdge, deleteGroup, deleteProcess,
  renameId, updateElement, insertWaypoint, insertWaypointAt, moveWaypoint, removeWaypoint,
  reverseEdge, deleteMany, applyNodeResize, applyGroupResize, setFontSizes, reparentByPosition,
  addPolyGroup, wrapSelection, setLabelPos, portsForNode,
  descendantGroups, allIds, slugId, edgePoints, TYPE_LABEL
} from "./editor/ops";

const nodeTypes = { shape: ShapeNode, grouper: GroupNode, underlay: UnderlayNode, drawpreview: DrawPreviewNode };
const edgeTypes = { wp: WaypointEdge };
const DEFAULT_COLOR = "#2563eb";
const UNDERLAY_ID = "__underlay";

/* ---- config -> React Flow ---------------------------------------------- */

function processMembership(cfg, litNodes, litEdgesExplicit) {
  const nodes = litNodes;
  const edges =
    litEdgesExplicit ??
    new Set(cfg.edges.filter((e) => nodes.has(e.source) && nodes.has(e.target)).map((e) => e.id));
  return { nodes, edges };
}

function toFlow(cfg, opts) {
  const { selectedProcId, editing, builder, underlay, wpHandlers, rsHandlers } = opts;

  /* what is highlighted: builder preview wins over process selection */
  let member = null, color = DEFAULT_COLOR, dimHard = true;
  if (builder) {
    member = { nodes: builder.nodes, edges: builder.edges };
    color = builder.color;
    dimHard = false; /* keep non-members visible enough to click */
  } else {
    const proc = cfg.processes.find((p) => p.id === selectedProcId);
    if (proc) {
      member = processMembership(cfg, new Set(proc.nodes), proc.edges ? new Set(proc.edges) : null);
      color = proc.color || DEFAULT_COLOR;
    }
  }

  const groupList = cfg.groups || [];
  const gById = Object.fromEntries(groupList.map((g) => [g.id, g]));
  const groupPos = Object.fromEntries(groupList.map((g) => [g.id, g.position]));
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
  const groupTree = (gid) => {
    const set = new Set([gid]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const g of groupList) {
        if (g.group && set.has(g.group) && !set.has(g.id)) { set.add(g.id); changed = true; }
      }
    }
    return set;
  };
  const groupHasLit = (gid) => {
    if (!member) return true;
    const tree = groupTree(gid);
    return cfg.nodes.some((n) => n.group && tree.has(n.group) && member.nodes.has(n.id));
  };

  const underlayNodes = underlay
    ? [{
        id: UNDERLAY_ID,
        type: "underlay",
        position: underlay.position,
        data: { src: underlay.src, w: underlay.w, h: underlay.h, opacity: underlay.opacity, scale: underlay.scale },
        draggable: !underlay.locked,
        selectable: false,
        zIndex: -20
      }]
    : [];

  const groupNodes = [...groupList].sort((x, y) => gDepth(x) - gDepth(y)).map((g) => ({
    id: g.id,
    type: "grouper",
    position: g.group && gById[g.group]
      ? { x: g.position.x - gById[g.group].position.x, y: g.position.y - gById[g.group].position.y }
      : { ...g.position },
    ...(g.group && gById[g.group] ? { parentId: g.group } : {}),
    data: {
      label: g.label, attrs: g.attrs, fontSize: g.fontSize,
      points: g.points, size: g.size, labelPos: g.labelPos,
      editable: editing && !builder,
      onResizeEnd: (p) => rsHandlers.group(g.id, p),
      onLabelMove: (p) => rsHandlers.groupLabel(g.id, p)
    },
    width: g.size.w,
    height: g.size.h,
    className: member && !groupHasLit(g.id) ? (dimHard ? "dim" : "bdim") : "",
    zIndex: -1,
    selectable: editing && !builder
  }));

  const shapeNodes = cfg.nodes.map((n) => {
    const size = nodeSize(n);
    const rel = n.group
      ? { x: n.position.x - groupPos[n.group].x, y: n.position.y - groupPos[n.group].y }
      : { ...n.position };
    const lit = member ? member.nodes.has(n.id) : false;
    return {
      id: n.id,
      type: "shape",
      position: rel,
      ...(n.group ? { parentId: n.group } : {}),
      data: {
        label: n.label, shape: n.type, attrs: n.attrs, size, cfgType: n.type,
        fontSize: n.fontSize, ports: n.ports, portDefs: portsForNode(cfg, n),
        editable: editing && !builder,
        onResizeEnd: (p) => rsHandlers.node(n.id, p)
      },
      className: member ? (lit ? "lit" : dimHard ? "dim" : "bdim") : "",
      style: lit ? { "--pc": color } : {},
      width: size.w,
      height: size.h,
      selectable: editing && !builder
    };
  });

  const edges = cfg.edges.map((e) => {
    const lit = member ? member.edges.has(e.id) : false;
    const dim = member && !lit;
    return {
      id: e.id,
      type: "wp",
      source: e.source,
      target: e.target,
      sourceHandle: `s-${e.sourcePort || "r"}`,
      targetHandle: `t-${e.targetPort || "l"}`,
      data: {
        label: e.label, waypoints: e.waypoints, attrs: e.attrs, fontSize: e.fontSize,
        lit, dimmed: dim && dimHard,
        editable: editing && !builder,
        onWaypointMove: (i, p) => wpHandlers.move(e.id, i, p),
        onWaypointRemove: (i) => wpHandlers.remove(e.id, i),
        onWaypointInsertAt: (i, p) => wpHandlers.insertAt(e.id, i, p),
        labelOffset: e.labelOffset,
        onLabelMove: (off) => wpHandlers.label(e.id, off)
      },
      className: dim ? (dimHard ? "dim-edge" : "bdim-edge") : lit ? "lit-edge" : "",
      style: { stroke: lit ? color : "#5b6470", strokeWidth: lit ? 2.6 : 1.6 },
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: lit ? color : "#5b6470" },
      ...(e.direction === "both"
        ? { markerStart: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: lit ? color : "#5b6470" } }
        : {}),
      interactionWidth: 24,
      zIndex: lit ? 10 : 0,
      selectable: editing && !builder
    };
  });

  return { nodes: [...underlayNodes, ...groupNodes, ...shapeNodes], edges };
}

/* ---- write dragged positions back into the config ---------------------- */

function applyDrag(cfg, flowNode) {
  const next = structuredClone(cfg);
  const groupById = Object.fromEntries((next.groups || []).map((g) => [g.id, g]));

  const g = groupById[flowNode.id];
  if (g) {
    const base = g.group && groupById[g.group] ? groupById[g.group].position : { x: 0, y: 0 };
    const newAbs = {
      x: Math.round(base.x + flowNode.position.x),
      y: Math.round(base.y + flowNode.position.y)
    };
    const dx = newAbs.x - g.position.x;
    const dy = newAbs.y - g.position.y;
    if (dx === 0 && dy === 0) return cfg;
    g.position = newAbs;
    const childGroups = descendantGroups(next, g.id);
    childGroups.forEach((id) => {
      const c = groupById[id];
      c.position = { x: c.position.x + dx, y: c.position.y + dy };
    });
    const treeSet = new Set([g.id, ...childGroups]);
    next.nodes.forEach((n) => {
      if (n.group && treeSet.has(n.group))
        n.position = { x: n.position.x + dx, y: n.position.y + dy };
    });
    return next;
  }

  const n = next.nodes.find((x) => x.id === flowNode.id);
  if (n) {
    const base = n.group && groupById[n.group] ? groupById[n.group].position : { x: 0, y: 0 };
    n.position = {
      x: Math.round(base.x + flowNode.position.x),
      y: Math.round(base.y + flowNode.position.y)
    };
  }
  return next;
}

/* ---- tooltip ------------------------------------------------------------ */

function Tooltip({ tip }) {
  if (!tip) return null;
  const { x, y, title, kind, attrs } = tip;
  const entries = Object.entries(attrs || {});
  return (
    <div className="tooltip" style={{ left: x + 14, top: y + 14 }}>
      <div className="tooltip-head">
        <span className="tooltip-kind">{kind}</span>
        <span className="tooltip-title">{title}</span>
      </div>
      {entries.length > 0 ? (
        <table className="tooltip-table">
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k}>
                <td className="tt-k">{k}</td>
                <td className="tt-v">{String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="tooltip-empty">no attributes</div>
      )}
    </div>
  );
}

/* ---- app ---------------------------------------------------------------- */

const PICKER_TYPES = {
  "application/json": { description: "JSON file", accept: { "application/json": [".json"] } },
  "image/svg+xml": { description: "SVG image", accept: { "image/svg+xml": [".svg"] } },
  "image/png": { description: "PNG image", accept: { "image/png": [".png"] } },
  "text/html": { description: "HTML page", accept: { "text/html": [".html"] } }
};

/* Ask the browser for a save location when it supports the File System Access
   API (Chrome/Edge); otherwise fall back to a plain download. Cancelling the
   dialog is a no-op, not an error. */
async function download(filename, data, mime = "application/json") {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });

  if (typeof window.showSaveFilePicker === "function") {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: PICKER_TYPES[mime] ? [PICKER_TYPES[mime]] : []
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (err) {
      if (err && (err.name === "AbortError" || err.code === 20)) return false;
      /* SecurityError etc. — fall through to the classic download */
    }
  }

  const url = URL.createObjectURL(blob);
  const el = document.createElement("a");
  el.href = url;
  el.download = filename;
  el.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export default function App() {
  const [config, _setConfig] = useState(sampleConfig);
  const [baseline, setBaseline] = useState(sampleConfig);
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const [histVer, setHistVer] = useState(0);

  /* every normal mutation goes through this wrapper and lands in history */
  const setConfig = useCallback((updater) => {
    _setConfig((cur) => {
      const next = typeof updater === "function" ? updater(cur) : updater;
      if (next !== cur && undoRef.current[undoRef.current.length - 1] !== cur) {
        undoRef.current.push(cur);
        if (undoRef.current.length > 100) undoRef.current.shift();
        redoRef.current = [];
        setHistVer((v) => v + 1);
      }
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    _setConfig((cur) => {
      redoRef.current.push(cur);
      return prev;
    });
    setSelection(null);
    setBuilder(null);
    setHistVer((v) => v + 1);
  }, []);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    _setConfig((cur) => {
      undoRef.current.push(cur);
      return next;
    });
    setSelection(null);
    setBuilder(null);
    setHistVer((v) => v + 1);
  }, []);
  const [mode, setMode] = useState("view");
  const [selectedProc, setSelectedProc] = useState(null);
  const [selection, setSelection] = useState(null); /* {kind, id} */
  const [builder, setBuilder] = useState(null);
  const [underlay, setUnderlay] = useState(null);
  const [errors, setErrors] = useState([]);
  const [loadedName, setLoadedName] = useState("sample (embedded)");
  const [tip, setTip] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const fileRef = useRef(null);
  const { screenToFlowPosition, getZoom } = useReactFlow();

  const editing = mode === "edit";

  useEffect(() => {
    if (!editing) setDraw(null);
  }, [editing]);

  useEffect(() => {
    if (selectedProc && !config.processes.some((p) => p.id === selectedProc)) {
      setSelectedProc(null);
    }
  }, [config, selectedProc]);
  const groupIds = useMemo(() => new Set((config.groups || []).map((g) => g.id)), [config]);

  const wpHandlers = useMemo(
    () => ({
      move: (edgeId, i, p) => setConfig((c) => moveWaypoint(c, edgeId, i, p)),
      remove: (edgeId, i) => setConfig((c) => removeWaypoint(c, edgeId, i)),
      insertAt: (edgeId, i, p) => setConfig((c) => insertWaypointAt(c, edgeId, i, p)),
      label: (edgeId, off) =>
        setConfig((c) =>
          updateElement(
            c, "edge", edgeId,
            Math.abs(off.x) < 3 && Math.abs(off.y) < 3
              ? { labelOffset: undefined }
              : { labelOffset: { x: Math.round(off.x), y: Math.round(off.y) } }
          )
        )
    }),
    []
  );

  const rsHandlers = useMemo(
    () => ({
      groupLabel: (gid, p) => setConfig((c) => setLabelPos(c, gid, p)),
      node: (id, p) => setConfig((c) => applyNodeResize(c, id, p)),
      group: (id, p) => setConfig((c) => applyGroupResize(c, id, p))
    }),
    []
  );

  useEffect(() => {
    const f = toFlow(config, {
      selectedProcId: selectedProc, editing, builder, underlay, wpHandlers, rsHandlers
    });
    setNodes((prev) => {
      /* preserve React Flow selection flags across rebuilds */
      const sel = new Set(prev.filter((n) => n.selected).map((n) => n.id));
      return f.nodes.map((n) => (sel.has(n.id) ? { ...n, selected: true } : n));
    });
    setEdges((prev) => {
      const sel = new Set(prev.filter((e) => e.selected).map((e) => e.id));
      return f.edges.map((e) => (sel.has(e.id) ? { ...e, selected: true } : e));
    });
  }, [config, selectedProc, editing, builder, underlay, wpHandlers, rsHandlers]);

  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onNodeDragStop = useCallback((_evt, node, draggedNodes) => {
    const list = draggedNodes && draggedNodes.length ? draggedNodes : [node];
    const under = list.find((n) => n.id === UNDERLAY_ID);
    if (under) setUnderlay((u) => (u ? { ...u, position: under.position } : u));
    const rest = list.filter((n) => n.id !== UNDERLAY_ID);
    if (rest.length)
      setConfig((cfg) => {
        let next = rest.reduce((c, n) => applyDrag(c, n), cfg);
        /* single-element drags can re-nest into the container under them */
        if (rest.length === 1 && rest[0].type !== "underlay") {
          const kind = rest[0].type === "grouper" ? "group" : "node";
          next = reparentByPosition(next, kind, rest[0].id);
        }
        return next;
      });
  }, []);

  /* ---- selection ---- */
  const onSelectionChange = useCallback(
    ({ nodes: sn, edges: se }) => {
      if (!editing || builder) return;
      const shapes = sn.filter((n) => n.type === "shape").map((n) => n.id);
      const grps = sn.filter((n) => n.type === "grouper").map((n) => n.id);
      const eds = se.map((e) => e.id);
      const total = shapes.length + grps.length + eds.length;
      if (total === 0) setSelection(null);
      else if (total === 1) {
        if (shapes.length) setSelection({ kind: "node", id: shapes[0] });
        else if (grps.length) setSelection({ kind: "group", id: grps[0] });
        else setSelection({ kind: "edge", id: eds[0] });
      } else {
        setSelection({
          kind: "multi", nodes: shapes, edges: eds, groups: grps,
          use: { nodes: true, edges: true, groups: true }
        });
      }
    },
    [editing, builder]
  );

  /* ---- connect (draw edges) ---- */
  const onConnect = useCallback(
    (params) => {
      if (!params?.source || !params?.target) return;
      const sourcePort = params.sourceHandle?.slice(2) || "r";
      const targetPort = params.targetHandle?.slice(2) || "l";
      const { cfg: next, id } = addEdge(config, {
        source: params.source, target: params.target, sourcePort, targetPort
      });
      setConfig(next);
      if (id) setSelection({ kind: "edge", id });
    },
    [config]
  );

  /* ---- palette: add via click or drag-drop ---- */
  const centerPos = useCallback(() => {
    const el = document.querySelector(".react-flow");
    const r = el.getBoundingClientRect();
    const p = screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    return { x: p.x - 75, y: p.y - 33 };
  }, [screenToFlowPosition]);

  const doAddNode = useCallback(
    (type, pos) => {
      const { cfg: next, id } = addNode(config, type, pos);
      setConfig(next);
      setSelection({ kind: "node", id });
    },
    [config]
  );

  const doAddGroup = useCallback(
    (pos) => {
      const { cfg: next, id } = addGroup(config, pos);
      setConfig(next);
      setSelection({ kind: "group", id });
    },
    [config]
  );

  /* ---- containers can also be drawn as a closed loop of clicked points ---- */
  const [draw, setDraw] = useState(null); /* { pts: [], cursor, near } */
  const drawRef = useRef(null);
  drawRef.current = draw;

  const startDraw = useCallback(() => {
    setSelection(null);
    setDraw({ pts: [], cursor: null, near: false });
  }, []);

  const cancelDraw = useCallback(() => setDraw(null), []);

  const closeLoop = useCallback(() => {
    const d = drawRef.current;
    if (!d || d.pts.length < 3) return;
    const { cfg: next, id } = addPolyGroup(config, d.pts);
    setConfig(next);
    setDraw(null);
    setSelection({ kind: "group", id });
  }, [config]);

  const NEAR_PX = 14;

  const onCanvasMove = useCallback(
    (e) => {
      const d = drawRef.current;
      if (!d) return;
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const first = d.pts[0];
      const z = getZoom() || 1;
      const near =
        !!first && d.pts.length >= 3 &&
        Math.hypot(p.x - first.x, p.y - first.y) * z < NEAR_PX;
      setDraw((cur) =>
        cur && { ...cur, cursor: { x: Math.round(p.x), y: Math.round(p.y) }, near }
      );
    },
    [screenToFlowPosition, getZoom]
  );

  const onCanvasClick = useCallback(
    (e) => {
      const d = drawRef.current;
      if (!d) return;
      e.preventDefault();
      e.stopPropagation();
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const first = d.pts[0];
      const z = getZoom() || 1;
      if (first && d.pts.length >= 3 && Math.hypot(p.x - first.x, p.y - first.y) * z < NEAR_PX) {
        closeLoop();
        return;
      }
      setDraw((cur) =>
        cur && { ...cur, pts: [...cur.pts, { x: Math.round(p.x), y: Math.round(p.y) }] }
      );
    },
    [screenToFlowPosition, getZoom, closeLoop]
  );

  const onDrop = useCallback(
    (e) => {
      const type = e.dataTransfer.getData("application/diagram-type");
      if (!type) return;
      e.preventDefault();
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      if (type === "__group") doAddGroup(p);
      else doAddNode(type, { x: p.x - 75, y: p.y - 33 });
    },
    [screenToFlowPosition, doAddGroup, doAddNode]
  );

  /* ---- underlay ---- */
  const loadUnderlay = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const w = 1000;
        setUnderlay({
          src: reader.result, w, h: (img.naturalHeight / img.naturalWidth) * w,
          opacity: 0.4, scale: 1, locked: false, position: { x: 0, y: 0 }
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }, []);

  /* ---- waypoints: double-click edge to add ---- */
  const onEdgeDoubleClick = useCallback(
    (evt, edge) => {
      if (!editing || builder) return;
      evt.preventDefault();
      const p = screenToFlowPosition({ x: evt.clientX, y: evt.clientY });
      setConfig((cfg) => insertWaypoint(cfg, edge.id, p));
      setSelection({ kind: "edge", id: edge.id });
    },
    [editing, builder, screenToFlowPosition]
  );

  const [bulkFont, setBulkFont] = useState("");

  const effectiveMulti = useMemo(() => {
    if (selection?.kind !== "multi") return null;
    const u = selection.use;
    return {
      nodes: u.nodes ? selection.nodes : [],
      edges: u.edges ? selection.edges : [],
      groups: u.groups ? selection.groups : []
    };
  }, [selection]);

  const applyBulkFont = useCallback(() => {
    if (!effectiveMulti) return;
    const size = bulkFont === "" ? null : Number(bulkFont);
    if (size !== null && (isNaN(size) || size < 6 || size > 48)) return;
    setConfig((c) => setFontSizes(c, effectiveMulti, size));
  }, [effectiveMulti, bulkFont, setConfig]);

  const addWaypointAtMid = useCallback(() => {
    if (selection?.kind !== "edge") return;
    const e = config.edges.find((x) => x.id === selection.id);
    if (!e) return;
    const pts = edgePoints(config, e);
    const i = Math.floor((pts.length - 1) / 2);
    const p = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
    setConfig(insertWaypoint(config, e.id, p));
  }, [selection, config]);

  /* ---- delete with confirmation ---- */
  const confirmDelete = useCallback(() => {
    if (!selection) return;
    if (selection.kind === "multi") {
      const eff = {
        nodes: selection.use.nodes ? selection.nodes : [],
        edges: selection.use.edges ? selection.edges : [],
        groups: selection.use.groups ? selection.groups : []
      };
      const count = eff.nodes.length + eff.edges.length + eff.groups.length;
      if (count === 0) return;
      const { cfg: next, summary } = deleteMany(config, eff);
      if (window.confirm([`Delete ${count} selected item(s)?`, ...summary].join("\n"))) {
        setConfig(next);
        setSelection(null);
      }
      return;
    }
    const { kind, id } = selection;
    const op = { node: deleteNode, edge: deleteEdge, group: deleteGroup }[kind];
    const { cfg: next, summary } = op(config, id);
    const msg = [`Delete ${kind} "${id}"?`, ...summary].join("\n");
    if (window.confirm(msg)) {
      setConfig(next);
      setSelection(null);
    }
  }, [selection, config]);

  useEffect(() => {
    const onKey = (e) => {
      const t = document.activeElement?.tagName;
      const typing = t === "INPUT" || t === "TEXTAREA" || t === "SELECT";
      if (drawRef.current && !typing) {
        if (e.key === "Escape") { e.preventDefault(); cancelDraw(); return; }
        if (e.key === "Enter") { e.preventDefault(); closeLoop(); return; }
      }
      if ((e.ctrlKey || e.metaKey) && !typing) {
        const k = e.key.toLowerCase();
        if (k === "z") {
          e.preventDefault();
          e.shiftKey ? redo() : undo();
          return;
        }
        if (k === "y") {
          e.preventDefault();
          redo();
          return;
        }
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (typing) return;
      if (editing && !builder && selection) {
        e.preventDefault();
        confirmDelete();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, builder, selection, confirmDelete, undo, redo, cancelDraw, closeLoop]);

  /* ---- process builder ---- */
  const startBuilder = useCallback((proc) => {
    setSelection(null);
    setSelectedProc(null);
    setBuilder(
      proc
        ? {
            origId: proc.id, name: proc.name, color: proc.color || DEFAULT_COLOR,
            description: proc.description || "",
            nodes: new Set(proc.nodes),
            edges: new Set(
              proc.edges ||
                config.edges
                  .filter((e) => proc.nodes.includes(e.source) && proc.nodes.includes(e.target))
                  .map((e) => e.id)
            )
          }
        : { origId: null, name: "", color: DEFAULT_COLOR, description: "", nodes: new Set(), edges: new Set() }
    );
  }, [config]);

  const saveBuilder = useCallback(() => {
    setConfig((cfg) => {
      const next = structuredClone(cfg);
      const ids = allIds(next);
      const id = builder.origId || slugId(builder.name, ids.processes);
      const proc = {
        id,
        name: builder.name.trim(),
        color: builder.color,
        ...(builder.description.trim() ? { description: builder.description.trim() } : {}),
        nodes: [...builder.nodes],
        ...(builder.edges.size ? { edges: [...builder.edges] } : {})
      };
      const i = next.processes.findIndex((p) => p.id === builder.origId);
      if (i >= 0) next.processes[i] = proc;
      else next.processes.push(proc);
      setSelectedProc(id);
      return next;
    });
    setBuilder(null);
  }, [builder]);

  const onNodeClick = useCallback(
    (_evt, node) => {
      if (!builder || node.type !== "shape") return;
      setBuilder((b) => {
        const nodes = new Set(b.nodes);
        if (nodes.has(node.id)) {
          nodes.delete(node.id);
          /* drop edges that touched the removed node */
          const edges = new Set(
            [...b.edges].filter((eid) => {
              const e = config.edges.find((x) => x.id === eid);
              return e && e.source !== node.id && e.target !== node.id;
            })
          );
          return { ...b, nodes, edges };
        }
        nodes.add(node.id);
        return { ...b, nodes };
      });
    },
    [builder, config]
  );

  const onEdgeClick = useCallback(
    (_evt, edge) => {
      if (!builder) return;
      setBuilder((b) => {
        const edges = new Set(b.edges);
        const nodes = new Set(b.nodes);
        if (edges.has(edge.id)) edges.delete(edge.id);
        else {
          edges.add(edge.id);
          nodes.add(edge.source); /* an edge implies its endpoints */
          nodes.add(edge.target);
        }
        return { ...b, nodes, edges };
      });
    },
    [builder]
  );

  /* ---- tooltips (view mode only) ---- */
  const showTip = (evt, title, kind, attrs) =>
    setTip({ x: evt.clientX, y: evt.clientY, title, kind, attrs });
  const onNodeMouseEnter = useCallback(
    (evt, node) => {
      if (editing) return;
      if (node.type === "underlay") return;
      if (node.type === "grouper") return showTip(evt, node.data.label, "container", node.data.attrs);
      showTip(evt, node.data.label, TYPE_LABEL[node.data.cfgType] || node.data.cfgType, node.data.attrs);
    },
    [editing]
  );
  const onEdgeMouseEnter = useCallback(
    (evt, edge) => {
      if (editing) return;
      showTip(evt, edge.data.label || `${edge.source} → ${edge.target}`, "connection", edge.data.attrs);
    },
    [editing]
  );
  const onMouseMove = useCallback((evt) => {
    setTip((t) => (t ? { ...t, x: evt.clientX, y: evt.clientY } : t));
  }, []);
  const clearTip = useCallback(() => setTip(null), []);

  /* ---- load / export / revert ---- */
  const loadFile = async (file) => {
    try {
      const text = await file.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        setErrors([`Not valid JSON — ${e.message}`]);
        return;
      }
      const result = validateConfig(parsed);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      setErrors([]);
      setSelectedProc(null);
      setSelection(null);
      setBuilder(null);
      _setConfig(parsed);
      undoRef.current = [];
      redoRef.current = [];
      setHistVer((v) => v + 1);
      setBaseline(parsed);
      setLoadedName(file.name);
    } catch (e) {
      setErrors([`Could not read file — ${e.message}`]);
    }
  };

  const exportConfig = () => {
    const result = validateConfig(config);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    download("diagram.config.json", JSON.stringify(config, null, 2));
    setBaseline(config);
  };

  const exportName = () =>
    (config.meta?.title || "diagram").replace(/\s+/g, "-").toLowerCase();

  const exportSvgFile = () => {
    const proc = config.processes.find((p) => p.id === selectedProc) || null;
    const { svg } = buildDiagramSvg(config, proc);
    download(`${exportName()}.svg`, svg, "image/svg+xml");
  };

  const exportHtml = () => {
    const proc = config.processes.find((p) => p.id === selectedProc) || null;
    download(
      `${exportName()}${proc ? "-" + proc.id : ""}.html`,
      buildStaticHtml(config, proc),
      "text/html"
    );
  };

  const exportPng = () => {
    const proc = config.processes.find((p) => p.id === selectedProc) || null;
    const { svg, width, height } = buildDiagramSvg(config, proc);
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        download(`${exportName()}.png`, blob, "image/png");
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setErrors(["PNG rendering failed in this browser — use the SVG export instead."]);
    };
    img.src = url;
  };

  const revert = () => {
    if (window.confirm("Discard all changes since the last load/export?")) {
      _setConfig(baseline);
      undoRef.current = [];
      redoRef.current = [];
      setHistVer((v) => v + 1);
      setSelection(null);
      setBuilder(null);
      setSelectedProc(null);
    }
  };

  const dirty = config !== baseline;

  const activeProc = useMemo(
    () => config.processes.find((p) => p.id === selectedProc) || null,
    [config, selectedProc]
  );

  const counts = useMemo(
    () => ({ nodes: config.nodes.length, edges: config.edges.length }),
    [config]
  );

  /* rename/patch handlers for the properties panel */
  const handleRename = (newId) => {
    const r = renameId(config, selection.kind, selection.id, newId);
    if (r.error) return r.error;
    setConfig(r.cfg);
    setSelection({ ...selection, id: newId });
    return null;
  };
  const handlePatch = (patch) =>
    setConfig((cfg) => updateElement(cfg, selection.kind, selection.id, patch));

  const flowNodes = useMemo(() => {
    if (!draw) return nodes;
    return [
      ...nodes,
      {
        id: "__draw_preview__",
        type: "drawpreview",
        position: { x: 0, y: 0 },
        data: { pts: draw.pts, cursor: draw.cursor, near: draw.near },
        draggable: false, selectable: false, connectable: false,
        zIndex: 4000, style: { pointerEvents: "none" }
      }
    ];
  }, [nodes, draw]);

  return (
    <div className="frame" onMouseMove={onMouseMove}>
      {editing && (
        <Palette
          onAdd={(t) => doAddNode(t, centerPos())}
          onAddGroup={() => doAddGroup(centerPos())}
          onDrawGroup={startDraw}
          drawing={!!draw}
          onUnderlay={loadUnderlay}
          hasUnderlay={!!underlay}
        />
      )}

      <div
        className={`canvas-pane ${builder ? "builder-mode" : ""} ${draw ? "drawing" : ""}`}
        onClickCapture={draw ? onCanvasClick : undefined}
        onMouseMoveCapture={draw ? onCanvasMove : undefined}
        onDoubleClickCapture={draw ? (e) => { e.preventDefault(); e.stopPropagation(); closeLoop(); } : undefined}
        onContextMenu={draw ? (e) => { e.preventDefault(); cancelDraw(); } : undefined}
      >
        {draw && (
          <div className="draw-hint">
            <span>
              {draw.pts.length === 0
                ? "Click on the canvas to place the first point of the container"
                : draw.pts.length < 3
                ? `${draw.pts.length} point(s) — keep clicking to trace the outline`
                : draw.near
                ? "Click the highlighted start point to close the loop"
                : `${draw.pts.length} points — click the first point to close (or press Enter)`}
            </span>
            <button className="pp-mini" onClick={cancelDraw} title="Cancel (Esc)">
              cancel
            </button>
          </div>
        )}
        <ReactFlow
          nodes={flowNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={clearTip}
          onEdgeMouseEnter={onEdgeMouseEnter}
          onEdgeMouseLeave={clearTip}
          onSelectionChange={onSelectionChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          minZoom={0.2}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={editing && !builder && !draw}
          nodesConnectable={editing && !builder && !draw}
          elementsSelectable={editing && !builder && !draw}
          selectionOnDrag={editing && !builder && !draw}
          selectionMode={SelectionMode.Partial}
          panOnDrag={editing && !builder ? [1, 2] : true}
          panOnScroll={editing && !builder}
          connectionRadius={34}
          deleteKeyCode={null}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#c9cdc4" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="minimap" />
        </ReactFlow>

        {editing && !builder && selection && (
          <div className="sel-toolbar">
            {selection.kind === "multi" ? (
              <>
                <span className="sel-kind">selection</span>
                {[
                  ["nodes", selection.nodes.length, "nodes"],
                  ["edges", selection.edges.length, "edges"],
                  ["groups", selection.groups.length, "containers"]
                ]
                  .filter(([, count]) => count > 0)
                  .map(([key, count, label]) => (
                    <label key={key} className="sel-check">
                      <input
                        type="checkbox"
                        checked={selection.use[key]}
                        onChange={() =>
                          setSelection((s) => ({ ...s, use: { ...s.use, [key]: !s.use[key] } }))
                        }
                      />
                      {count} {label}
                    </label>
                  ))}
                <span className="sel-sep" />
                <button
                  className="pp-mini"
                  onClick={() => {
                    if (!effectiveMulti?.nodes.length) return;
                    const r = wrapSelection(config, effectiveMulti.nodes);
                    if (r.id) {
                      setConfig(r.cfg);
                      setSelection({ kind: "group", id: r.id });
                    }
                  }}
                  disabled={!effectiveMulti || effectiveMulti.nodes.length === 0}
                  title="Draw a polygon container around the checked components and put them inside it"
                >
                  Wrap
                </button>
                <input
                  className="sel-font"
                  type="number" min="6" max="48" step="0.5"
                  placeholder="font px"
                  title="Font size to apply to the checked kinds (leave empty to reset to default)"
                  value={bulkFont}
                  onChange={(e) => setBulkFont(e.target.value)}
                />
                <button
                  className="pp-mini"
                  onClick={applyBulkFont}
                  disabled={
                    !effectiveMulti ||
                    effectiveMulti.nodes.length + effectiveMulti.edges.length + effectiveMulti.groups.length === 0
                  }
                  title="Apply font size to checked kinds (empty = reset to default)"
                >
                  Apply font
                </button>
                <button
                  className="sel-delete"
                  onClick={confirmDelete}
                  disabled={
                    !effectiveMulti ||
                    effectiveMulti.nodes.length + effectiveMulti.edges.length + effectiveMulti.groups.length === 0
                  }
                  title="Delete the checked kinds (or press the Delete key)"
                >
                  Delete
                </button>
              </>
            ) : (
              <>
                <span className="sel-kind">{selection.kind === "group" ? "container" : selection.kind}</span>
                <span className="sel-id">{selection.id}</span>
                {selection.kind === "edge" && (
                  <button className="pp-mini" onClick={addWaypointAtMid} title="Add a routing point you can drag">
                    + waypoint
                  </button>
                )}
                <button className="sel-delete" onClick={confirmDelete} title="Delete (or press the Delete key)">
                  Delete
                </button>
              </>
            )}
          </div>
        )}

        {underlay && editing && (
          <div className="underlay-controls">
            <span className="uc-label">underlay</span>
            <input
              type="range" min="0.1" max="0.9" step="0.05" value={underlay.opacity}
              title="opacity"
              onChange={(e) => setUnderlay({ ...underlay, opacity: Number(e.target.value) })}
            />
            <input
              type="range" min="0.3" max="3" step="0.05" value={underlay.scale}
              title="scale"
              onChange={(e) => setUnderlay({ ...underlay, scale: Number(e.target.value) })}
            />
            <label className="uc-lock">
              <input
                type="checkbox" checked={underlay.locked}
                onChange={(e) => setUnderlay({ ...underlay, locked: e.target.checked })}
              /> lock
            </label>
            <button className="pp-mini" onClick={() => setUnderlay(null)}>remove</button>
          </div>
        )}

        {errors.length > 0 && (
          <div className="error-banner">
            <div className="error-title">
              Configuration rejected — fix these and try again
              <button className="error-close" onClick={() => setErrors([])}>×</button>
            </div>
            <ul>
              {errors.slice(0, 12).map((e, i) => <li key={i}>{e}</li>)}
              {errors.length > 12 && <li>…and {errors.length - 12} more</li>}
            </ul>
          </div>
        )}
      </div>

      <aside className="sidebar">
        <div className="titleblock">
          <div className="tb-row tb-title">{config.meta?.title || "Interface Diagram"}</div>
          <div className="tb-grid">
            <div className="tb-cell"><span>rev</span>{config.meta?.version || "—"}</div>
            <div className="tb-cell"><span>nodes</span>{counts.nodes}</div>
            <div className="tb-cell"><span>links</span>{counts.edges}</div>
          </div>
          <div className="tb-file" title={loadedName}>
            {loadedName}{dirty ? " · edited" : ""}
          </div>
        </div>

        <div className="hist-row">
          <button className="pp-mini" onClick={undo} disabled={histVer >= 0 && undoRef.current.length === 0} title="Undo (Ctrl+Z)">
            &#8630; undo
          </button>
          <button className="pp-mini" onClick={redo} disabled={histVer >= 0 && redoRef.current.length === 0} title="Redo (Ctrl+Shift+Z / Ctrl+Y)">
            &#8631; redo
          </button>
        </div>

        <div className="mode-toggle" role="tablist">
          <button
            className={mode === "view" ? "on" : ""}
            onClick={() => { setMode("view"); setSelection(null); setBuilder(null); }}
          >
            View
          </button>
          <button className={mode === "edit" ? "on" : ""} onClick={() => setMode("edit")}>
            Edit
          </button>
        </div>

        {builder ? (
          <ProcessBuilder
            builder={builder}
            setBuilder={setBuilder}
            cfg={config}
            onSave={saveBuilder}
            onCancel={() => setBuilder(null)}
          />
        ) : (
          <>
            <div className="section-label">
              Groups
              {editing && (
                <button className="pp-mini" onClick={() => startBuilder(null)}>+ new</button>
              )}
            </div>
            <div className="process-list">
              {config.processes.map((p) => {
                const active = p.id === selectedProc;
                return (
                  <div key={p.id} className="process-row">
                    <button
                      className={`process ${active ? "active" : ""}`}
                      style={{ "--pc": p.color || DEFAULT_COLOR }}
                      onClick={() => setSelectedProc(active ? null : p.id)}
                    >
                      <span className="chip" />
                      <span className="process-name">{p.name}</span>
                      <span className="process-count">{p.nodes.length}</span>
                    </button>
                    {editing && (
                      <span className="process-tools">
                        <button className="pp-mini" title="Edit membership" onClick={() => startBuilder(p)}>✎</button>
                        <button
                          className="pp-mini" title="Delete group"
                          onClick={() => {
                            if (window.confirm(`Delete group "${p.name}"?`)) {
                              setConfig((c) => deleteProcess(c, p.id).cfg);
                              if (selectedProc === p.id) setSelectedProc(null);
                            }
                          }}
                        >×</button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {activeProc && !editing && (
              <div className="process-detail" style={{ "--pc": activeProc.color || DEFAULT_COLOR }}>
                <div className="pd-name">{activeProc.name}</div>
                {activeProc.description && <p>{activeProc.description}</p>}
                <button className="ghost" onClick={() => setSelectedProc(null)}>Clear highlight</button>
              </div>
            )}

            {editing && (
              <PropertiesPanel
                cfg={config}
                descendantGroups={descendantGroups}
                selection={selection && selection.kind !== "multi" ? selection : null}
                onRename={handleRename}
                onPatch={handlePatch}
                onDelete={confirmDelete}
                onClearWaypoints={() =>
                  setConfig((c) => updateElement(c, "edge", selection.id, { waypoints: undefined }))
                }
                onReverse={() => setConfig((c) => reverseEdge(c, selection.id))}
              />
            )}

            {editing && !selection && (
              <div className="edit-hint">
                Drag shapes from the palette. Drag between port dots to connect. Click anything to edit it. Drag on empty canvas to box-select several items (pan with right-drag or scroll).
              </div>
            )}
          </>
        )}

        <div className="sidebar-foot">
          <button className="btn" onClick={() => fileRef.current?.click()}>Load JSON</button>
          <button className="btn" onClick={exportConfig}>Export JSON</button>
          <button className="btn subtle" title="Save the diagram (with current highlight) as a PNG image" onClick={exportPng}>
            PNG
          </button>
          <button className="btn subtle" title="Save the diagram (with current highlight) as a scalable SVG" onClick={exportSvgFile}>
            SVG
          </button>
          <button className="btn subtle" title="Save a script-free HTML page of the current view with hover tooltips — safe for Confluence/SharePoint" onClick={exportHtml}>
            HTML
          </button>
          <button className="btn subtle" title="Download the JSON Schema"
            onClick={() => download("diagram.schema.json", JSON.stringify(schema, null, 2))}>
            Schema
          </button>
          {dirty && (
            <button className="btn subtle" title="Discard changes since last load/export" onClick={revert}>
              Revert
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) loadFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </aside>

      <Tooltip tip={tip} />
    </div>
  );
}

export function Root() {
  return (
    <ReactFlowProvider>
      <App />
    </ReactFlowProvider>
  );
}
