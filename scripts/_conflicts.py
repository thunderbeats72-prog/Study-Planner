#!/usr/bin/env python3
"""Full conflict-group dump (all groups, not top-40) with importance flags,
to plan safe deletions. Mirrors scripts/ui-audit.ts grouping:
file :: media :: selector :: prop, distinct values > 1."""
import re, sys
from collections import defaultdict

FILES = ["src/app/globals.css", "src/app/ui-system.css"]
BOX_PROPS = {"width","min-width","max-width","height","min-height","max-height",
"margin","margin-top","margin-bottom","margin-left","margin-right","margin-inline","margin-block",
"padding","padding-top","padding-bottom","padding-left","padding-right","padding-inline","padding-block",
"display","gap","row-gap","column-gap","align-items","justify-content",
"flex","flex-direction","grid-template-columns","position",
"font-size","line-height","letter-spacing","font-weight"}

def strip_comments(t):
    return re.sub(r"/\*.*?\*/", " ", t, flags=re.S)

entries = []  # (file, media, selector, prop, value, important, line)
for f in FILES:
    with open(f) as fh:
        text = strip_comments(fh.read())
    # line map
    line_at = []
    ln = 1
    for ch in text:
        line_at.append(ln)
        if ch == "\n":
            ln += 1
    stack = []
    sel_buf = ""
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if ch == "{":
            header = re.sub(r"\s+", " ", sel_buf.strip())
            sel_buf = ""
            if header.startswith("@media"):
                stack.append(("media", header[6:].strip(), None))
            elif header.startswith("@"):
                stack.append(("at", header, None))
            else:
                stack.append(("rule", header, i+1))
            i += 1
            continue
        elif ch == "}":
            if stack:
                kind, a, b = stack.pop()
                if kind == "rule":
                    decls = text[b:i]
                    medias = " ".join("@media(%s)" % m for k, m, _ in stack if k == "media")
                    # split declarations (naive on ;)
                    for dm in re.finditer(r"([\w-]+)\s*:\s*([^;{}]+?)(!important)?\s*(;|$)", decls):
                        prop = dm.group(1).lower()
                        if prop not in BOX_PROPS:
                            continue
                        val = re.sub(r"\s+", " ", dm.group(2).strip())
                        imp = bool(dm.group(3))
                        # line approx: count newlines up to b + dm.start
                        entries.append((f, medias, a, prop, val, imp, line_at[min(b+dm.start(), len(line_at)-1)]))
            sel_buf = ""
            i += 1
            continue
        else:
            if stack and stack[-1][0] == "rule":
                pass
            else:
                sel_buf += ch
            i += 1

groups = defaultdict(list)
for e in entries:
    groups[(e[0], e[1], e[2], e[3])].append(e)

confs = [(k, v) for k, v in groups.items() if len({x[4] for x in v}) > 1]
confs.sort(key=lambda kv: -len(kv[1]))
print(f"TOTAL GROUPS: {len(confs)}")
filt = sys.argv[1] if len(sys.argv) > 1 else ""
for (f, m, s, p), v in confs:
    if filt and filt not in f + m + s + p:
        continue
    print(f"\n{f} :: {m or '(base)'} :: {s[:90]} :: {p}  [{len(v)} decls]")
    for e in v:
        print(f"    L{e[6]}  {e[4][:80]}{' !important' if e[5] else ''}")
