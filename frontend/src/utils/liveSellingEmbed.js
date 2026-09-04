/**
 * (UI/UX remediation) - Live Selling in-app viewing.
 *
 * live_selling_sessions only ever stores a plain external_link (see
 * migration 089/099's comments - this is a scheduling/announcement
 * layer, not real streaming infrastructure), so there's no backend
 * concept of "is this embeddable". This is a client-side best-effort:
 * recognize a handful of common platforms' watch-page URL shapes and
 * convert them to that platform's own embed URL, so those sessions can
 * play inline instead of always navigating away. Any link this doesn't
 * recognize still gets a working "open in new tab" link - this never
 * blocks watching a session, it only sometimes upgrades the experience.
 */
export function getEmbedUrl(url) {
    if (!url) return null;

    try {
        const parsed = new URL(url);
        const host = parsed.hostname.replace(/^www\./, "");

        // YouTube: watch?v=, youtu.be/<id>, or an existing /embed/ link.
        if (host === "youtube.com" || host === "m.youtube.com") {
            const videoId = parsed.searchParams.get("v");
            if (videoId) return `https://www.youtube.com/embed/${videoId}`;
            if (parsed.pathname.startsWith("/embed/")) return url;
            if (parsed.pathname.startsWith("/live/")) {
                const id = parsed.pathname.split("/")[2];
                if (id) return `https://www.youtube.com/embed/${id}`;
            }
        }
        if (host === "youtu.be") {
            const videoId = parsed.pathname.slice(1);
            if (videoId) return `https://www.youtube.com/embed/${videoId}`;
        }

        // Facebook video/live links - Facebook's own oEmbed-style plugin
        // wraps the original URL rather than needing an id extracted.
        if (host === "facebook.com" || host === "fb.watch") {
            return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`;
        }

        return null;
    } catch {
        return null;
    }
}
