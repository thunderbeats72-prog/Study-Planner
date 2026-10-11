/**
 * EMAIL THEME
 * ------------
 * Shared building blocks for the transactional mail this app sends (daily
 * digest, Sunday review, overdue nudge, address verification).
 *
 * Two rules shape everything below:
 *
 *   1. INLINE-FIRST, CLASS-SECOND. Every block carries its desktop look as an
 *      inline style (the only thing Outlook's Word renderer will read) AND a
 *      class (the only thing a media query can reach). The <style> block is
 *      therefore additive: at phone width the media queries override the
 *      inline values with `!important`, and a client that ignores them simply
 *      keeps the desktop layout instead of breaking.
 *   2. NOTHING IS FIXED WIDTH. The outer layout is a table with a `width`
 *      attribute for Outlook and `width:100%;max-width:680px` for every real
 *      browser, so a 320px phone gets the same email re-flowed - stacked
 *      columns, tighter padding, fluid artwork and a full-width button -
 *      rather than a shrunk-down desktop page.
 *
 * Artwork is static, non-tracking PNGs served by the app itself, with CSS-only
 * fallbacks for the (very common) case of a client that blocks images.
 */

export function emailEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ASSETS = {
  logo: "/email/study-planner-logo.png",
  verify: "/email/email-verify-hero.png",
  digest: "/email/email-digest-hero.png",
  weekly: "/email/email-weekly-hero.png",
  overdue: "/email/email-overdue-card.png",
} as const;

/**
 * Class names are the responsive contract between the inline styles here and
 * the media queries in `emailStyles()`. Templates reach for these instead of
 * typing a class by hand, so a rename can never leave a rule orphaned.
 */
export const EMAIL_CLASS = {
  head: "spp-head",
  headCol: "spp-head-col",
  headRight: "spp-head-right",
  rule: "spp-head-rule",
  lockup: "spp-lockup",
  logo: "spp-logo",
  logoCell: "spp-logo-cell",
  brand: "spp-brand",
  brandSub: "spp-brand-sub",
  tagline: "spp-tagline",
  hero: "spp-hero",
  heroCol: "spp-hero-col",
  heroArt: "spp-hero-art",
  kicker: "spp-kicker",
  h1: "spp-h1",
  title: "spp-title",
  sub: "spp-sub",
  padX: "spp-pad-x",
  bodyPad: "spp-body-pad",
  center: "spp-center",
  card: "spp-card",
  space: "spp-space",
  ico: "spp-ico",
  eyebrow: "spp-eyebrow",
  copy: "spp-copy",
  small: "spp-small",
  url: "spp-url",
  mCol: "spp-m-col",
  mBox: "spp-m-box",
  mLabel: "spp-m-label",
  mValue: "spp-m-value",
  chip: "spp-chip",
  chipCell: "spp-t-chip",
  idxCell: "spp-t-idx",
  num: "spp-num",
  mainCell: "spp-t-main",
  icoCell: "spp-ico-cell",
  dateCell: "spp-dt",
  sideArt: "spp-side-art",
  hideSm: "spp-hide-sm",
  btnPad: "spp-btn-pad",
  btnTable: "spp-btn-table",
  btnCell: "spp-btn-cell",
  btn: "spp-btn",
  foot: "spp-foot",
  footCol: "spp-foot-col",
  footMark: "spp-foot-mark",
  art: "spp-art",
} as const;

/**
 * A mail client reads this email on a phone in a café, not inside this
 * network. An origin only a developer's machine can resolve (localhost, a
 * private range, a `.local` mDNS name) is therefore worse than no origin at
 * all: every `<img>` would land as a broken-image icon in somebody's inbox.
 * Those bases are dropped here so the templates draw their CSS brand tile
 * instead, and `APP_URL` pointing at the real deployment is all it takes to
 * get the PNG artwork.
 */
