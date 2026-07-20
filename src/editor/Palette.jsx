import React, { useRef } from "react";
import { NODE_TYPES, TYPE_LABEL } from "./ops";

/* Miniature previews of each shape for the palette buttons. */
function Mini({ type }) {
  const w = 40, h = 24;
  const s = { className: "mini-shape" };
  switch (type) {
    case "database":
      return (
        <svg width={w} height={h} viewBox="0 0 40 24">
          <path d="M 2 6 V 18 A 18 6 0 0 0 38 18 V 6" {...s} />
          <ellipse cx="20" cy="6" rx="18" ry="4.5" {...s} />
        </svg>
      );
    case "broker":
      return (
        <svg width={w} height={h} viewBox="0 0 40 24">
          <polygon points="9,2 31,2 38,12 31,22 9,22 2,12" {...s} />
        </svg>
      );
    case "etl":
      return (
        <svg width={w} height={h} viewBox="0 0 40 24">
          <polygon points="2,2 32,2 38,12 32,22 2,22 8,12" {...s} />
        </svg>
      );
    case "ui":
      return (
        <svg width={w} height={h} viewBox="0 0 40 24">
          <rect x="2" y="2" width="36" height="20" rx="3" {...s} />
          <line x1="2" y1="8" x2="38" y2="8" className="mini-shape" />
        </svg>
      );
    case "auth":
      return (
        <svg width={w} height={h} viewBox="0 0 40 24">
          <path d="M 20 3 l 8 4 v 6 q 0 6 -8 8 q -8 -2 -8 -8 v -6 z" {...s} />
        </svg>
      );
    case "file":
      return (
        <svg width={w} height={h} viewBox="0 0 40 24">
          <path d="M 6 2 H 28 L 34 8 V 22 H 6 Z" {...s} />
          <path d="M 28 2 V 8 H 34" {...s} />
        </svg>
      );
    case "user":
      return (
        <svg width={w} height={h} viewBox="0 0 40 24">
          <rect x="2" y="2" width="36" height="20" rx="10" {...s} />
          <circle cx="15" cy="9" r="3" {...s} />
          <path d="M 9 18 a 6 5 0 0 1 12 0" {...s} />
        </svg>
      );
    case "external":
      return (
        <svg width={w} height={h} viewBox="0 0 40 24">
          <rect x="2" y="2" width="36" height="20" rx="3" className="mini-shape mini-dashed" />
        </svg>
      );
    default:
      return (
        <svg width={w} height={h} viewBox="0 0 40 24">
          <rect x="2" y="2" width="36" height="20" rx="6" {...s} />
        </svg>
      );
  }
}

export default function Palette({ onAdd, onAddGroup, onUnderlay, hasUnderlay }) {
  const fileRef = useRef(null);
  return (
    <div className="palette">
      <div className="palette-label">Add</div>
      {NODE_TYPES.map((t) => (
        <button
          key={t}
          className="palette-item"
          title={`${TYPE_LABEL[t]} — drag onto the canvas or click to add`}
          draggable
          onDragStart={(e) => e.dataTransfer.setData("application/diagram-type", t)}
          onClick={() => onAdd(t)}
        >
          <Mini type={t} />
          <span>{TYPE_LABEL[t]}</span>
        </button>
      ))}
      <button
        className="palette-item"
        title="Container box — drag onto the canvas or click to add"
        draggable
        onDragStart={(e) => e.dataTransfer.setData("application/diagram-type", "__group")}
        onClick={onAddGroup}
      >
        <svg width="40" height="24" viewBox="0 0 40 24">
          <rect x="2" y="2" width="36" height="20" rx="4" className="mini-shape mini-group" />
        </svg>
        <span>Container</span>
      </button>
      <div className="palette-sep" />
      <button className="palette-item" title="Load an image to trace over" onClick={() => fileRef.current?.click()}>
        <svg width="40" height="24" viewBox="0 0 40 24">
          <rect x="2" y="2" width="36" height="20" rx="3" className="mini-shape" />
          <circle cx="12" cy="10" r="3" className="mini-shape" />
          <path d="M 6 20 L 16 12 L 24 18 L 30 14 L 36 20" className="mini-shape" fill="none" />
        </svg>
        <span>{hasUnderlay ? "Replace" : "Trace"}</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUnderlay(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
