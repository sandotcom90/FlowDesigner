import Ajv from "ajv";
import schema from "./schema.json";

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const structural = ajv.compile(schema);

/* Small Levenshtein for "did you mean" suggestions */
function distance(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return d[m][n];
}

function didYouMean(id, candidates) {
  let best = null, bestD = Infinity;
  for (const c of candidates) {
    const dd = distance(id.toLowerCase(), c.toLowerCase());
    if (dd < bestD) { bestD = dd; best = c; }
  }
  return best && bestD <= Math.max(2, Math.floor(id.length / 3))
    ? ` — did you mean "${best}"?`
    : "";
}

function findDuplicates(ids) {
  const seen = new Set(), dups = new Set();
  for (const id of ids) (seen.has(id) ? dups : seen).add(id);
  return [...dups];
}

/**
 * Validates a parsed config object.
 * Returns { ok: boolean, errors: string[] }.
 */
export function validateConfig(cfg) {
  const errors = [];

  if (!structural(cfg)) {
    for (const e of structural.errors) {
      const where = e.instancePath || "(root)";
      const extra =
        e.keyword === "additionalProperties"
          ? ` ("${e.params.additionalProperty}" is not a recognized property)`
          : e.keyword === "enum"
          ? ` (allowed: ${e.params.allowedValues.join(", ")})`
          : "";
      errors.push(`Schema — ${where}: ${e.message}${extra}`);
    }
    return { ok: false, errors };
  }

  const nodeIds = cfg.nodes.map((n) => n.id);
  const edgeIds = cfg.edges.map((e) => e.id);
  const groupIds = (cfg.groups || []).map((g) => g.id);
  const procIds = cfg.processes.map((p) => p.id);

  for (const [what, ids] of [
    ["node", nodeIds], ["edge", edgeIds], ["group", groupIds], ["process", procIds]
  ]) {
    for (const d of findDuplicates(ids)) errors.push(`Duplicate ${what} id "${d}".`);
  }

  const nodeSet = new Set(nodeIds);
  const edgeSet = new Set(edgeIds);
  const groupSet = new Set(groupIds);

  cfg.nodes.forEach((n) => {
    if (n.group && !groupSet.has(n.group))
      errors.push(`Node "${n.id}" references unknown group "${n.group}"${didYouMean(n.group, groupIds)}`);
  });

  cfg.edges.forEach((e) => {
    if (!nodeSet.has(e.source))
      errors.push(`Edge "${e.id}" source "${e.source}" is not a known node${didYouMean(e.source, nodeIds)}`);
    if (!nodeSet.has(e.target))
      errors.push(`Edge "${e.id}" target "${e.target}" is not a known node${didYouMean(e.target, nodeIds)}`);
  });

  const edgeById = Object.fromEntries(cfg.edges.map((e) => [e.id, e]));
  cfg.processes.forEach((p) => {
    const members = new Set(p.nodes);
    p.nodes.forEach((id) => {
      if (!nodeSet.has(id))
        errors.push(`Process "${p.id}" lists unknown node "${id}"${didYouMean(id, nodeIds)}`);
    });
    (p.edges || []).forEach((id) => {
      if (!edgeSet.has(id)) {
        errors.push(`Process "${p.id}" lists unknown edge "${id}"${didYouMean(id, edgeIds)}`);
      } else {
        const e = edgeById[id];
        for (const end of [e.source, e.target])
          if (nodeSet.has(end) && !members.has(end))
            errors.push(
              `Process "${p.id}" includes edge "${id}" but not its endpoint node "${end}" — add the node to the process or remove the edge.`
            );
      }
    });
  });

  return { ok: errors.length === 0, errors };
}
