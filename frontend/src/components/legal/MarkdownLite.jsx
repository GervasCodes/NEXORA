/**
 * MarkdownLite
 * ------------
 * A tiny, dependency-free renderer for the small subset of Markdown our
 * legal documents actually use: headings (##/###), blockquotes (>), tables,
 * numbered/bulleted lists, bold (**text**), links ([text](url)), and
 * paragraphs. This intentionally avoids pulling in a full markdown parser
 * dependency (e.g. react-markdown) just for five static, controlled
 * documents that we author ourselves.
 *
 * Internal links (starting with "/") render as React Router <Link> so
 * cross-references between legal documents (e.g. Terms -> Delivery
 * Liability Policy) navigate client-side.
 */
import { Link } from "react-router-dom";

// Phase 3 (Security Hardening) — link-target allow-list.
//
// Audit finding: MarkdownLite never parses raw HTML. Every node it emits
// is constructed as a JSX element, and all text reaches the DOM through
// plain `{value}` interpolation, so React escapes it. A document
// containing `<script>` renders those characters as literal text. There
// is no `dangerouslySetInnerHTML` anywhere in this component (or, as it
// turns out, anywhere in frontend/src at all — see PHASE_3_NOTES.md).
//
// The one construct that did NOT pass through React's escaping was the
// `href` of a `[text](url)` link: it was taken verbatim from the document
// and handed to `<a href>`. A `javascript:` or `data:text/html` URL there
// executes on click — React does not block those.
//
// This is hardening, NOT a live vulnerability: MarkdownLite is only ever
// rendered by LegalPage.jsx with static, repo-authored content from
// LEGAL_DOCS, so no user-supplied string can currently reach it. The
// guard exists so that stays safe if this component is ever pointed at
// seller- or buyer-authored text (a store description, say), which is a
// very natural future reuse of "a tiny markdown renderer we already
// have".
//
// Allow-list rather than deny-list: anything not explicitly permitted
// renders as plain text instead of a link, so a novel scheme can't slip
// through by not being on a blocklist.
const isSafeHref = (href) => {
    const value = String(href).trim();

    // Internal router paths ("/legal/refund-policy"). Rejects "//evil.com",
    // which a browser treats as a protocol-relative external URL.
    if (value.startsWith("/")) return !value.startsWith("//");

    // Same-document anchors.
    if (value.startsWith("#")) return true;

    // Absolute URLs: only these three schemes. Case-insensitive, since
    // "JavaScript:" and "jAvAsCrIpT:" are equally executable.
    return /^(https?:|mailto:|tel:)/i.test(value);
};

function renderInline(text, keyPrefix) {
    // Split on **bold** and [text](url) without a regex library.
    const parts = [];
    let remaining = text;
    let i = 0;

    const pattern = /(\*\*(.+?)\*\*)|(\[(.+?)\]\((.+?)\))/;

    while (remaining.length > 0) {
        const match = remaining.match(pattern);
        if (!match) {
            parts.push(remaining);
            break;
        }
        const before = remaining.slice(0, match.index);
        if (before) parts.push(before);

        if (match[1]) {
            parts.push(<strong key={`${keyPrefix}-${i++}`}>{match[2]}</strong>);
        } else if (match[3]) {
            const [, , , , label, href] = match;
            if (!isSafeHref(href)) {
                // Disallowed scheme: render the label as plain text so the
                // document still reads correctly, but there is nothing to
                // click. Deliberately not silently dropped — a reader
                // should still see the words.
                parts.push(label);
            } else if (href.startsWith("/")) {
                parts.push(
                    <Link key={`${keyPrefix}-${i++}`} to={href} className="text-teal hover:underline">
                        {label}
                    </Link>
                );
            } else {
                parts.push(
                    <a
                        key={`${keyPrefix}-${i++}`}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal hover:underline"
                    >
                        {label}
                    </a>
                );
            }
        }
        remaining = remaining.slice(match.index + match[0].length);
    }
    return parts;
}

function parseTableRow(line) {
    return line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim());
}

