/**
 * (UI/UX remediation) - minimal .ics (iCalendar) file builder for
 * "Add to calendar" on a scheduled Live Selling session. Purely
 * client-side, no library needed - a single VEVENT is a handful of
 * required lines.
 */
const toIcsDate = (isoString) => {
    // iCalendar wants UTC timestamps as YYYYMMDDTHHMMSSZ.
    return new Date(isoString).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
};

const escapeIcsText = (text = "") =>
    text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

export function buildLiveSellingIcs({ id, title, description, scheduledAt, externalLink }) {
    // A one-hour default duration - live_selling_sessions has no
    // end-time concept (see migration 089/099's comments on this
    // module's deliberately minimal scope), so this is a reasonable
    // placeholder duration rather than something read from real data.
    const start = new Date(scheduledAt);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//NEXORA//Live Selling//EN",
        "BEGIN:VEVENT",
        `UID:live-selling-${id}@nexora`,
        `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
        `DTSTART:${toIcsDate(scheduledAt)}`,
        `DTEND:${toIcsDate(end.toISOString())}`,
        `SUMMARY:${escapeIcsText(title)}`,
        `DESCRIPTION:${escapeIcsText(description || "")}${externalLink ? escapeIcsText(`\nWatch: ${externalLink}`) : ""}`,
        externalLink ? `URL:${externalLink}` : null,
        "END:VEVENT",
        "END:VCALENDAR"
    ].filter(Boolean);

    return lines.join("\r\n");
}

export function downloadIcs(icsContent, filename) {
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
}
