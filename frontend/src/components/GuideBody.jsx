import { Fragment } from "react";
import { Link } from "react-router-dom";

// Guide bodies are authored in the admin CMS (content_articles.body_markdown).
// This renderer never injects HTML: every node is a React element and text is
// escaped. Links and image sources pass an allow-list; anything else renders
// as plain text.

const SAFE_LINK = /^(https?:\/\/|mailto:|\/(?!\/))/;
const SAFE_IMAGE = /^(https:\/\/|\/(?!\/))/;
const BLOCK_START = /^(#{1,3}\s|!\[|>|[-*]\s|\d+\.\s)/;

function slugifyHeading(text, index) {
    const base = text
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 60) || "section";
    return `${base}-${index}`;
}

// Single source of truth for block structure: the table of contents and the
// rendered headings are both built from this, so their ids always match.
export function parseGuideBlocks(markdown) {
    const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
    const blocks = [];
    let headingIndex = 0;
    let i = 0;

    while (i < lines.length) {
        const trimmed = lines[i].trim();
        if (!trimmed) { i += 1; continue; }

        const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
        if (heading) {
            const text = heading[2].trim();
            blocks.push({ type: "heading", level: heading[1].length === 3 ? 3 : 2, text, id: slugifyHeading(text, headingIndex) });
            headingIndex += 1;
            i += 1;
            continue;
        }

        const image = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(trimmed);
        if (image) {
            blocks.push({ type: "image", alt: image[1], src: image[2] });
            i += 1;
            continue;
        }

        if (trimmed.startsWith(">")) {
            const quote = [];
            while (i < lines.length && lines[i].trim().startsWith(">")) {
                quote.push(lines[i].trim().replace(/^>\s?/, ""));
                i += 1;
            }
            blocks.push({ type: "quote", text: quote.join(" ") });
            continue;
        }

        if (/^[-*]\s+/.test(trimmed)) {
            const items = [];
            while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
                items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
                i += 1;
            }
            blocks.push({ type: "ul", items });
            continue;
        }

        if (/^\d+\.\s+/.test(trimmed)) {
            const items = [];
            while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
                items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
                i += 1;
            }
            blocks.push({ type: "ol", items });
            continue;
        }

        // Paragraph: always consume the first line so an unmatched block
        // marker (e.g. a lone "*") can't stall the loop.
        const para = [trimmed];
        i += 1;
        while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i].trim())) {
            para.push(lines[i].trim());
            i += 1;
        }
        // Lines are kept separate (not joined with a space) so a single
        // line break inside a paragraph can render as <br /> rather than
        // disappearing into collapsed whitespace.
        blocks.push({ type: "p", lines: para });
    }

    return blocks;
}

export function extractGuideHeadings(markdown) {
    return parseGuideBlocks(markdown)
        .filter((block) => block.type === "heading")
        .map(({ id, text, level }) => ({ id, text, level }));
}

const INLINE = /(\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g;

function renderInline(text, keyPrefix) {
    return text.split(INLINE).map((part, i) => {
        const key = `${keyPrefix}-${i}`;
        const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
        if (link) {
            const [, label, href] = link;
            if (!SAFE_LINK.test(href)) return <Fragment key={key}>{label}</Fragment>;
            if (href.startsWith("/")) return <Link key={key} to={href} className="text-teal hover:underline">{label}</Link>;
            return <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline">{label}</a>;
        }
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
            return <strong key={key}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
            return <em key={key}>{part.slice(1, -1)}</em>;
        }
        return <Fragment key={key}>{part}</Fragment>;
    });
}

export default function GuideBody({ markdown }) {
    const blocks = parseGuideBlocks(markdown);

    return (
        <div className="text-ink/90 text-[15px] leading-relaxed">
            {blocks.map((block, index) => {
                const key = `${block.type}-${index}`;
                switch (block.type) {
                    case "heading": {
                        const Tag = block.level === 3 ? "h3" : "h2";
                        const cls = block.level === 3
                            ? "font-display text-lg mt-8 mb-2 scroll-mt-24"
                            : "font-display text-xl mt-10 mb-3 pb-2 border-b border-line scroll-mt-24";
                        return <Tag key={key} id={block.id} className={cls}>{block.text}</Tag>;
                    }
                    case "image": {
                        if (!SAFE_IMAGE.test(block.src)) return null;
                        return (
                            <figure key={key} className="my-6">
                                <img src={block.src} alt={block.alt} loading="lazy" decoding="async" className="w-full rounded-md" />
                                {block.alt && <figcaption className="text-xs text-ash mt-2">{block.alt}</figcaption>}
                            </figure>
                        );
                    }
                    case "quote":
                        return <blockquote key={key} className="border-l-2 border-line pl-4 my-4 text-ash italic">{renderInline(block.text, key)}</blockquote>;
                    case "ul":
                        return (
                            <ul key={key} className="list-disc pl-6 mb-4 space-y-1">
                                {block.items.map((item, i) => <li key={i}>{renderInline(item, `${key}-${i}`)}</li>)}
                            </ul>
                        );
                    case "ol":
                        return (
                            <ol key={key} className="list-decimal pl-6 mb-4 space-y-1">
                                {block.items.map((item, i) => <li key={i}>{renderInline(item, `${key}-${i}`)}</li>)}
                            </ol>
                        );
                    default:
                        return (
                            <p key={key} className="mb-4">
                                {block.lines.map((line, i) => (
                                    <Fragment key={i}>
                                        {i > 0 && <br />}
                                        {renderInline(line, `${key}-${i}`)}
                                    </Fragment>
                                ))}
                            </p>
                        );
                }
            })}
        </div>
    );
}
