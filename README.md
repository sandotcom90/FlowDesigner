# Interface Diagram Viewer + Editor (v2)

Interactive, JSON-driven architecture diagram with per-process flow highlighting
and a full visual editor.

## Develop locally
    npm install
    npm run dev        # hot-reload dev server

## Build the portable single file
    npm run build      # dist/index.html — one self-contained file, no CDN calls

Open dist/index.html directly, host it on an internal web server, or attach it in
Confluence and embed via the iframe/HTML macro.

## View mode
- Click a process to highlight its flow; everything else fades.
- Hover nodes/edges/groups for tooltips showing all `attrs`.

## Edit mode (toggle at the top of the right sidebar)
- LEFT PALETTE: drag a shape (or Group) onto the canvas, or click to add at center.
  Display names: "Component" = JSON type `service`, "Process/Service" = JSON type `etl`.
- CONNECT: drag from a port dot on one node to any side of another node. The sides
  you use become sourcePort/targetPort in the JSON.
- SELECT anything to open the properties panel: rename ids (references update
  everywhere), edit labels, types, group membership, attach sides, and free-form
  attributes (shown in tooltips).
- WAYPOINTS: double-click an edge to add one; drag dots to reroute; double-click a
  dot to remove it; "clear" in the panel removes all.
- DELETE: button in the panel or the Delete key. Cascades are listed before you
  confirm (connected edges, process membership, emptied processes).
- PROCESSES: "+ new" starts the builder — click components/connections on the
  canvas to include them (live color preview), fill in name/color/description,
  save. Pencil edits an existing process; × deletes it.
- TRACE: load a PNG/JPG as a semi-transparent underlay, scale/lock it, and place
  nodes over your legacy diagram. The underlay is never exported.
- REVERT: discard everything since the last load/export.

Export JSON always validates first and is the source of truth for Git.
PNG and SVG buttons save the diagram as an image, rendered directly from the JSON
(not a screen capture): SVG is scalable/editable, PNG is a 2x rasterization of the
same SVG. Both include any active process highlight; the trace underlay is excluded.

## Config format (short version)
- `nodes[]`      id, type (ui|service|database|broker|etl|auth|file|external|user), label,
                 absolute position {x,y}, optional group, size, attrs
- `edges[]`      id, source, target, optional label, sourcePort/targetPort (t|r|b|l),
                 waypoints [{x,y}...], attrs
- `groups[]`     outer boxes: id, label, position, size
- `processes[]`  id, name, color, description, nodes[], optional edges[]
                 (if edges omitted: all edges between member nodes are included)
