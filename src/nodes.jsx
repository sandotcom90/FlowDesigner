import React from "react";
import { Handle, Position, NodeResizer, useReactFlow } from "@xyflow/react";
import { labelAnchor, portsOfNode } from "./editor/ops";

export const DEFAULT_SIZE = { w: 150, h: 66 };
export const TYPE_SIZE = { database: { w: 120, h: 92 } };

export function nodeSize(n) {
  return n.size || TYPE_SIZE[n.type] || DEFAULT_SIZE;
}

/* One invisible source + target handle on each side. Edge JSON picks the
   side via sourcePort / targetPort (t, r, b, l). */
const SIDES = [
  ["t", Position.Top],
  ["r", Position.Right],
  ["b", Position.Bottom],
  ["l", Position.Left]
];

const POS_BY_SIDE = Object.fromEntries(SIDES);

function Ports({ editable, ports }) {
  const defs = React.useMemo(() => {
    return portsOfNode({ ports }).map(({ code, side, pct }) => {
      const horiz = side === "t" || side === "b";
      return [
        code,
        POS_BY_SIDE[side],
        pct === 50 ? {} : { [horiz ? "left" : "top"]: `${pct}%` }
      ];
    });
  }, [ports]);

  return (
    <>
      {defs.map(([id, pos, style]) => (
        <React.Fragment key={id}>
          <Handle
            type="target" id={`t-${id}`} position={pos} style={style}
            className={`port port-t ${editable ? "port-t-live" : ""}`}
            isConnectable={!!editable}
            isConnectableStart={false}
          />
          <Handle
            type="source" id={`s-${id}`} position={pos} style={style}
            className={`port port-s ${editable ? "port-live" : ""}`}
            isConnectable={!!editable}
            isConnectableEnd={false}
          />
        </React.Fragment>
      ))}
    </>
  );
}

/* Shape painters — each returns SVG children for a w x h viewBox. */
const shapes = {
  service: (w, h) => <rect x="1.5" y="1.5" width={w - 3} height={h - 3} rx="10" className="shape" />,

  ui: (w, h) => (
    <>
      <rect x="1.5" y="1.5" width={w - 3} height={h - 3} rx="6" className="shape" />
      <line x1="1.5" y1="17" x2={w - 1.5} y2="17" className="stroke" />
      <circle cx="11" cy="9.5" r="2.4" className="dot" />
      <circle cx="19" cy="9.5" r="2.4" className="dot" />
      <circle cx="27" cy="9.5" r="2.4" className="dot" />
    </>
  ),

  database: (w, h) => {
    const ry = 12;
    return (
      <>
        <path
          d={`M 1.5 ${ry} V ${h - ry} A ${w / 2 - 1.5} ${ry} 0 0 0 ${w - 1.5} ${h - ry} V ${ry}`}
          className="shape"
        />
        <ellipse cx={w / 2} cy={ry} rx={w / 2 - 1.5} ry={ry - 1.5} className="shape" />
      </>
    );
  },

  broker: (w, h) => {
    const c = 16;
    return (
      <polygon
        points={`${c},1.5 ${w - c},1.5 ${w - 1.5},${h / 2} ${w - c},${h - 1.5} ${c},${h - 1.5} 1.5,${h / 2}`}
        className="shape"
      />
    );
  },

  etl: (w, h) => {
    const n = 14;
    return (
      <polygon
        points={`1.5,1.5 ${w - n},1.5 ${w - 1.5},${h / 2} ${w - n},${h - 1.5} 1.5,${h - 1.5} ${n},${h / 2}`}
        className="shape"
      />
    );
  },

  auth: (w, h) => (
    <>
      <rect x="1.5" y="1.5" width={w - 3} height={h - 3} rx="10" className="shape" />
      <path
        d={`M 16 ${h / 2 - 9} l 7 -3.5 l 7 3.5 v 6 q 0 6.5 -7 9.5 q -7 -3 -7 -9.5 z`}
        className="glyph"
      />
    </>
  ),

  file: (w, h) => {
    const f = 16;
    return (
      <>
        <path
          d={`M 1.5 1.5 H ${w - f} L ${w - 1.5} ${f} V ${h - 1.5} H 1.5 Z`}
          className="shape"
        />
        <path d={`M ${w - f} 1.5 V ${f} H ${w - 1.5}`} className="stroke" fill="none" />
      </>
    );
  },

  external: (w, h) => (
    <rect x="1.5" y="1.5" width={w - 3} height={h - 3} rx="6" className="shape dashed" />
  ),

  user: (w, h) => (
    <>
      <rect x="1.5" y="1.5" width={w - 3} height={h - 3} rx={(h - 3) / 2} className="shape" />
      <circle cx="24" cy={h / 2 - 7} r="5.5" className="glyph" />
      <path d={`M 14 ${h / 2 + 12} a 10 8 0 0 1 20 0`} className="glyph" />
    </>
  )
};

