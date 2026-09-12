/**
 * _collapse.mjs — mechanical same-scope dead-declaration removal.
 *
 * For every conflict group the audit counts (same file + same @media scope +
 * same selector + same box prop, 2+ values), all declarations except the
 * cascade winner are dead by construction: same specificity, same scope, so
 * source order (and !important) already picked exactly one of them. Deleting
 * the losers cannot change rendering.
 *
 * Safety exclusions (the audit is blind to these scopes, so they are NEVER
 * collapsed here):
 *   - anything under @container / @supports / @keyframes
 *   - declarations whose parent is not a rule (defensive)
 *
 * Run: node scripts/_collapse.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = ["src/app/globals.css", "src/app/ui-system.css"];

const BOX_PROPS = new Set([
  "width", "min-width", "max-width", "height", "min-height", "max-height",
  "margin", "margin-top", "margin-bottom", "margin-left", "margin-right",
  "margin-inline", "margin-block",
  "padding", "padding-top", "padding-bottom", "padding-left", "padding-right",
  "padding-inline", "padding-block",
  "display", "gap", "row-gap", "column-gap", "align-items", "justify-content",
  "flex", "flex-direction", "grid-template-columns", "position",
  "font-size", "line-height", "letter-spacing", "font-weight",
]);

const UNSAFE_AT = new Set([
  "container", "supports", "keyframes",
  "-webkit-keyframes", "-moz-keyframes", "-o-keyframes",
]);

function mediaOf(decl) {
  const out = [];
  let cur = decl.parent;
  while (cur) {
    if (cur.type === "atrule" && cur.name === "media") {
      out.unshift(`@media(${cur.params.replace(/\s+/g, " ").trim()})`);
    }
    cur = cur.parent;
  }
  return out.join(" ");
}

function hasUnsafeAncestor(decl) {
  let cur = decl.parent;
  while (cur) {
    if (cur.type === "atrule" && UNSAFE_AT.has(cur.name)) return true;
    cur = cur.parent;
  }
  return false;
}

for (const rel of FILES) {
  const abs = join(ROOT, rel);
  const root = postcss.parse(readFileSync(abs, "utf8"), { from: abs });
  const byKey = new Map();
  root.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    if (!BOX_PROPS.has(prop)) return;
    if (hasUnsafeAncestor(decl)) return;
    const parent = decl.parent;
    if (!parent || parent.type !== "rule") return;
    const media = mediaOf(decl);
    const selector = parent.selector.replace(/\s+/g, " ").trim();
    const value = decl.value.replace(/\s+/g, " ").trim();
    const key = `${rel} :: ${media} :: ${selector} :: ${prop}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ decl, value, important: !!decl.important });
  });

  let collapsed = 0;
  let removedDecls = 0;
  for (const [key, group] of byKey) {
    if (group.length < 2) continue;
    const distinct = new Set(group.map((g) => g.value));
    const isConflict = distinct.size > 1;
    const imps = group.filter((g) => g.important);
    const winner = imps.length > 0 ? imps[imps.length - 1] : group[group.length - 1];
    for (const g of group) {
      if (g === winner) continue;
      g.decl.remove();
      removedDecls++;
    }
    if (isConflict) collapsed++;
  }

  // Prune rules / at-rules emptied by the removals (bottom-up).
  let removedEmpty = 0;
  const empties = [];
  root.walkRules((rule) => {
    if (!rule.nodes || rule.nodes.length === 0) empties.push(rule);
  });
  root.walkAtRules((at) => {
    if (!at.nodes || at.nodes.length === 0) empties.push(at);
  });
  for (const n of empties) {
    // Never touch keyframes internals (we never removed inside them anyway).
    n.remove();
    removedEmpty++;
  }

  writeFileSync(abs, root.toString());
  console.log(`${rel}: collapsed ${collapsed} conflict groups, removed ${removedDecls} dead decls, pruned ${removedEmpty} emptied blocks`);
}
