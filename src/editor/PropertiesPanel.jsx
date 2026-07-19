import React, { useEffect, useState } from "react";
import { NODE_TYPES, TYPE_LABEL, coerceAttr } from "./ops";

function Field({ label, children }) {
  return (
    <label className="pp-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function IdField({ value, onRename }) {
  const [draft, setDraft] = useState(value);
  const [err, setErr] = useState(null);
  useEffect(() => { setDraft(value); setErr(null); }, [value]);
  const commit = () => {
    if (draft === value) return;
    const e = onRename(draft);
    if (e) { setErr(e); setDraft(value); }
    else setErr(null);
  };
  return (
    <Field label="id">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
        spellCheck={false}
      />
      {err && <div className="pp-err">{err}</div>}
    </Field>
  );
}

function AttrsEditor({ attrs, onChange, idKey }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    setRows(Object.entries(attrs || {}).map(([k, v]) => ({ k, v: String(v) })));
  }, [idKey]); // reset only when a different element is selected
  const commit = (nextRows) => {
    setRows(nextRows);
    const obj = {};
    nextRows.forEach(({ k, v }) => {
      if (k.trim()) obj[k.trim()] = coerceAttr(v);
    });
    onChange(Object.keys(obj).length ? obj : undefined);
  };
  return (
    <div className="pp-attrs">
      <div className="pp-attrs-head">
        <span>attributes</span>
        <button className="pp-mini" onClick={() => commit([...rows, { k: "", v: "" }])}>+ add</button>
      </div>
      {rows.length === 0 && <div className="pp-attrs-empty">none — shown in the hover tooltip</div>}
      {rows.map((r, i) => (
        <div className="pp-attr-row" key={i}>
          <input
            placeholder="key"
            value={r.k}
            spellCheck={false}
            onChange={(e) => {
              const n = rows.slice(); n[i] = { ...r, k: e.target.value }; setRows(n);
            }}
            onBlur={() => commit(rows)}
          />
          <input
            placeholder="value"
            value={r.v}
            spellCheck={false}
            onChange={(e) => {
              const n = rows.slice(); n[i] = { ...r, v: e.target.value }; setRows(n);
            }}
            onBlur={() => commit(rows)}
          />
          <button className="pp-mini" onClick={() => commit(rows.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
    </div>
  );
}

const PORTS = [["t", "top"], ["r", "right"], ["b", "bottom"], ["l", "left"]];

export default function PropertiesPanel({ cfg, selection, onRename, onPatch, onDelete, onClearWaypoints, onReverse }) {
  if (!selection) return null;
  const { kind, id } = selection;
  const el =
    kind === "node" ? cfg.nodes.find((n) => n.id === id)
    : kind === "edge" ? cfg.edges.find((e) => e.id === id)
    : (cfg.groups || []).find((g) => g.id === id);
  if (!el) return null;

  return (
    <div className="pp">
      <div className="pp-head">
        <span className="pp-kind">{kind}</span>
        <button className="pp-delete" onClick={onDelete}>Delete</button>
      </div>

      <IdField value={el.id} onRename={onRename} />

      {kind !== "edge" && (
        <Field label="label">
          <input value={el.label} onChange={(e) => onPatch({ label: e.target.value })} />
        </Field>
      )}

      {kind === "node" && (
        <>
          <Field label="type">
            <select value={el.type} onChange={(e) => onPatch({ type: e.target.value })}>
              {NODE_TYPES.map((t) => (
                <option key={t} value={t}>{TYPE_LABEL[t]}</option>
              ))}
            </select>
          </Field>
          <Field label="group">
            <select
              value={el.group || ""}
              onChange={(e) => onPatch({ group: e.target.value || undefined })}
            >
              <option value="">— none —</option>
              {(cfg.groups || []).map((g) => (
                <option key={g.id} value={g.id}>{g.label}</option>
              ))}
            </select>
          </Field>
        </>
      )}

      {kind === "edge" && (
        <>
          <div className="pp-route">
            {el.source} → {el.target}
          </div>
          <Field label="label">
            <input value={el.label || ""} onChange={(e) => onPatch({ label: e.target.value || undefined })} />
          </Field>
          <div className="pp-two">
            <Field label="arrows">
              <select
                value={el.direction || "one"}
                onChange={(e) => onPatch({ direction: e.target.value === "both" ? "both" : undefined })}
              >
                <option value="one">one-way (&#8594;)</option>
                <option value="both">two-way (&#8596;)</option>
              </select>
            </Field>
            <Field label="direction">
              <button type="button" className="pp-reverse" onClick={onReverse}>&#8646; reverse</button>
            </Field>
          </div>
          <div className="pp-two">
            <Field label="from side">
              <select value={el.sourcePort || "r"} onChange={(e) => onPatch({ sourcePort: e.target.value })}>
                {PORTS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
            </Field>
            <Field label="to side">
              <select value={el.targetPort || "l"} onChange={(e) => onPatch({ targetPort: e.target.value })}>
                {PORTS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
            </Field>
          </div>
          <div className="pp-wp">
            <span>{el.waypoints?.length || 0} waypoint(s)</span>
            {el.waypoints?.length > 0 && (
              <button className="pp-mini" onClick={onClearWaypoints}>clear</button>
            )}
          </div>
          <div className="pp-hint">
            Drag the hollow dot on any segment of the selected line to bend it right there. Drag solid dots to move bends; double-click a solid dot to remove it.
          </div>
        </>
      )}

      {kind === "group" && (
        <div className="pp-two">
          <Field label="width">
            <input
              type="number" min="60" value={el.size.w}
              onChange={(e) => onPatch({ size: { ...el.size, w: Number(e.target.value) || el.size.w } })}
            />
          </Field>
          <Field label="height">
            <input
              type="number" min="40" value={el.size.h}
              onChange={(e) => onPatch({ size: { ...el.size, h: Number(e.target.value) || el.size.h } })}
            />
          </Field>
        </div>
      )}

      <Field label="font size (px)">
        <input
          type="number" min="6" max="48" step="0.5"
          value={el.fontSize ?? ""}
          placeholder={kind === "edge" ? "10.5 (default)" : kind === "group" ? "10.5 (default)" : "12.5 (default)"}
          onChange={(e) =>
            onPatch({ fontSize: e.target.value === "" ? undefined : Number(e.target.value) })
          }
        />
      </Field>

      <AttrsEditor
        attrs={el.attrs}
        idKey={`${kind}:${el.id}`}
        onChange={(attrs) => onPatch({ attrs })}
      />
    </div>
  );
}
