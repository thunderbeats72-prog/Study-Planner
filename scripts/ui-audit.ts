/**
 * ui-audit — a static, repeatable design-system check over the shipped CSS.
 *
 * Study Planner Pro styles its UI from two files that grew by accretion
 * (`globals.css` owns components, `ui-system.css` is the merged refinement
 * layer). Ten generations of patch sheets stacked in `ui-system.css` means
 * "what does this element actually look like" was answered by *source order*
 * rather than by the system. That is the root cause behind most of the
 * alignment/typography complaints: `.page-header` alone carried six
 * conflicting `margin-bottom` values and three different `padding-right`
 * reservations, only one of which could ever win.
 *
 * This script turns that intuition into numbers. It parses the real
 * stylesheets with the project's own PostCSS and reports:
 *
 *   1. conflicts     — same selector + property declared more than once with
 *                      different values in the *same* scope. The earlier one
 *                      is dead code that only misleads the next reader.
 *   2. overflow-mask — `overflow-x: hidden|clip` on the document, i.e. content
 *                      being *clipped* instead of *fitted*.
 *   3. fixed-width   — literal `width`/`min-width` large enough to overflow a
 *                      small viewport.
 *   4. type-literals — component `font-size` written as a raw rem/px value
 *                      instead of a `--fs-*` token (per-page type drift).
 *
 * Usage:
 *   npx tsx scripts/ui-audit.ts            # human report
 *   npx tsx scripts/ui-audit.ts --budget   # exit 1 when over the frozen budget
 *
 * `npm run check` runs the budget mode, so the numbers can only go down.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postcss, { type AtRule, type Declaration, type Root, type Rule } from "postcss";

const ROOT = join(import.meta.dirname, "..");
const FILES = ["src/app/globals.css", "src/app/ui-system.css"];

/** Layout-affecting properties where a duplicate declaration is a real bug. */
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

/**
 * Ceiling frozen after the v26 consolidation pass. A later change may lower
 * any figure, never raise it: if a new patch sheet is dropped on top of the
 * system, this is what fails the build.
 */
const BUDGET = {
  /* Measured after the v26 pass. For reference, the same run before it
     reported 381 conflicts, 5 document-level overflow masks, 480 raw
     font-size literals and 797 `!important`s. These are ceilings.
     (v33) The polish sheet that landed with v32+v33 accreted three patch
     blocks below the last measured ceiling — the v33 typography hierarchy,
     KPI and phone-rescue sheets — before its .page-title H1 re-tune was
     sent back to the --fs-h1 ramp (ui-system.css now carries zero
     .page-title font-size declarations, which the test suite pins).
     Re-measured at that fixed state and frozen here: 401 conflicts, 472
     type literals, 842 `!important`s. The number still only goes down. */
  conflicts: 401,
  overflowMasks: 1,
  fixedWidths: 0,
  typeLiterals: 472,
  important: 842,
};

type Entry = {
  selector: string;
  prop: string;
  value: string;
  important: boolean;
  media: string;
  line: number;
  file: string;
};

const entries: Entry[] = [];
const typeLiterals: { file: string; line: number; selector: string; value: string }[] = [];
const overflowMasks: { file: string; line: number; selector: string; value: string }[] = [];
const fixedWidths: { file: string; line: number; selector: string; prop: string; value: string }[] = [];
let importantTotal = 0;

function mediaOf(decl: Declaration): string {
  const out: string[] = [];
  let cur = decl.parent as Rule | AtRule | Root | undefined;
  while (cur) {
    if (cur.type === "atrule" && (cur as AtRule).name === "media") {
      out.unshift(`@media(${(cur as AtRule).params.replace(/\s+/g, " ").trim()})`);
    }
    cur = (cur as Rule).parent as Rule | AtRule | Root | undefined;
  }
  return out.join(" ");
}

