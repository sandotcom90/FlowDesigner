import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant,
  Controls, MiniMap, MarkerType, applyNodeChanges, applyEdgeChanges, useReactFlow
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { ShapeNode, GroupNode, UnderlayNode, nodeSize } from "./nodes";
import WaypointEdge from "./WaypointEdge";
import { validateConfig } from "./validate";
import { buildDiagramSvg } from "./exportSvg";
import sampleConfig from "./sample-config.json";
import schema from "./schema.json";
import Palette from "./editor/Palette";
import PropertiesPanel from "./editor/PropertiesPanel";
import ProcessBuilder from "./editor/ProcessBuilder";
import {
  addNode, addGroup, addEdge, deleteNode, deleteEdge, deleteGroup, deleteProcess,
  renameId, updateElement, insertWaypoint, insertWaypointAt, moveWaypoint, removeWaypoint,
  reverseEdge, allIds, slugId, edgePoints, TYPE_LABEL
} from "./editor/ops";

const nodeTypes = { shape: ShapeNode, grouper: GroupNode, underlay: UnderlayNode };
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
  const { selectedProcId, editing, builder, underlay, wpHandlers } = opts;

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

  const groupPos = Object.fromEntries((cfg.groups || []).map((g) => [g.id, g.position]));
  const groupHasLit = (gid) =>
    member ? cfg.nodes.some((n) => n.group === gid && member.nodes.has(n.id)) : true;

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

  const groupNodes = (cfg.groups || []).map((g) => ({
    id: g.id,
    type: "grouper",
    position: { ...g.position },
    data: { label: g.label, attrs: g.attrs },
    style: { width: g.size.w, height: g.size.h },
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
      data: { label: n.label, shape: n.type, attrs: n.attrs, size, cfgType: n.type, editable: editing && !builder },
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
        label: e.label, waypoints: e.waypoints, attrs: e.attrs,
        lit, dimmed: dim && dimHard,
        editable: editing && !builder,
        onWaypointMove: (i, p) => wpHandlers.move(e.id, i, p),
        onWaypointRemove: (i) => wpHandlers.remove(e.id, i),
        onWaypointInsertAt: (i, p) => wpHandlers.insertAt(e.id, i, p)
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
  const groupPos = Object.fromEntries((next.groups || []).map((g) => [g.id, g.position]));

  const g = (next.groups || []).find((x) => x.id === flowNode.id);
  if (g) {
    const dx = flowNode.position.x - g.position.x;
    const dy = flowNode.position.y - g.position.y;
    g.position = { x: Math.round(flowNode.position.x), y: Math.round(flowNode.position.y) };
    next.nodes.forEach((n) => {
      if (n.group === g.id) n.position = { x: n.position.x + dx, y: n.position.y + dy };
    });
    return next;
  }

  const n = next.nodes.find((x) => x.id === flowNode.id);
  if (n) {
    const base = n.group ? groupPos[n.group] : { x: 0, y: 0 };
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

function download(filename, text, mime = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [config, setConfig] = useState(sampleConfig);
  const [baseline, setBaseline] = useState(sampleConfig);
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
  const { screenToFlowPosition } = useReactFlow();

  const editing = mode === "edit";
  const groupIds = useMemo(() => new Set((config.groups || []).map((g) => g.id)), [config]);

  const wpHandlers = useMemo(
    () => ({
      move: (edgeId, i, p) => setConfig((c) => moveWaypoint(c, edgeId, i, p)),
      remove: (edgeId, i) => setConfig((c) => removeWaypoint(c, edgeId, i)),
      insertAt: (edgeId, i, p) => setConfig((c) => insertWaypointAt(c, edgeId, i, p))
    }),
    []
  );

  useEffect(() => {
    const f = toFlow(config, {
      selectedProcId: selectedProc, editing, builder, underlay, wpHandlers
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
  }, [config, selectedProc, editing, builder, underlay, wpHandlers]);

  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onNodeDragStop = useCallback((_evt, node) => {
    if (node.id === UNDERLAY_ID) {
      setUnderlay((u) => (u ? { ...u, position: node.position } : u));
      return;
    }
    setConfig((cfg) => applyDrag(cfg, node));
  }, []);

  /* ---- selection ---- */
  const onSelectionChange = useCallback(
    ({ nodes: sn, edges: se }) => {
      if (!editing || builder) return;
      if (sn.length > 0) {
        const n = sn[0];
        if (n.id === UNDERLAY_ID) return;
        setSelection({ kind: groupIds.has(n.id) ? "group" : "node", id: n.id });
      } else if (se.length > 0) {
        setSelection({ kind: "edge", id: se[0].id });
      } else {
        setSelection(null);
      }
    },
    [editing, builder, groupIds]
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
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const t = document.activeElement?.tagName;
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
      if (editing && !builder && selection) {
        e.preventDefault();
        confirmDelete();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, builder, selection, confirmDelete]);

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
      if (node.type === "grouper") return showTip(evt, node.data.label, "group", node.data.attrs);
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
      setConfig(parsed);
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
        const u = URL.createObjectURL(blob);
        const aEl = document.createElement("a");
        aEl.href = u;
        aEl.download = `${exportName()}.png`;
        aEl.click();
        URL.revokeObjectURL(u);
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
      setConfig(baseline);
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

  return (
    <div className="frame" onMouseMove={onMouseMove}>
      {editing && (
        <Palette
          onAdd={(t) => doAddNode(t, centerPos())}
          onAddGroup={() => doAddGroup(centerPos())}
          onUnderlay={loadUnderlay}
          hasUnderlay={!!underlay}
        />
      )}

      <div className={`canvas-pane ${builder ? "builder-mode" : ""}`}>
        <ReactFlow
          nodes={nodes}
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
          nodesConnectable={editing && !builder}
          elementsSelectable={editing && !builder}
          connectionRadius={34}
          deleteKeyCode={null}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#c9cdc4" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="minimap" />
        </ReactFlow>

        {editing && !builder && selection && (
          <div className="sel-toolbar">
            <span className="sel-kind">{selection.kind}</span>
            <span className="sel-id">{selection.id}</span>
            {selection.kind === "edge" && (
              <button className="pp-mini" onClick={addWaypointAtMid} title="Add a routing point you can drag">
                + waypoint
              </button>
            )}
            <button className="sel-delete" onClick={confirmDelete} title="Delete (or press the Delete key)">
              Delete
            </button>
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
              Processes
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
                          className="pp-mini" title="Delete process"
                          onClick={() => {
                            if (window.confirm(`Delete process "${p.name}"?`)) {
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
                selection={selection}
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
                Drag shapes from the palette. Drag between port dots to connect. Click anything to edit
                it; double-click an edge to add a waypoint.
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
