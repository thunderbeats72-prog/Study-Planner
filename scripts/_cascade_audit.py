#!/usr/bin/env python3
"""Cascade report: for target selectors, list every rule setting target props,
in source order with enclosing @media context. Concatenates globals.css then
ui-system.css (the real import order). Strips comments first."""
import re, sys

FILES = ["src/app/globals.css", "src/app/ui-system.css"]
TARGETS = {
    ".page-title": ["font-size", "font-weight", "line-height", "letter-spacing"],
    ".page-subtitle": ["font-size", "font-weight", "line-height"],
    ".page-head-eyebrow": ["font-size", "font-weight", "letter-spacing"],
    ".kpi-value": ["font-size"],
    ".kpi-label": ["font-size"],
    ".task-card-title": ["font-size", "font-weight", "line-height"],
    ".task-card-subject": ["font-size", "font-weight"],
    ".task-subject-name": ["font-size"],
    ".brand-title": ["font-size", "font-weight"],
    ".brand-course": ["font-size"],
    ".ana-ring": ["width"],
    ".ring-figure": ["width", "display"],
    ".ring-svg": ["width"],
    ".seg-btn": ["font-size", "min-height"],
    ".subj-name": ["font-size"],
    ".topic-row-title": ["font-size"],
    ".page-header": ["display", "grid-template-columns", "padding-right"],
    ".page-header-scene": ["display", "width", "position"],
    ".ai-panel": ["width", "height", "right", "bottom", "left"],
    ".tracker-bar": ["display", "padding"],
    ".sp-select-btn": ["font-size"],
    ".card-title": ["font-size"],
    ".section-title": ["font-size"],
}

def strip_comments(css):
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)

def parse_rules(css, fname, start_line):
    """Yield (selector_text, decls, media_stack, line_no). Crude brace matcher."""
    # track line numbers
    lines = css.split("\n")
    # work on full text with index->line map
    idx_line = []
    pos = 0
    for i, ln in enumerate(lines, start_line):
        idx_line.append((pos, i))
        pos += len(ln) + 1
    def line_of(idx):
        import bisect
        starts = [p for p, _ in idx_line]
        j = bisect.bisect_right(starts, idx) - 1
        return idx_line[max(0, j)][1]

    media_stack = []
    i, n = 0, len(css)
    while i < n:
        # skip whitespace
        if css[i].isspace():
            i += 1
            continue
        if css.startswith("@media", i):
            m = re.match(r"@media\s*([^{]+)\{", css[i:])
            if m:
                media_stack.append(m.group(1).strip())
                i += m.end()
                continue
        if css[i] == "}":
            if media_stack:
                # could be end of media or rule; we handle rules separately
                pass
            i += 1
            continue
        # try rule: selector { decls }
        m = re.match(r"([^{}@]+)\{", css[i:])
        if m:
            sel = m.group(1).strip()
            j = i + m.end()
            depth = 1
            k = j
            while k < n and depth:
                if css[k] == "{":
                    depth += 1
                elif css[k] == "}":
                    depth -= 1
                k += 1
            decls = css[j:k-1]
            # check if this was actually @media close handling: if sel starts with @media handled above
            yield (sel, decls, list(media_stack), fname, line_of(i))
            i = k
            continue
        # closing brace of media
        if css[i] == "}":
            i += 1
            continue
        i += 1
    # NOTE: media_stack pop problem: this crude parser never pops. Fix: track with stack of positions.
    return

def parse_with_media(css, fname):
    """Proper-ish parser tracking @media nesting via brace stack."""
    css_nocomments = css
    # tokenize braces
    stack = []  # entries: ('media', query) or ('rule', selector, start_idx)
    i, n = 0, len(css_nocomments)
    out = []
    line = 1
    last_sel_start = 0
    buf_start = 0
    # simpler: iterate chars, maintain current selector text before {
    text = css_nocomments
    # precompute line numbers
    line_at = [1]*(n+1)
    for idx, ch in enumerate(text):
        line_at[idx] = line
        if ch == "\n":
            line += 1
    i = 0
    sel_buf = ""
    while i < n:
        ch = text[i]
        if ch == "{":
            header = sel_buf.strip()
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
                    medias = [m for k, m, _ in stack if k == "media"]
                    out.append((a, decls, medias, fname, line_at[b]))
            sel_buf = ""
            i += 1
            continue
        else:
            # accumulate selector text only when not inside a rule's decls... but decls also contain text.
            # We track: if top of stack is rule, chars go to decls (skip buf). else to sel_buf.
            if stack and stack[-1][0] == "rule":
                pass
            else:
                sel_buf += ch
            i += 1
            continue
    return out

def main():
    all_rules = []
    for f in FILES:
        with open(f) as fh:
            css = strip_comments(fh.read())
        all_rules.extend(parse_with_media(css, f))
    for target, props in TARGETS.items():
        print(f"\n{'='*100}\nTARGET {target}  props={props}\n{'='*100}")
        for (sel, decls, medias, fname, ln) in all_rules:
            # match exact selector in selector list (last compound equals target, no pseudo)
            parts = [p.strip() for p in sel.split(",")]
            hit = False
            for p in parts:
                # normalize: match if target appears as a full class token and selector has no pseudo beyond
                toks = re.findall(r"\.[\w-]+", p)
                if target in toks:
                    # exclude pseudo-element content rules unless they set our props anyway (keep, flag)
                    hit = True
            if not hit:
                continue
            # extract props
            found = {}
            for pr in props:
                m = re.search(r"(?<![\w-])" + re.escape(pr) + r"\s*:\s*([^;!}]+)(!important)?", decls)
                if m:
                    found[pr] = m.group(1).strip() + (" !important" if m.group(2) else "")
            if found:
                media = " AND ".join(medias) if medias else "(base)"
                print(f"  {fname}:{ln}  [{media}]  sel=`{sel[:110]}`  -> {found}")

if __name__ == "__main__":
    main()
