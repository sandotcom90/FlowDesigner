import React from "react";
import { Handle, Position, NodeResizer, useReactFlow } from "@xyflow/react";

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

/* three points per side: 25% / 50% / 75% */
const PORT_DEFS = SIDES.flatMap(([side, pos]) => {
  const horiz = side === "t" || side === "b";
  return [
    [`${side}1`, pos, { [horiz ? "left" : "top"]: "25%" }],
    [side, pos, {}],
    [`${side}3`, pos, { [horiz ? "left" : "top"]: "75%" }]
  ];
});

function Ports({ editable }) {
  return (
    <>
      {PORT_DEFS.map(([id, pos, style]) => (
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
      <Ports editable={data.editable} />
    </div>
  );
}

export function GroupNode({ data, selected }) {
  const { getZoom } = useReactFlow();
  const [drag, setDrag] = React.useState(null); /* {i, pt, isNew} */
  const dragRef = React.useRef(null);

  const basePts = data.points;
  const poly = Array.isArray(basePts) && basePts.length >= 3;
  const pts = React.useMemo(() => {
    if (!poly) return null;
    if (!drag) return basePts;
    const c = basePts.slice();
    if (drag.isNew) c.splice(drag.i + 1, 0, drag.pt);
    else c[drag.i] = drag.pt;
    return c;
  }, [poly, basePts, drag]);

  const editingV = !!(data.editable && selected && poly);

  const beginVertex = (i, isNew, startPt) => (e) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { sx: e.clientX, sy: e.clientY, orig: startPt, zoom: getZoom() || 1 };
    setDrag({ i, isNew, pt: startPt });
  };
  const moveVertex = (e) => {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    setDrag((cur) =>
      cur && {
        ...cur,
        pt: { x: d.orig.x + (e.clientX - d.sx) / d.zoom, y: d.orig.y + (e.clientY - d.sy) / d.zoom }
      }
    );
  };
  const endVertex = (commit) => (e) => {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    dragRef.current = null;
    setDrag((cur) => {
      if (cur && commit) {
        if (cur.isNew) data.onVertexInsert?.(cur.i, cur.pt);
        else data.onVertexMove?.(cur.i, cur.pt);
      }
      return null;
    });
  };

  const w = data.size?.w || 0, h = data.size?.h || 0;
  const ghosts =
    editingV && !drag && pts
      ? pts.map((p, i) => {
          const q = pts[(i + 1) % pts.length];
          return { i, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        })
      : [];

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
      <span className="group-label" style={{ fontSize: data.fontSize }}>{data.label}</span>
      {editingV &&
        pts.map((p, i) => (
          <div
            key={`v${i}`}
            className="gv-dot nodrag nopan"
            style={{ left: p.x, top: p.y }}
            title="Drag to move corner — double-click to remove"
            onPointerDown={beginVertex(i, false, p)}
            onPointerMove={moveVertex}
            onPointerUp={endVertex(true)}
            onPointerCancel={endVertex(false)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              data.onVertexRemove?.(i);
            }}
          />
        ))}
      {ghosts.map((g) => (
        <div
          key={`g${g.i}`}
          className="gv-ghost nodrag nopan"
          style={{ left: g.x, top: g.y }}
          title="Drag to add a corner here"
          onPointerDown={beginVertex(g.i, true, { x: g.x, y: g.y })}
          onPointerMove={moveVertex}
          onPointerUp={endVertex(true)}
          onPointerCancel={endVertex(false)}
        />
      ))}
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
