/**
 * EMAIL THEME
 * ───────────
 * Shared, inline-only building blocks for transactional email. The templates
 * deliberately avoid remote images: inboxes often block them, and a new Gmail
 * sender needs every deliverability advantage. The logo and illustrations are
 * made from tables, borders and text glyphs so they render immediately and
 * never behave like tracking pixels.
 */

export function emailEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const EMAIL = {
  body:
    "margin:0;padding:0;background:#f2efff;font-family:Arial,Helvetica,sans-serif;color:#12142f;-webkit-text-size-adjust:100%;text-size-adjust:100%;",
  wrap: "max-width:680px;margin:0 auto;padding:28px 14px;",
  panel:
    "background:#ffffff;border:1px solid #e7e3ff;border-radius:28px;overflow:hidden;box-shadow:0 22px 70px rgba(88,72,190,0.16);",
  inner: "padding:26px 28px;",
  muted: "color:#676b8a;",
  purple: "#6455f2",
  dark: "#101334",
  line: "border-top:1px solid #ebe8fb;",
  section:
    "border:1px solid #ece9fb;border-radius:18px;background:#ffffff;box-shadow:0 8px 26px rgba(83,71,180,0.06);",
  softSection: "border:1px solid #e7e2ff;border-radius:18px;background:#f7f5ff;",
  h1: "margin:0;font-size:28px;line-height:1.18;font-weight:800;letter-spacing:-0.03em;color:#101334;",
  h2:
    "margin:0 0 8px;font-size:12px;line-height:1.3;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#777b9a;",
  p: "margin:0;font-size:15px;line-height:1.65;color:#333852;",
  small: "margin:0;font-size:12px;line-height:1.55;color:#7d819f;",
  link: "color:#5b4bd5;text-decoration:underline;font-weight:700;",
} as const;

export function preheader(text: string): string {
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1px;font-size:1px">${emailEscape(text)}</div>`;
}

export function logoMark(size = 54): string {
  const inner = Math.max(28, size - 16);
  return (
    `<div style="width:${size}px;height:${size}px;border-radius:16px;background:#eeeaff;box-shadow:inset 0 0 0 1px #ddd7ff;text-align:center;line-height:${size}px">` +
    `<span style="display:inline-block;width:${inner}px;height:${inner}px;border-radius:11px;background:#ffffff;border:2px solid #6253eb;color:#6253eb;font-size:${Math.round(size * 0.44)}px;line-height:${inner}px;font-weight:900">✓</span>` +
    `</div>`
  );
}

export function brandLockup(): string {
  return (
    `<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>` +
    `<td style="vertical-align:middle;padding-right:14px">${logoMark(54)}</td>` +
    `<td style="vertical-align:middle">` +
    `<div style="font-size:24px;line-height:1.1;font-weight:900;letter-spacing:-0.04em;color:#101334">Study Planner <span style="color:#6253eb">Pro</span></div>` +
    `<div style="padding-top:7px;font-size:11px;line-height:1.2;letter-spacing:0.34em;color:#9aa0bb;font-weight:800">PLAN • FOCUS • ACHIEVE</div>` +
    `</td></tr></table>`
  );
}

export function emailHeader(): string {
  return (
    `<div style="padding:28px 28px 12px">` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>` +
    `<td style="vertical-align:top">${brandLockup()}</td>` +
    `<td align="right" style="vertical-align:top;padding-left:18px">` +
    `<div style="font-size:14px;line-height:1.45;color:#646984;font-style:italic">A better you,<br/>one study session at a time.</div>` +
    `<div style="width:38px;border-top:3px solid #7263f3;margin-top:12px;margin-left:auto"></div>` +
    `</td></tr></table>` +
    `</div>`
  );
}

export function emailFooter(note: string, unsubscribeUrl?: string): string {
  return (
    `<div style="padding:20px 28px 26px;background:#f7f5ff;border-top:1px solid #ebe8fb">` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>` +
    `<td style="vertical-align:middle;padding-right:14px;width:52px">${logoMark(46)}</td>` +
    `<td style="vertical-align:middle">` +
    `<div style="font-size:15px;line-height:1.25;font-weight:900;color:#101334">Study Planner <span style="color:#6253eb">Pro</span></div>` +
    `<div style="font-size:12px;line-height:1.45;color:#777b9a">Your personal study companion</div>` +
    `</td>` +
    `<td align="right" style="vertical-align:middle;padding-left:14px">` +
    `<div style="font-size:13px;line-height:1.45;color:#777b9a">Stay productive<br/>Stay ahead</div>` +
    `<div style="width:34px;border-top:2px solid #7263f3;margin-top:8px;margin-left:auto"></div>` +
    `</td></tr></table>` +
    `<p style="${EMAIL.small};margin-top:16px;text-align:center">${emailEscape(note)}${unsubscribeUrl ? `<br/><a style="${EMAIL.link}" href="${emailEscape(unsubscribeUrl)}">Unsubscribe from these emails</a>` : ""}</p>` +
    `</div>`
  );
}