const UNREACHABLE_HOST =
  /^(localhost$|.*\.localhost$|127\.|0\.0\.0\.0$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i;

export function isMailReachableAssetBase(base: string): boolean {
  let host = base;
  try {
    const url = new URL(base);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    host = url.hostname;
  } catch {
    // Not a full URL: treat the value as a bare host (or host:port) and
    // judge that, so a relative "." or "" can never reach an <img>.
    host = base.replace(/^https?:\/\//i, "").split("/")[0];
  }
  if (!host || !host.includes(".")) return false;
  return !UNREACHABLE_HOST.test(host.split(":")[0]);
}

/** The absolute origin mail clients should fetch artwork from ("" if none). */
export function emailAssetBaseFromUrl(url: string): string {
  let origin = "";
  try {
    origin = new URL(url).origin;
  } catch {
    const match = /^(https?:\/\/[^/]+)/i.exec(url);
    origin = match ? match[1] : "";
  }
  return origin && isMailReachableAssetBase(origin) ? origin : "";
}

function assetUrl(assetBase: string | undefined, path: string): string | null {
  if (!assetBase) return null;
  try {
    return new URL(path, assetBase).href;
  } catch {
    const cleanBase = assetBase.replace(/\/+$/, "") || ".";
    return `${cleanBase}${path}`;
  }
}

/**
 * One <img> for every piece of artwork. Fluid by construction: the width and
 * height attributes are the desktop size (Outlook needs them), `height:auto`
 * plus `max-width:100%` is what stops a 174px illustration from forcing a
 * horizontal scroll on a narrow phone.
 */
function imgTag(
  assetBase: string | undefined,
  path: string,
  alt: string,
  width: number,
  height: number,
  style: string,
  cls = "",
): string | null {
  const src = assetUrl(assetBase, path);
  if (!src) return null;
  return (
    `<img src="${emailEscape(src)}" width="${width}" height="${height}" alt="${emailEscape(alt)}"` +
    `${cls ? ` class="${cls}"` : ""} style="display:block;border:0;outline:none;text-decoration:none;` +
    `-ms-interpolation-mode:bicubic;height:auto;max-width:100%;${style}"/>`
  );
}

/** The inline-style half of the pair; `EMAIL_CLASS` is the other half. */
export const EMAIL = {
  body:
    "margin:0;padding:0;width:100%;background-color:#f2efff;font-family:Arial,Helvetica,sans-serif;color:#12142f;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;text-size-adjust:100%;",
  wrap: "padding:26px 14px 32px;",
  panel:
    "width:100%;max-width:680px;background-color:#ffffff;border:1px solid #e7e3ff;border-radius:28px;overflow:hidden;box-shadow:0 22px 70px rgba(88,72,190,0.16);",
  inner: "padding:26px 28px;",
  muted: "color:#676b8a;",
  purple: "#6455f2",
  dark: "#101334",
  line: "border-top:1px solid #ebe8fb;",
  section:
    "border:1px solid #ece9fb;border-radius:18px;background-color:#ffffff;box-shadow:0 8px 26px rgba(83,71,180,0.06);",
  softSection: "border:1px solid #e7e2ff;border-radius:18px;background-color:#f7f5ff;",
  h1: "margin:0;font-size:28px;line-height:1.18;font-weight:800;letter-spacing:-0.03em;color:#101334;",
  h2:
    "margin:0 0 8px;font-size:12px;line-height:1.3;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#777b9a;",
  p: "margin:0;font-size:15px;line-height:1.65;color:#333852;",
  small: "margin:0;font-size:12px;line-height:1.55;color:#7d819f;",
  link: "color:#5b4bd5;text-decoration:underline;font-weight:700;",
} as const;

/**
 * The responsive half of the template: client resets, then one block per
 * breakpoint. Outlook desktop never sees any of this (it ignores media
 * queries) and gets the inline desktop layout, which is exactly right - a
 * desktop mailbox has the width for it.
 */
export function emailStyles(): string {
  return `<style type="text/css">
html,body{margin:0;padding:0;width:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
body{background-color:#f2efff}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
img{-ms-interpolation-mode:bicubic;border:0;line-height:100%;outline:none;text-decoration:none}
a{color:#5b4bd5}
/* iOS data detectors (dates, addresses) restyle their own anchors; only
 * those are reset here, never the links the template colours on purpose. */
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;font-size:inherit!important;font-family:inherit!important;font-weight:inherit!important;line-height:inherit!important}
td,div,p,span{mso-line-height-rule:exactly}
.spp-pad-x{padding-left:28px;padding-right:28px}
button,a{-webkit-tap-highlight-color:rgba(0,0,0,0)}
@media only screen and (max-width:600px){
  .spp-hero-art{width:150px!important}
  .spp-title{font-size:23px!important}
}
@media only screen and (max-width:480px){
  .spp-page-pad{padding:10px 6px 20px!important}
  .spp-panel{border-radius:20px!important}
  .spp-head{padding:18px 16px 4px!important}
  .spp-head-col{display:block!important;width:100%!important;text-align:center!important;padding:0!important;max-width:none!important}
  .spp-head-right{padding-top:12px!important}
  .spp-head-rule,.spp-foot-rule{display:none!important}
  .spp-lockup{margin:0 auto!important}
  .spp-logo{width:38px!important;height:38px!important;border-radius:12px!important}
  .spp-logo-cell{padding-right:11px!important;width:38px!important}
  .spp-brand{font-size:20px!important}
  .spp-brand-sub{font-size:9px!important;letter-spacing:.2em!important;padding-top:5px!important}
  .spp-tagline{font-size:12.5px!important;line-height:1.45!important}
  .spp-hero{margin:8px 12px 14px!important;padding:16px 14px 18px!important;border-radius:20px!important}
  .spp-hero-col{display:block!important;width:100%!important;padding:0!important;text-align:left!important}
  .spp-hero-art{display:block!important;width:100%!important;padding:16px 0 0!important;text-align:center!important}
  .spp-hero-art img{margin:0 auto!important;width:152px!important}
  .spp-kicker{font-size:12px!important;margin-bottom:6px!important;letter-spacing:.01em!important}
  .spp-h1{font-size:26px!important;line-height:1.2!important;letter-spacing:-.02em!important}
  .spp-title{font-size:21px!important}
  .spp-sub{font-size:13.5px!important;margin-top:8px!important}
  .spp-pad-x{padding-left:16px!important;padding-right:16px!important}
  .spp-body-pad{padding:12px 16px 20px!important}
  .spp-card{margin:0 12px 12px!important;padding:15px 13px!important;border-radius:16px!important}
  .spp-space{height:16px!important;line-height:16px!important;font-size:16px!important}
  .spp-ico{width:40px!important;height:40px!important;line-height:40px!important;font-size:19px!important}
  .spp-eyebrow{font-size:11px!important;letter-spacing:.13em!important}
  .spp-copy{font-size:15px!important;line-height:1.6!important}
  .spp-m-col{display:block!important;width:100%!important;padding:3px 0!important}
  .spp-m-box{padding:9px 12px!important;text-align:left!important;border-radius:13px!important}
  .spp-m-label{display:inline-block!important;width:44%!important;font-size:10px!important;letter-spacing:.1em!important;vertical-align:middle!important}
  .spp-m-value{display:inline-block!important;width:53%!important;text-align:right!important;font-size:16px!important;margin-top:0!important;vertical-align:middle!important}
  .spp-dt{width:76px!important;padding-right:6px!important;font-size:11px!important}
  .spp-t-idx{width:30px!important;padding:10px 6px 10px 0!important}
  .spp-num{width:26px!important;height:26px!important;line-height:26px!important;font-size:12px!important}
  .spp-t-main{padding:10px 4px!important}
  .spp-ico-cell{width:44px!important;padding-right:10px!important}
  .spp-t-chip{width:64px!important;padding:12px 0 12px 4px!important}
  .spp-chip{padding:6px 7px!important;font-size:11px!important;border-radius:10px!important}
  .spp-side-art,.spp-hide-sm{display:none!important}
  .spp-btn-pad{padding:2px 12px 18px!important}
  .spp-btn-table{width:100%!important;max-width:none!important}
  .spp-btn-cell{display:block!important;width:auto!important;border-radius:16px!important}
  .spp-btn{display:block!important;padding:16px 12px!important;border-radius:16px!important;font-size:16px!important}
  .spp-url{font-size:12.5px!important;word-break:break-all!important;overflow-wrap:anywhere!important}
  .spp-foot{padding:16px 16px 20px!important;border-radius:0 0 20px 20px!important}
  .spp-foot-col{display:block!important;width:100%!important;text-align:center!important;padding:0 0 7px!important}
  .spp-foot-col table{margin:0 auto!important}
  .spp-foot-col table td{text-align:center!important}
  .spp-foot-mark{width:34px!important;height:34px!important;margin:0 auto!important}
  .spp-small{font-size:12px!important;line-height:1.55!important}
}
@media only screen and (max-width:374px){
  .spp-head{padding:16px 12px 2px!important}
  .spp-brand{font-size:18px!important}
  .spp-h1{font-size:23px!important}
  .spp-hero{margin:6px 8px 12px!important;padding:15px 12px 16px!important}
  .spp-card{margin:0 8px 10px!important;padding:13px 11px!important}
  .spp-btn-pad{padding:2px 8px 16px!important}
  .spp-m-label{width:46%!important}
  .spp-m-value{width:51%!important}
}
@media (prefers-color-scheme:dark){
  .spp-page{background-color:#f2efff!important}
  .spp-panel{background-color:#ffffff!important}
  .spp-title,.spp-h1,.spp-m-value{color:#101334!important}
  .spp-copy{color:#333852!important}
}</style>`;
}

export function preheader(text: string): string {
  return (
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1px;font-size:1px;mso-hide:all">` +
    `${emailEscape(text)}</div>`
  );
}

/**
 * The brand mark: Study Planner Pro's own logo tile (the same layers glyph the
 * app icon and the sidebar use), never a stock image. Rendered as PNG so it
 * survives every mail client that fetches images; when images are blocked the
 * CSS tile below draws the same mark instead of an empty grey box.
 */
export function logoMark(size = 54, assetBase?: string, cls: string = EMAIL_CLASS.logo): string {
  const image = imgTag(
    assetBase,
    ASSETS.logo,
    "Study Planner Pro logo",
    size,
    size,
    `width:${size}px;height:${size}px;border-radius:15px;`,
    cls,
  );
  if (image) return image;
  const tileRadius = Math.max(10, Math.round(size * 0.28));
  const bar = (width: number, extra: string) =>
    `<div style="height:${Math.max(2, Math.round(size * 0.075))}px;width:${width}px;border-radius:999px;background-color:#ffffff;${extra}"></div>`;
  return (
    `<div${cls ? ` class="${cls}"` : ""} style="width:${size}px;height:${size}px;border-radius:${tileRadius}px;background-color:#6253eb;` +
    `background-image:linear-gradient(135deg,#7d6cf0,#5d4de0);text-align:center">` +
    `<div style="display:inline-block;padding-top:${Math.round(size * 0.26)}px">` +
    bar(Math.round(size * 0.52), "margin:0 auto") +
    bar(Math.round(size * 0.4), `margin:${Math.round(size * 0.13)}px auto 0`) +
    bar(Math.round(size * 0.4), `margin:${Math.round(size * 0.09)}px auto 0`) +
    `</div></div>`
  );
}

/** Logo tile + wordmark, as one lockup so the two never drift apart. */
export function brandLockup(assetBase?: string): string {
  return (
    `<table role="presentation" class="${EMAIL_CLASS.lockup}" border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse">` +
    `<tr>` +
    `<td class="${EMAIL_CLASS.logoCell}" style="vertical-align:middle;padding-right:14px;width:54px">${logoMark(54, assetBase)}</td>` +
    `<td style="vertical-align:middle">` +
    `<div class="${EMAIL_CLASS.brand}" style="font-size:24px;line-height:1.1;font-weight:900;letter-spacing:-0.04em;color:#101334">Study Planner <span style="color:#6253eb">Pro</span></div>` +
    `<div class="${EMAIL_CLASS.brandSub}" style="padding-top:7px;font-size:11px;line-height:1.2;letter-spacing:0.34em;color:#9aa0bb;font-weight:800">PLAN • FOCUS • ACHIEVE</div>` +
    `</td></tr></table>`
  );
}

export function emailHeader(assetBase?: string): string {
  return (
    `<div class="${EMAIL_CLASS.head}" style="padding:28px 28px 12px">` +
    `<table role="presentation" border="0" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>` +
    `<td class="${EMAIL_CLASS.headCol}" align="left" width="58%" style="vertical-align:middle">${brandLockup(assetBase)}</td>` +
    `<td class="${EMAIL_CLASS.headCol} ${EMAIL_CLASS.headRight}" align="right" width="42%" style="vertical-align:middle;padding-left:18px">` +
    `<div class="${EMAIL_CLASS.tagline}" style="font-size:14px;line-height:1.45;color:#646984;font-style:italic">A better you,<br/>one study session at a time.</div>` +
    `<div class="${EMAIL_CLASS.rule}" style="width:38px;border-top:3px solid #7263f3;margin-top:12px;margin-left:auto"></div>` +
    `</td></tr></table>` +
    `</div>`
  );
}

export function emailFooter(note: string, unsubscribeUrl?: string, assetBase?: string): string {
  return (
    `<div class="${EMAIL_CLASS.foot}" style="padding:20px 28px 26px;background-color:#f7f5ff;border-top:1px solid #ebe8fb;border-radius:0 0 27px 27px">` +
    `<table role="presentation" border="0" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>` +
    `<td class="${EMAIL_CLASS.footCol}" align="left" style="vertical-align:middle;padding-right:14px;width:210px">` +
    `<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>` +
    `<td class="${EMAIL_CLASS.logoCell}" style="vertical-align:middle;padding-right:14px;width:46px">${logoMark(46, assetBase, `${EMAIL_CLASS.logo} ${EMAIL_CLASS.footMark}`)}</td>` +
    `<td style="vertical-align:middle">` +
    `<div class="${EMAIL_CLASS.brand}" style="font-size:15px;line-height:1.25;font-weight:900;color:#101334">Study Planner <span style="color:#6253eb">Pro</span></div>` +
    `<div style="font-size:12px;line-height:1.45;color:#777b9a">Your personal study companion</div>` +
    `</td></tr></table>` +
    `</td>` +
    `<td class="${EMAIL_CLASS.footCol}" align="right" style="vertical-align:middle;padding-left:14px">` +
    `<div class="${EMAIL_CLASS.tagline}" style="font-size:13px;line-height:1.45;color:#777b9a">Stay productive<br/>Stay ahead</div>` +
    `<div class="${EMAIL_CLASS.rule} spp-foot-rule" style="width:34px;border-top:2px solid #7263f3;margin-top:8px;margin-left:auto"></div>` +
    `</td></tr></table>` +
    `<p class="${EMAIL_CLASS.small}" style="${EMAIL.small};margin-top:16px;text-align:center">${emailEscape(note)}` +
    `${unsubscribeUrl ? `<br/><a class="${EMAIL_CLASS.url}" style="${EMAIL.link}" href="${emailEscape(unsubscribeUrl)}">Unsubscribe from these emails</a>` : ""}</p>` +
    `</div>`
  );
}

/**
 * The responsive shell. Structure is a table, not a div, because Outlook
 * reads the `width` attribute and every other client reads the fluid CSS -
 * one source of truth that gives desktop 680px and a phone 100%.
 */
export function shell(title: string, preheaderText: string, content: string): string {
  return (
    `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">` +
    `<html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head>` +
    `<meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>` +
    `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>` +
    `<meta http-equiv="X-UA-Compatible" content="IE=edge"/>` +
    `<meta name="x-apple-disable-message-reformatting"/>` +
    `<meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no"/>` +
    `<meta name="color-scheme" content="light only"/>` +
    `<meta name="supported-color-schemes" content="light"/>` +
    `<title>${emailEscape(title)}</title>` +
    emailStyles() +
    `<!--[if mso]><style type="text/css">.spp-panel{width:680px!important}.spp-head,.spp-foot{border-radius:0!important}</style><![endif]-->` +
    `</head>` +
    `<body class="spp-mail-body" style="${EMAIL.body}">` +
    preheader(preheaderText) +
    `<table role="presentation" class="spp-page" border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;background-color:#f2efff"><tr>` +
    `<td class="spp-page-pad" align="center" style="${EMAIL.wrap}">` +
    `<table role="presentation" class="spp-panel" border="0" width="680" cellpadding="0" cellspacing="0" align="center" style="border-collapse:separate;${EMAIL.panel}"><tr>` +
    `<td style="font-size:15px">` +
    content +
    `</td></tr></table>` +
    `</td></tr></table>` +
    `</body></html>`
  );
}

/**
 * A pill button that becomes a full-width, 50px-tall tap target on a phone -
 * the single biggest usability difference between a responsive and a
 * desktop-only email.
 */
export function primaryButton(href: string, label: string, icon = "↗"): string {
  return (
    `<table role="presentation" class="${EMAIL_CLASS.btnTable}" align="center" border="0" cellspacing="0" cellpadding="0" style="border-collapse:separate;margin:0 auto"><tr>` +
    `<td class="${EMAIL_CLASS.btnCell}" bgcolor="#6253eb" align="center" style="border-radius:999px;background-color:#6253eb;background-image:linear-gradient(135deg,#7c6cff,#5d4de0);box-shadow:0 14px 30px rgba(93,77,224,0.25)">` +
    `<a class="${EMAIL_CLASS.btn}" href="${emailEscape(href)}" style="display:inline-block;padding:15px 34px;border-radius:999px;color:#ffffff;text-decoration:none;font-size:16px;line-height:1;font-weight:900">` +
    `${emailEscape(label)} <span style="font-size:20px;vertical-align:-1px">${emailEscape(icon)}</span></a>` +
    `</td></tr></table>`
  );
}

/** Same mark as the artwork, drawn in CSS - for blocked images. */
function fallbackIllustration(kind: "verify" | "digest" | "weekly" | "overdue"): string {
  const glyph = kind === "verify" ? "✓" : kind === "digest" ? "▤" : kind === "weekly" ? "↗" : "!";
  const label = kind === "verify" ? "Email verified" : kind === "digest" ? "Today plan" : kind === "weekly" ? "Week review" : "Recovery";
  const color = kind === "overdue" ? "#ef476f" : "#6253eb";
  const bg = kind === "overdue" ? "#fff0f4" : "#f0edff";
  return (
    `<table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 auto;width:150px"><tr>` +
    `<td style="height:106px;border-radius:26px;background-color:${bg};background-image:linear-gradient(135deg,${bg},#ffffff);border:1px solid #e4dfff;text-align:center;vertical-align:middle;box-shadow:0 16px 40px rgba(98,83,235,0.14)">` +
    `<div class="${EMAIL_CLASS.ico}" style="width:56px;height:56px;border-radius:999px;background-color:${color};background-image:linear-gradient(135deg,${color},#8b7cff);color:#ffffff;font-size:26px;line-height:56px;font-weight:900;margin:0 auto 8px">${glyph}</div>` +
    `<div style="font-size:11px;line-height:1.2;letter-spacing:0.16em;text-transform:uppercase;color:#777b9a;font-weight:900">${label}</div>` +
    `</td></tr></table>`
  );
}

export function illustration(kind: "verify" | "digest" | "weekly" | "overdue", assetBase?: string): string {
  const path = ASSETS[kind];
  const alt =
    kind === "verify"
      ? "Email verification illustration"
      : kind === "digest"
        ? "Daily study plan illustration"
        : kind === "weekly"
          ? "Weekly progress illustration"
          : "Recovery reminder illustration";
  const width = kind === "overdue" ? 136 : 174;
  const height = kind === "overdue" ? 98 : 106;
  const image = imgTag(
    assetBase,
    path,
    alt,
    width,
    height,
    `width:${width}px;border-radius:22px;margin:0 auto`,
    EMAIL_CLASS.art,
  );
  return image || fallbackIllustration(kind);
}

/**
 * The banner under the header. Two columns on a desktop, and one column on a
 * phone: the copy first, the artwork centred beneath it.
 */
export function heroCard(kicker: string, title: string, subtitle: string, art: string): string {
  return (
    `<div class="${EMAIL_CLASS.hero}" style="margin:12px 28px 18px;padding:22px;border-radius:24px;background-color:#f4f1ff;background-image:linear-gradient(135deg,#f8f6ff,#eeeaff);border:1px solid #e6e0ff">` +
    `<table role="presentation" border="0" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>` +
    `<td class="${EMAIL_CLASS.heroCol}" valign="top" width="64%" style="vertical-align:middle;padding-right:18px">` +
    `<div class="${EMAIL_CLASS.kicker}" style="font-size:13px;line-height:1.3;color:#757a99;margin-bottom:8px">${emailEscape(kicker)}</div>` +
    `<div class="${EMAIL_CLASS.title}" style="font-size:25px;line-height:1.22;font-weight:900;letter-spacing:-0.03em;color:#101334">${title}</div>` +
    `<div class="${EMAIL_CLASS.sub}" style="font-size:14px;line-height:1.55;color:#686d89;margin-top:10px">${subtitle}</div>` +
    `</td>` +
    `<td class="${EMAIL_CLASS.heroCol} ${EMAIL_CLASS.heroArt}" valign="middle" align="right" width="36%" style="vertical-align:middle;width:180px">${art}</td>` +
    `</tr></table>` +
    `</div>`
  );
}

export function infoCard(content: string, tone: "default" | "soft" | "danger" | "blue" = "default"): string {
  const styles = {
    default: `${EMAIL.section};padding:18px 20px;margin:0 28px 16px;`,
    soft: `${EMAIL.softSection};padding:18px 20px;margin:0 28px 16px;`,
    danger: "border:1px solid #ffd7df;border-radius:18px;background-color:#fff3f6;padding:18px 20px;margin:0 28px 16px;",
    blue: "border:1px solid #dce8ff;border-radius:18px;background-color:#f3f7ff;padding:18px 20px;margin:0 28px 16px;",
  };
  return `<div class="${EMAIL_CLASS.card}" style="${styles[tone]}">${content}</div>`;
}

/**
 * One stat. Three across on a desktop; on a phone the same cell re-renders as
 * a full-width "STREAK --- 5 days" row, which stays readable at any width.
 */
export function metric(label: string, value: string, color = "#6253eb"): string {
  return (
    `<td class="${EMAIL_CLASS.mCol}" width="33.33%" style="width:33.33%;padding:6px">` +
    `<div class="${EMAIL_CLASS.mBox}" style="border-radius:16px;background-color:#f7f5ff;border:1px solid #ebe7ff;padding:12px;text-align:center">` +
    `<div class="${EMAIL_CLASS.mLabel}" style="font-size:11px;line-height:1.2;letter-spacing:0.12em;text-transform:uppercase;color:#8589a5;font-weight:900">${emailEscape(label)}</div>` +
    `<div class="${EMAIL_CLASS.mValue}" style="font-size:18px;line-height:1.25;color:${color};font-weight:900;margin-top:5px">${emailEscape(value)}</div>` +
    `</div>` +
    `</td>`
  );
}

/** A vertical gap that shrinks with the rest of the layout. */
export function spacer(px = 24): string {
  return `<div class="${EMAIL_CLASS.space}" style="height:${px}px;line-height:${px}px;font-size:${px}px">&nbsp;</div>`;
}