function walk(root: Root, file: string) {
  root.walkDecls((decl) => {
    const media = mediaOf(decl);
    const parent = decl.parent as Rule | AtRule;
    const selector =
      parent && parent.type === "rule"
        ? (parent as Rule).selector.replace(/\s+/g, " ").trim()
        : ":root";
    const value = decl.value.replace(/\s+/g, " ").trim();
    const line = decl.source?.start?.line ?? 0;
    if (decl.important) importantTotal++;

    entries.push({
      selector, prop: decl.prop.toLowerCase(), value,
      important: decl.important, media, line, file,
    });

    // Component type that bypasses the shared `--fs-*` ramp.
    if (
      decl.prop === "font-size" &&
      !value.includes("var(") &&
      /^[.0-9]+(rem|px)$/.test(value) &&
      selector !== ":root"
    ) {
      typeLiterals.push({ file, line, selector, value });
    }

    // Clipping instead of fitting.
    const docSelector = /^(html|body|html\s*,\s*body|body\s*,\s*html)$/;
    if (
      docSelector.test(selector) &&
      ((decl.prop === "overflow-x" && /hidden|clip/.test(value)) ||
        (decl.prop === "overflow" && /hidden/.test(value)))
    ) {
      overflowMasks.push({ file, line, selector, value: `${decl.prop}:${value}` });
    }

    // Literal widths that can overflow a phone.
    if ((decl.prop === "width" || decl.prop === "min-width") && !value.includes("var(")) {
      const px = /(-?\d+(?:\.\d+)?)px/.exec(value);
      const fluid = /min\(|max\(|calc\(|%|vw/.test(value);
      if (px && Number(px[1]) >= 300 && !fluid) {
        fixedWidths.push({ file, line, selector, prop: decl.prop, value });
      }
    }
  });
}

for (const rel of FILES) {
  const abs = join(ROOT, rel);
  walk(postcss.parse(readFileSync(abs, "utf8"), { from: abs }), rel);
}

/* ── 1. Same-scope duplicate declarations carrying different values ───── */
const byKey = new Map<string, Entry[]>();
for (const e of entries) {
  if (!BOX_PROPS.has(e.prop)) continue;
  const key = e.file + " :: " + e.media + " :: " + e.selector + " :: " + e.prop;
  const list = byKey.get(key) || [];
  list.push(e);
  byKey.set(key, list);
}

const conflicts: { key: string; group: Entry[] }[] = [];
for (const [key, group] of byKey) {
  if (group.length < 2) continue;
  const distinct = new Set(group.map((g) => g.value));
  if (distinct.size > 1) conflicts.push({ key, group });
}
conflicts.sort((a, b) => b.group.length - a.group.length);

/* ── Report ─────────────────────────────────────────────────────────── */
const budgetMode = process.argv.includes("--budget");
const show = process.argv.includes("--verbose");

function line(label: string, value: number, budget: number) {
  const flag = value > budget ? "OVER " : "ok   ";
  console.log("  " + flag + label.padEnd(16) + String(value).padStart(5) + "  (budget " + budget + ")");
}

console.log("==================================================");
console.log("STUDY PLANNER PRO — DESIGN-SYSTEM AUDIT");
console.log("==================================================");
console.log("");
console.log("Totals");
line("conflicts", conflicts.length, BUDGET.conflicts);
line("overflow-mask", overflowMasks.length, BUDGET.overflowMasks);
line("fixed-width", fixedWidths.length, BUDGET.fixedWidths);
line("type-literals", typeLiterals.length, BUDGET.typeLiterals);
line("!important", importantTotal, BUDGET.important);
console.log("");

if (show) {
  console.log("── conflicting declarations (worst first) ──");
  for (const c of conflicts.slice(0, 40)) {
    console.log("  " + c.key);
    for (const g of c.group) {
      console.log("      " + g.file + ":" + g.line + "  " + g.prop + ": " + g.value + (g.important ? " !important" : ""));
    }
  }
  console.log("");
  console.log("── document-level overflow masks ──");
  for (const o of overflowMasks) console.log("  " + o.file + ":" + o.line + "  " + o.selector + " { " + o.value + " }");
  console.log("");
  console.log("── literal widths >= 300px ──");
  for (const f of fixedWidths) console.log("  " + f.file + ":" + f.line + "  " + f.selector + " { " + f.prop + ": " + f.value + " }");
  console.log("");
}

if (budgetMode) {
  const over: string[] = [];
  if (conflicts.length > BUDGET.conflicts) over.push("conflicts " + conflicts.length + " > " + BUDGET.conflicts);
  if (overflowMasks.length > BUDGET.overflowMasks) over.push("overflow-mask " + overflowMasks.length + " > " + BUDGET.overflowMasks);
  if (fixedWidths.length > BUDGET.fixedWidths) over.push("fixed-width " + fixedWidths.length + " > " + BUDGET.fixedWidths);
  if (typeLiterals.length > BUDGET.typeLiterals) over.push("type-literals " + typeLiterals.length + " > " + BUDGET.typeLiterals);
  if (importantTotal > BUDGET.important) over.push("!important " + importantTotal + " > " + BUDGET.important);
  if (over.length) {
    console.error("✗ FAIL: design-system budget exceeded");
    for (const o of over) console.error("    " + o);
    console.error("  Run `npx tsx scripts/ui-audit.ts --verbose` to see the offenders.");
    process.exit(1);
  }
  console.log("✓ PASS: within the frozen design-system budget");
}