export function shell(title: string, preheaderText: string, content: string): string {
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>` +
    `<title>${emailEscape(title)}</title></head>` +
    `<body style="${EMAIL.body}">${preheader(preheaderText)}<div style="${EMAIL.wrap}"><div style="${EMAIL.panel}">` +
    content +
    `</div></div></body></html>`
  );
}

export function primaryButton(href: string, label: string, icon = "↗"): string {
  return (
    `<table role="presentation" align="center" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 auto"><tr>` +
    `<td bgcolor="#6253eb" style="border-radius:999px;background:#6253eb;background-image:linear-gradient(135deg,#7c6cff,#5d4de0);box-shadow:0 14px 30px rgba(93,77,224,0.25)">` +
    `<a href="${emailEscape(href)}" style="display:inline-block;padding:15px 34px;border-radius:999px;color:#ffffff;text-decoration:none;font-size:16px;line-height:1;font-weight:900">${emailEscape(label)} <span style="font-size:20px;vertical-align:-1px">${emailEscape(icon)}</span></a>` +
    `</td></tr></table>`
  );
}

export function illustration(kind: "verify" | "digest" | "weekly" | "overdue"): string {
  const glyph = kind === "verify" ? "✓" : kind === "digest" ? "▤" : kind === "weekly" ? "↗" : "!";
  const label = kind === "verify" ? "Email verified" : kind === "digest" ? "Today plan" : kind === "weekly" ? "Week review" : "Recovery";
  const color = kind === "overdue" ? "#ef476f" : "#6253eb";
  const bg = kind === "overdue" ? "#fff0f4" : "#f0edff";
  return (
    `<table role="presentation" align="center" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 auto;width:150px"><tr>` +
    `<td style="height:106px;border-radius:26px;background:${bg};background-image:linear-gradient(135deg,${bg},#ffffff);border:1px solid #e4dfff;text-align:center;vertical-align:middle;box-shadow:0 16px 40px rgba(98,83,235,0.14)">` +
    `<div style="width:56px;height:56px;border-radius:999px;background:${color};background-image:linear-gradient(135deg,${color},#8b7cff);color:#ffffff;font-size:34px;line-height:56px;font-weight:900;margin:0 auto 8px">${glyph}</div>` +
    `<div style="font-size:11px;line-height:1.2;letter-spacing:0.16em;text-transform:uppercase;color:#777b9a;font-weight:900">${label}</div>` +
    `</td></tr></table>`
  );
}

export function heroCard(kicker: string, title: string, subtitle: string, art: string): string {
  return (
    `<div style="margin:12px 28px 18px;padding:22px;border-radius:24px;background:#f4f1ff;background-image:linear-gradient(135deg,#f8f6ff,#eeeaff);border:1px solid #e6e0ff">` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>` +
    `<td style="vertical-align:middle;padding-right:18px">` +
    `<div style="font-size:13px;line-height:1.3;color:#757a99;margin-bottom:8px">${emailEscape(kicker)}</div>` +
    `<div style="font-size:25px;line-height:1.22;font-weight:900;letter-spacing:-0.03em;color:#101334">${title}</div>` +
    `<div style="font-size:14px;line-height:1.55;color:#686d89;margin-top:10px">${subtitle}</div>` +
    `</td>` +
    `<td align="right" style="vertical-align:middle;width:170px">${art}</td>` +
    `</tr></table>` +
    `</div>`
  );
}

export function infoCard(content: string, tone: "default" | "soft" | "danger" | "blue" = "default"): string {
  const styles = {
    default: `${EMAIL.section};padding:18px 20px;margin:0 28px 16px;`,
    soft: `${EMAIL.softSection};padding:18px 20px;margin:0 28px 16px;`,
    danger: "border:1px solid #ffd7df;border-radius:18px;background:#fff3f6;padding:18px 20px;margin:0 28px 16px;",
    blue: "border:1px solid #dce8ff;border-radius:18px;background:#f3f7ff;padding:18px 20px;margin:0 28px 16px;",
  };
  return `<div style="${styles[tone]}">${content}</div>`;
}

export function metric(label: string, value: string, color = "#6253eb"): string {
  return (
    `<td style="width:33.33%;padding:6px">` +
    `<div style="border-radius:16px;background:#f7f5ff;border:1px solid #ebe7ff;padding:12px;text-align:center">` +
    `<div style="font-size:11px;line-height:1.2;letter-spacing:0.12em;text-transform:uppercase;color:#8589a5;font-weight:900">${emailEscape(label)}</div>` +
    `<div style="font-size:18px;line-height:1.25;color:${color};font-weight:900;margin-top:5px">${emailEscape(value)}</div>` +
    `</div>` +
    `</td>`
  );
}