export function ShapeNode({ data, selected, width, height }) {
  const w = Math.round(width ?? data.size.w);
  const h = Math.round(height ?? data.size.h);
  const paint = shapes[data.shape] || shapes.service;
  const labelPad = data.shape === "ui" ? 17 : data.shape === "database" ? 14 : 0;
  return (
    <div className="shape-node" style={{ width: w, height: h }}>
      <NodeResizer
        isVisible={!!(data.editable && selected)}
        minWidth={70}
        minHeight={40}
        onResizeEnd={(_e, p) => data.onResizeEnd?.(p)}
      />
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {paint(w, h)}
      </svg>
      <div
        className="node-label"
        style={{
          paddingTop: labelPad,
          paddingLeft: data.shape === "auth" ? 22 : data.shape === "user" ? 26 : 0,
          fontSize: data.fontSize
        }}
      >
        {data.label}
      </div>
      <Ports editable={data.editable} ports={data.ports} />
    </div>
  );
}

export function GroupNode({ data, selected }) {
  const { getZoom } = useReactFlow();
  const [ldrag, setLdrag] = React.useState(null);
  const ldragRef = React.useRef(null);
  const pts = data.points;
  const poly = Array.isArray(pts) && pts.length >= 3;
  const w = data.size?.w || 0, h = data.size?.h || 0;

  return (
    <div className={`group-node ${poly ? "group-node-poly" : ""}`}>
      {poly ? (
        <svg
          className="grp-svg"
          width="100%" height="100%"
          viewBox={`0 0 ${Math.max(1, w)} ${Math.max(1, h)}`}
          preserveAspectRatio="none"
        >
          <polygon points={pts.map((p) => `${p.x},${p.y}`).join(" ")} className="grp-poly" />
        </svg>
      ) : (
        <NodeResizer
          isVisible={!!(data.editable && selected)}
          minWidth={120}
          minHeight={80}
          onResizeEnd={(_e, p) => data.onResizeEnd?.(p)}
        />
      )}
      {(() => {
        const g = { points: pts, size: data.size, labelPos: data.labelPos };
        const a = ldrag ? { ...ldrag, center: true, width: 0 } : labelAnchor(g);
        const grab = !!data.editable;

        const begin = (e) => {
          e.stopPropagation();
          e.preventDefault();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          ldragRef.current = { sx: e.clientX, sy: e.clientY, ox: a.x, oy: a.y, zoom: getZoom() || 1 };
          setLdrag({ x: a.x, y: a.y });
        };
        const move = (e) => {
          const d = ldragRef.current;
          if (!d) return;
          e.stopPropagation();
          setLdrag({
            x: d.ox + (e.clientX - d.sx) / d.zoom,
            y: d.oy + (e.clientY - d.sy) / d.zoom
          });
        };
        const end = (commit) => (e) => {
          const d = ldragRef.current;
          if (!d) return;
          e.stopPropagation();
          ldragRef.current = null;
          setLdrag((cur) => {
            if (cur && commit) data.onLabelMove?.(cur);
            return null;
          });
        };

        const centered = a.center || !!ldrag;
        return (
          <span
            className={`group-label ${centered ? "group-label-in" : ""} ${grab ? "group-label-grab nodrag nopan" : ""}`}
            style={{
              fontSize: data.fontSize,
              ...(centered
                ? { left: a.x, top: a.y, maxWidth: a.width ? Math.max(40, a.width - 10) : undefined }
                : {})
            }}
            onPointerDown={grab ? begin : undefined}
            onPointerMove={grab ? move : undefined}
            onPointerUp={grab ? end(true) : undefined}
            onPointerCancel={grab ? end(false) : undefined}
            onDoubleClick={grab ? (e) => { e.stopPropagation(); data.onLabelMove?.(null); } : undefined}
            title={grab ? "Drag to move this label — double-click to reset" : undefined}
          >
            {data.label}
          </span>
        );
      })()}
    </div>
  );
}

export function UnderlayNode({ data }) {
  return (
    <img
      src={data.src}
      alt="traced diagram underlay"
      draggable={false}
      style={{
        width: data.w * data.scale,
        height: data.h * data.scale,
        opacity: data.opacity,
        display: "block",
        pointerEvents: "none",
        filter: "saturate(0.85)"
      }}
    />
  );
}

export function DrawPreviewNode({ data }) {
  const { pts, cursor, near } = data;
  const path = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const live = cursor ? `${path} ${cursor.x},${cursor.y}` : path;
  return (
    <svg className="draw-preview" width="1" height="1" style={{ overflow: "visible" }}>
      {pts.length >= 2 && <polygon points={live} className="dp-fill" />}
      <polyline points={live} className="dp-line" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? 7 : 4.5}
          className={i === 0 ? (near ? "dp-start dp-near" : "dp-start") : "dp-pt"} />
      ))}
    </svg>
  );
}
