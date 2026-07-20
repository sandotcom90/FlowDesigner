import React from "react";

export default function ProcessBuilder({ builder, setBuilder, cfg, onSave, onCancel }) {
  const internalEdges = cfg.edges.filter(
    (e) => builder.nodes.has(e.source) && builder.nodes.has(e.target)
  );
  const canSave = builder.name.trim().length > 0 && builder.nodes.size > 0;
  return (
    <div className="builder" style={{ "--pc": builder.color }}>
      <div className="builder-head">
        {builder.origId ? "Edit group" : "New group"}
      </div>
      <label className="pp-field">
        <span>name</span>
        <input
          autoFocus
          value={builder.name}
          onChange={(e) => setBuilder({ ...builder, name: e.target.value })}
        />
      </label>
      <label className="pp-field">
        <span>color</span>
        <div className="builder-color">
          <input
            type="color"
            value={builder.color}
            onChange={(e) => setBuilder({ ...builder, color: e.target.value })}
          />
          <code>{builder.color}</code>
        </div>
      </label>
      <label className="pp-field">
        <span>description</span>
        <textarea
          rows={3}
          value={builder.description}
          onChange={(e) => setBuilder({ ...builder, description: e.target.value })}
        />
      </label>
      <div className="builder-counts">
        <b>{builder.nodes.size}</b> node(s) · <b>{builder.edges.size}</b> edge(s) selected
      </div>
      <div className="builder-hint">
        Click components and connections on the canvas to add or remove them from this group.
      </div>
      <button
        className="btn subtle builder-auto"
        disabled={internalEdges.length === 0}
        onClick={() =>
          setBuilder({
            ...builder,
            edges: new Set([...builder.edges, ...internalEdges.map((e) => e.id)])
          })
        }
      >
        Include all edges between selected nodes
      </button>
      <div className="builder-actions">
        <button className="btn" disabled={!canSave} onClick={onSave}>Save group</button>
        <button className="btn subtle" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
