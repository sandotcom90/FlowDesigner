import React, { useRef, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, useReactFlow } from "@xyflow/react";

/* Polyline through absolute waypoints with rounded corners. */
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

function at(p) {
  return { transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)` };
}

/*
 * Waypoint dragging design:
 * - Dragging is a LOCAL preview only (component state); the config is written
 *   exactly once, on release. No global updates happen while the pointer moves.
 * - All pointer events during a drag are captured by one persistent, invisible
 *   "puck" element that lives for the lifetime of the edge, so the drag always
 *   ends cleanly (pointerup / pointercancel / lost capture) even if released
 *   outside the window — and regardless of dots mounting/unmounting under it.
 */
export default function WaypointEdge(props) {
  const {
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
    data = {}, markerEnd, markerStart, style, selected
  } = props;
  const { screenToFlowPosition } = useReactFlow();
  const puckRef = useRef(null);
  const [drag, setDrag] = useState(null); /* { index, pos, isNew } */

  const baseWps = data.waypoints || [];

  /* apply the in-progress drag as a preview */
  let wps = baseWps;
  if (drag) {
    wps = baseWps.slice();
    if (drag.isNew) wps.splice(drag.index, 0, drag.pos);
    else wps[drag.index] = drag.pos;
  }

  const hasWps = wps.length > 0;
  const pts = [{ x: sourceX, y: sourceY }, ...wps, { x: targetX, y: targetY }];

  let path, labelX, labelY;
  if (hasWps) {
    path = roundedPath(pts);
    const midA = pts[Math.floor(pts.length / 2) - 1];
    const midB = pts[Math.ceil(pts.length / 2)];
    labelX = (midA.x + midB.x) / 2;
    labelY = (midA.y + midB.y) / 2;
  } else {
    [path, labelX, labelY] = getSmoothStepPath({
      sourceX, sourceY, sourcePosition,
      targetX, targetY, targetPosition,
      borderRadius: 10
    });
  }

  const editing = selected && data.editable;

  const beginDrag = (spec) => (e) => {
    if (drag) return;
    e.stopPropagation();
    e.preventDefault();
    setDrag(spec);
    /* route every subsequent pointer event to the persistent puck */
    try {
      puckRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported — pointermove/up on the puck still won't fire,
         so fall back to window listeners that self-remove */
      const move = (ev) =>
        setDrag((d) => d && { ...d, pos: screenToFlowPosition({ x: ev.clientX, y: ev.clientY }) });
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        setDrag((d) => {
          if (d) commit(d);
          return null;
        });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    }
  };

  const commit = (d) => {
    if (d.isNew) data.onWaypointInsertAt?.(d.index, d.pos);
    else data.onWaypointMove?.(d.index, d.pos);
  };

  const puckMove = (e) => {
    if (!drag) return;
    e.stopPropagation();
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setDrag((d) => (d ? { ...d, pos } : d));
  };
  const puckEnd = (commitIt) => (e) => {
    if (!drag) return;
    e.stopPropagation();
    if (commitIt) commit(drag);
    setDrag(null);
  };

  /* ghost dots: one per segment; grabbing one creates a bend right there */
  const ghosts =
    editing && !drag
      ? hasWps
        ? pts.slice(0, -1).map((p, i) => ({
            i,
            x: (p.x + pts[i + 1].x) / 2,
            y: (p.y + pts[i + 1].y) / 2
          }))
        : [{ i: 0, x: labelX, y: labelY }]
      : [];

  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} markerStart={markerStart} style={style} />
      {(data.label || editing) && (
        <EdgeLabelRenderer>
          {data.label && (
            <div
              className={`edge-label ${data.dimmed ? "edge-label-dim" : ""}`}
              style={{
                ...at({ x: labelX, y: labelY }),
                color: data.lit ? style?.stroke : undefined,
                fontSize: data.fontSize
              }}
            >
              {data.label}
            </div>
          )}
          {editing && (
            <div
              ref={puckRef}
              className="wp-puck nodrag nopan"
              onPointerMove={puckMove}
              onPointerUp={puckEnd(true)}
              onPointerCancel={puckEnd(false)}
              onLostPointerCapture={puckEnd(true)}
            />
          )}
          {ghosts.map((g) => (
            <div
              key={`g${g.i}`}
              className="wp-ghost nodrag nopan"
              title="Drag to bend the line here"
              style={at(g)}
              onPointerDown={beginDrag({ index: g.i, pos: { x: g.x, y: g.y }, isNew: true })}
            />
          ))}
          {editing &&
            wps.map((p, i) => (
              <div
                key={`w${i}`}
                className={`wp-dot nodrag nopan ${drag && drag.index === i ? "wp-dragging" : ""}`}
                title="Drag to move; double-click to remove"
                style={at(p)}
                onPointerDown={drag ? undefined : beginDrag({ index: i, pos: { x: p.x, y: p.y }, isNew: false })}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (!drag) data.onWaypointRemove?.(i);
                }}
              />
            ))}
        </EdgeLabelRenderer>
      )}
    </>
  );
}