export default function MarkdownLite({ content }) {
    const lines = content.split("\n");
    const blocks = [];
    let i = 0;
    let key = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (!line.trim()) {
            i++;
            continue;
        }

        // Table: header row + separator row (---|---)
        if (line.trim().startsWith("|") && lines[i + 1] && /^\|?\s*-+\s*\|/.test(lines[i + 1])) {
            const header = parseTableRow(line);
            const rows = [];
            i += 2;
            while (i < lines.length && lines[i].trim().startsWith("|")) {
                rows.push(parseTableRow(lines[i]));
                i++;
            }
            blocks.push(
                <div key={key++} className="overflow-x-auto my-5 -mx-1">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="border-b border-line">
                                {header.map((cell, ci) => (
                                    <th key={ci} className="text-left font-semibold py-2 px-3 align-top">
                                        {renderInline(cell, `th-${key}-${ci}`)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, ri) => (
                                <tr key={ri} className="border-b border-line/60">
                                    {row.map((cell, ci) => (
                                        <td key={ci} className="py-2 px-3 align-top text-ash">
                                            {renderInline(cell, `td-${key}-${ri}-${ci}`)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
            continue;
        }

        // Headings
        if (line.startsWith("### ")) {
            blocks.push(
                <h3 key={key++} className="font-display text-lg mt-8 mb-2">
                    {renderInline(line.slice(4), `h3-${key}`)}
                </h3>
            );
            i++;
            continue;
        }
        if (line.startsWith("## ")) {
            blocks.push(
                <h2 key={key++} className="font-display text-xl mt-10 mb-3 pb-2 border-b border-line">
                    {renderInline(line.slice(3), `h2-${key}`)}
                </h2>
            );
            i++;
            continue;
        }

        // Blockquote (template notices)
        if (line.startsWith("> ")) {
            const quoteLines = [];
            while (i < lines.length && lines[i].startsWith(">")) {
                quoteLines.push(lines[i].replace(/^>\s?/, ""));
                i++;
            }
            blocks.push(
                <blockquote
                    key={key++}
                    className="border-l-2 border-mango bg-mango/10 text-ash text-sm rounded-r-md px-4 py-3 my-5"
                >
                    {renderInline(quoteLines.join(" "), `bq-${key}`)}
                </blockquote>
            );
            continue;
        }

        // Numbered list
        if (/^\d+\.\s/.test(line.trim())) {
            const items = [];
            while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
                items.push(lines[i].trim().replace(/^\d+\.\s/, ""));
                i++;
            }
            blocks.push(
                <ol key={key++} className="list-decimal pl-5 space-y-1.5 my-4 text-ash">
                    {items.map((it, ii) => (
                        <li key={ii}>{renderInline(it, `ol-${key}-${ii}`)}</li>
                    ))}
                </ol>
            );
            continue;
        }

        // Bulleted list
        if (/^[-*]\s/.test(line.trim())) {
            const items = [];
            while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
                items.push(lines[i].trim().replace(/^[-*]\s/, ""));
                i++;
            }
            blocks.push(
                <ul key={key++} className="list-disc pl-5 space-y-1.5 my-4 text-ash">
                    {items.map((it, ii) => (
                        <li key={ii}>{renderInline(it, `ul-${key}-${ii}`)}</li>
                    ))}
                </ul>
            );
            continue;
        }

        // Italic effective-date/version line at the top
        if (line.startsWith("*") && line.endsWith("*") && !line.startsWith("**")) {
            blocks.push(
                <p key={key++} className="text-ash text-sm italic mb-6">
                    {line.slice(1, -1)}
                </p>
            );
            i++;
            continue;
        }

        // Paragraph (collect contiguous non-blank plain lines)
        const paraLines = [line];
        i++;
        while (
            i < lines.length &&
            lines[i].trim() &&
            !lines[i].startsWith("#") &&
            !lines[i].startsWith(">") &&
            !lines[i].trim().startsWith("|") &&
            !/^\d+\.\s/.test(lines[i].trim()) &&
            !/^[-*]\s/.test(lines[i].trim())
        ) {
            paraLines.push(lines[i]);
            i++;
        }
        blocks.push(
            <p key={key++} className="text-ash leading-relaxed my-3">
                {renderInline(paraLines.join(" "), `p-${key}`)}
            </p>
        );
    }

    return <div className="legal-doc">{blocks}</div>;
}
