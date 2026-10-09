// Every value interpolated into outgoing email HTML goes through escapeHtml.
// Build HTML with the `html` tagged template so escaping is the default:
//   html`<p>${userText}</p>`   -> userText is escaped
//   rawHtml("<b>x</b>")        -> explicitly trusted markup, not escaped

const { t, resolveLocale } = require("../i18n");

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

const escapeHtml = (value) =>
    String(value === undefined || value === null ? "" : value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

class RawHtml {
    constructor(value) { this.value = value; }
    toString() { return this.value; }
}

const rawHtml = (value) => new RawHtml(String(value));

const html = (strings, ...values) =>
    strings.reduce((out, chunk, i) => {
        if (i >= values.length) return out + chunk;
        const v = values[i];
        return out + chunk + (v instanceof RawHtml ? v.value : escapeHtml(v));
    }, "");

// Plain text with line breaks -> escaped paragraphs.
const textToHtml = (text) =>
    String(text === undefined || text === null ? "" : text)
        .split(/\n{2,}/)
        .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
        .join("");

const appBaseUrl = () => ("https://nexoramarketplace.online").replace(/\/$/, "");

// Relative app paths ("/orders/12") become the absolute links an email needs.
const absoluteUrl = (path) => {
    if (!path) return appBaseUrl();
    if (/^https?:\/\//i.test(path)) return path;
    return `${appBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
};

// Brand palette, matched to the actual NEXORA logo mark (the glossy
// purple -> indigo -> teal gradient icon, frontend/public/nexora-logo.png)
// rather than the old abyss/teal/mango CSS variables, which had drifted
// away from what the logo actually looks like. `teal` here is a darkened,
// accessible version of the logo's bright right-side cyan (the logo's own
// cyan is too light to pass contrast as body/link/button text on white);
// `tealLight` is close to the logo's true cyan and is only ever used on
// the dark header, where contrast isn't an issue.
const BRAND = {
    abyss: "#0C0A1A",
    purple: "#9E31CD",
    indigo: "#3E53BD",
    teal: "#0A6E82",
    tealLight: "#35D4E8",
    tealTint: "#EAFBFD",
    tealTintBorder: "#BFEFF5"
};

// Sizing pass: the card/fonts/padding were tuned for a compact look that
// read as cramped (and, combined with the no-reply/no-greeting copy,
// added to the "generic bulk mail" impression a mail client's spam/
// Promotions filter picks up on). Every dimension below went up a step -
// wider card, bigger type, roomier padding - rather than changing the
// layout shape itself.

// Shared layout for every transactional email (Phase 9; decorative pass):
// a dark branded header with the NEXORA logo + wordmark and a purple ->
// indigo -> teal accent strip (matching the logo's own gradient), an
// optional eyebrow label, heading, message, an optional one-time
// code in a tinted box, one CTA button, the resolved link in plain text as
// well, and a footer with support and notification-settings links. Returns
// both the HTML and the plain-text alternative.
//
// `eyebrow` is optional and additive (e.g. "ORDER UPDATE") - existing
// callers (notification.service.js, otp.service.js) don't pass one and
// nothing breaks; it just doesn't render. Keep it short - it's one line,
// uppercase, no wrapping.
//
// `greetingName` is optional and additive too (e.g. a recipient's first
// name on a broadcast - see broadcast.service.js). An un-personalized
// bulk email - no name, identical copy to everyone - is one of the
// stronger signals mail clients use to file something under Promotions/
// Updates instead of Primary (which is what silently misses a push
// notification on most phones), so this is a real lever, not just a
// cosmetic touch.
const renderEmail = ({ locale, heading, message, code, ctaLabel, ctaUrl, eyebrow, greetingName }) => {
    const lang = resolveLocale(locale);
    const link = absoluteUrl(ctaUrl);
    const manageUrl = absoluteUrl("/account");
    const support = process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || "";
    // Defaults to the real logo mark shipped with the frontend
    // (frontend/public/nexora-logo.png). Vite copies everything under
    // frontend/public/ to the ROOT of the deployed site at build time
    // (see frontend/vite.config.js - it's a static asset, not an app
    // route), so the live URL is "/nexora-logo.png", not
    // "/frontend/public/nexora-logo.png" - that source-tree path doesn't
    // exist once deployed and was 404ing in every single email, broadcasts
    // included. A broken/missing header image is itself one more "this
    // looks like a sloppy bulk send" signal on top of everything else
    // driving broadcasts into Promotions (see broadcast.service.js).
    // EMAIL_LOGO_URL still overrides it when set (e.g. to point at a CDN
    // copy) - previously documented here but never actually read.
    const logoUrl = process.env.EMAIL_LOGO_URL || absoluteUrl("/nexora-logo.png");
    const footer = t(lang, "email.footer");
    const supportLabel = t(lang, "email.supportLabel");
    const manageLabel = t(lang, "email.manageLabel");
    const tagline = t(lang, "email.tagline");

    // Icon + wordmark lockup. The wordmark stays even when the image loads
    // (many email clients block remote images by default), so the icon's
    // alt text can stay empty/decorative rather than duplicating "NEXORA".
    const logo = rawHtml(html`<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>
<td style="padding-right:10px;"><img src="${logoUrl}" width="34" height="34" alt="" style="display:block;border:0;"></td>
<td style="vertical-align:middle;"><span style="font-size:24px;font-weight:800;letter-spacing:0.5px;"><span style="color:#ffffff;">NEX</span><span style="color:${BRAND.tealLight};">ORA</span></span></td>
</tr></table>`);
    const eyebrowBlock = eyebrow
        ? rawHtml(html`<p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${BRAND.purple};">${eyebrow}</p>`)
        : "";
    const greeting = greetingName ? `${t(lang, "email.greetingPrefix")} ${greetingName},` : "";
    const greetingBlock = greeting
        ? rawHtml(html`<p style="margin:0 0 14px;font-size:16px;">${greeting}</p>`)
        : "";
    // The literal "<p>M</p>" shape here (no style attribute) is relied on
    // by tests/unit/notification/notification.service.test.js - keep
    // textToHtml itself plain and style the wrapping div instead.
    const body = rawHtml(textToHtml(message));
    const codeBlock = code
        ? rawHtml(html`<div style="margin:24px 0;padding:22px;background:${BRAND.tealTint};border:1px solid ${BRAND.tealTintBorder};border-radius:10px;text-align:center;"><p style="margin:0;font-size:34px;font-weight:800;letter-spacing:9px;color:${BRAND.teal};">${code}</p></div>`)
        : "";
    const cta = ctaLabel
        ? rawHtml(html`<p style="margin:28px 0 10px;"><a href="${link}" style="background:linear-gradient(90deg,${BRAND.purple},${BRAND.teal});background-color:${BRAND.teal};color:#ffffff;padding:16px 32px;border-radius:999px;text-decoration:none;display:inline-block;font-weight:600;font-size:16px;">${ctaLabel}</a></p>`)
        : "";
    const supportHtml = support ? rawHtml(html`<a href="mailto:${support}" style="color:${BRAND.teal};">${support}</a>`) : "";

    const htmlBody = html`<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${heading}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#111111;">
<div style="max-width:680px;margin:0 auto;padding:32px 20px;">
<div style="background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5ea;box-shadow:0 2px 6px rgba(0,0,0,0.07);">
<div style="background:${BRAND.abyss};padding:26px 34px;">
${logo}
<p style="margin:8px 0 0;font-size:13px;letter-spacing:0.5px;color:#9aa0ab;">${tagline}</p>
</div>
<div style="height:4px;background:linear-gradient(90deg,${BRAND.purple},${BRAND.indigo},${BRAND.tealLight});"></div>
<div style="padding:36px;">
${eyebrowBlock}
<h1 style="font-size:26px;line-height:1.3;margin:0 0 16px;color:#111111;">${heading}</h1>
${greetingBlock}
<div style="font-size:16px;line-height:1.7;color:#333333;">
${body}
</div>
${codeBlock}
${cta}
<p style="font-size:13px;color:#8a8f98;word-break:break-all;margin-top:18px;">${link}</p>
</div>
</div>
<div style="font-size:13px;color:#8a8f98;padding:24px 8px;text-align:center;">
<p style="margin:0 0 8px;">${footer}</p>
<p style="margin:0;">${supportLabel}${supportHtml ? rawHtml(": ") : ""}${supportHtml} &middot; <a href="${manageUrl}" style="color:${BRAND.teal};">${manageLabel}</a></p>
</div>
</div>
</body>
</html>`;

    const text = [
        heading,
        greeting || null,
        message,
        code ? String(code) : null,
        ctaLabel ? `${ctaLabel}: ${link}` : link,
        footer,
        `${supportLabel}${support ? `: ${support}` : ""}`,
        `${manageLabel}: ${manageUrl}`
    ].filter(Boolean).join("\n\n");

    return { html: htmlBody, text };
};

module.exports = { escapeHtml, html, rawHtml, textToHtml, absoluteUrl, renderEmail };
