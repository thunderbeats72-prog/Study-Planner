/**
 * _collapse_important.mjs — delete dead `!important` declarations.
 *
 * Same cascade logic as _collapse.mjs, but for *any* property and *across*
 * both stylesheets: when the same @media scope + selector + property carries
 * two or more `!important` declarations, exactly one can ever win — the last
 * one in (stylesheet, source-order), because the specificity is identical.
 * Every earlier flag is dead weight that only inflates the audit's
 * `!important` total. Deleting the losers cannot change rendering.
 *
 * Safety exclusions (same as _collapse.mjs):
 *   - anything under @container / @supports / @keyframes
 *   - declarations whose parent is not a rule
 *
 * Run: node scripts/_collapse_important.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = ["src/app/globals.css", "src/app/ui-system.css"];

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

const order = { "src/app/globals.css": 0, "src/app/ui-system.css": 1 };
const roots = new Map();
const byKey = new Map();

for (const rel of FILES) {
  const abs = join(ROOT, rel);
  const root = postcss.parse(readFileSync(abs, "utf8"), { from: abs });
  roots.set(rel, { abs, root });
  root.walkDecls((decl) => {
    if (!decl.important) return;
    if (hasUnsafeAncestor(decl)) return;
    const parent = decl.parent;
    if (!parent || parent.type !== "rule") return;
    const selector = parent.selector.replace(/\s+/g, " ").trim();
    const key = `${mediaOf(decl)} :: ${selector} :: ${decl.prop.toLowerCase()}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ rel, decl, line: decl.source.start.line });
  });
}

let groups = 0;
let removed = 0;
for (const [key, list] of byKey) {
  if (list.length < 2) continue;
  groups++;
  list.sort((a, b) => order[a.rel] - order[b.rel] || a.line - b.line);
  const winner = list[list.length - 1];
  for (const g of list) {
    if (g === winner) continue;
    g.decl.remove();
    removed++;
  }
}

for (const [, { abs, root }] of roots) {
  const empties = [];
  root.walkRules((rule) => {
    if (!rule.nodes || rule.nodes.length === 0) empties.push(rule);
  });
  root.walkAtRules((at) => {
    if (!at.nodes || at.nodes.length === 0) empties.push(at);
  });
  for (const n of empties) n.remove();
  writeFileSync(abs, root.toString());
}
console.log(`collapsed ${groups} dead-!important groups, removed ${removed} flags`);
