import React from "react";
import { Handle, Position } from "@xyflow/react";

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

function Ports({ editable }) {
  return (
    <>
      {SIDES.map(([id, pos]) => (
        <React.Fragment key={id}>
          <Handle
            type="target" id={`t-${id}`} position={pos}
            className={`port port-t ${editable ? "port-t-live" : ""}`}
            isConnectable={!!editable}
            isConnectableStart={false}
          />
          <Handle
            type="source" id={`s-${id}`} position={pos}
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

export function ShapeNode({ data }) {
  const { w, h } = data.size;
  const paint = shapes[data.shape] || shapes.service;
  const labelPad = data.shape === "ui" ? 17 : data.shape === "database" ? 14 : 0;
  return (
    <div className="shape-node" style={{ width: w, height: h }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {paint(w, h)}
      </svg>
      <div className="node-label" style={{ paddingTop: labelPad, paddingLeft: data.shape === "auth" ? 22 : data.shape === "user" ? 26 : 0 }}>
        {data.label}
      </div>
      <Ports editable={data.editable} />
    </div>
  );
}

export function GroupNode({ data }) {
  return (
    <div className="group-node">
      <span className="group-label">{data.label}</span>
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
