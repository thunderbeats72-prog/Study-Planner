/**
 * WebKit/Android speech recognition often reports a cumulative result as a
 * new segment ("open my" followed by "open my planner"). Appending those
 * segments produces the familiar "open my open my planner" echo.
 *
 * Merge on the largest word overlap instead. The original spelling and
 * punctuation are retained; only comparison is normalised.
 */
function tokenKey(token: string): string {
  return token.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function sameTokens(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((token, index) => tokenKey(token) === tokenKey(b[index]));
}

/** Remove recognizer echoes while preserving an intentional double word. */
function collapseRecognizerEchoes(words: string[]): string[] {
  const out = [...words];

  // Adjacent duplicate words are overwhelmingly recognition echoes in a
  // one-shot assistant command ("I I want", "are are are"). Collapse them
  // all; this is deliberately stricter than prose editing because voice
  // commands must never reach chat with duplicated prefixes.
  for (let i = 0; i < out.length;) {
    let end = i + 1;
    while (end < out.length && tokenKey(out[end]) === tokenKey(out[i])) end++;
    if (end - i >= 2) out.splice(i + 1, end - i - 1);
    i++;
  }

  // Remove immediately repeated multi-word phrases, longest first.
  for (let width = Math.min(10, Math.floor(out.length / 2)); width >= 2; width--) {
    let i = width;
    while (i + width <= out.length) {
      const previous = out.slice(i - width, i);
      const current = out.slice(i, i + width);
      if (sameTokens(previous, current)) out.splice(i, width);
      else i++;
    }
  }
  return out;
}

export function mergeTranscriptSegments(segments: string[]): string {
  const merged: string[] = [];
  let previousSegment = "";

  for (const raw of segments) {
    const segment = raw.replace(/\s+/g, " ").trim();
    if (!segment) continue;
    const words = segment.split(" ");
    const segmentKey = words.map(tokenKey).join(" ");

    // Duplicate adjacent result objects are another common WebKit shape.
    if (segmentKey && segmentKey === previousSegment) continue;
    previousSegment = segmentKey;

    let overlap = 0;
    const limit = Math.min(merged.length, words.length);
    for (let size = limit; size > 0; size--) {
      if (sameTokens(merged.slice(-size), words.slice(0, size))) {
        overlap = size;
        break;
      }
    }
    merged.push(...words.slice(overlap));
  }

  return collapseRecognizerEchoes(merged).join(" ").replace(/\s+/g, " ").trim();
}
