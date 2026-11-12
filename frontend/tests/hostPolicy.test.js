import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const headers = readFileSync(resolve(process.cwd(), "public/_headers"), "utf8");
const doc = readFileSync(resolve(process.cwd(), "../docs/FRONTEND_CSP.md"), "utf8");
const redirects = readFileSync(resolve(process.cwd(), "public/_redirects"), "utf8");

const cspFromDoc = doc.split("```")[1].trim();
const cspFromHeaders = headers.match(/Content-Security-Policy: (.+)/)[1].trim();

describe("host header policy", () => {
    it("the versioned CSP is identical to the documented one", () => {
        expect(cspFromHeaders).toBe(cspFromDoc);
    });
    it("the policy forbids plugins, framing by other sites and inline script", () => {
        expect(cspFromHeaders).toContain("object-src 'none'");
        expect(cspFromHeaders).toMatch(/script-src 'self'(?! 'unsafe)/);
        expect(cspFromHeaders).not.toContain("script-src 'self' 'unsafe-inline'");
        expect(headers).toContain("X-Frame-Options: DENY");
    });
    it("hashed assets are cached forever, the service worker and shell never", () => {
        expect(headers).toMatch(/\/assets\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
        expect(headers).toMatch(/\/sw\.js\n\s+Cache-Control: no-cache/);
        expect(headers).toMatch(/\/index\.html\n\s+Cache-Control: no-cache/);
    });
    it("unknown paths fall back to the app shell", () => {
        expect(redirects).toMatch(/\/\*\s+\/index\.html\s+200/);
    });
});
