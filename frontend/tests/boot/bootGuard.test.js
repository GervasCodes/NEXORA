// public/boot-guard.js runs before the React app. It must (a) show a clear message and a Reload
// button when the app fails to start or is far too slow, (b) stay silent when the app starts, and
// (c) never rely on inline script (the site's CSP forbids it).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ROOT = join(__dirname, "../..");
const guardSource = readFileSync(join(ROOT, "public/boot-guard.js"), "utf8");

const run = () => new Function(guardSource)(); // eslint-disable-line no-new-func

const box = () => document.getElementById("nexora-boot-failure");

describe("boot-guard.js", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '<div id="root"><main data-prerender="true"><h1>NEXORA</h1></main></div>';
        document.documentElement.removeAttribute("data-app-mounted");
        delete window.__nexoraBootErrors;
        delete window.__nexoraBootGuard;
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("shows nothing while there is still time", () => {
        run();
        vi.advanceTimersByTime(14_900);
        expect(box()).toBeNull();
    });

    it("after 15 seconds without the app starting, shows an alert with a Reload button", () => {
        run();
        vi.advanceTimersByTime(15_100);
        expect(box()).not.toBeNull();
        expect(box().getAttribute("role")).toBe("alert");
        expect(box().textContent).toContain("taking longer than usual");
        const button = box().querySelector("button");
        expect(button).not.toBeNull();
        expect(button.textContent).toBe("Reload");
        expect(button.type).toBe("button");
    });

    it("keeps the prerendered shell in place underneath the message", () => {
        run();
        vi.advanceTimersByTime(15_100);
        expect(document.querySelector("main[data-prerender] h1").textContent).toBe("NEXORA");
        expect(document.getElementById("root").firstChild).toBe(box());
    });

    it("stays silent when the app has started", () => {
        run();
        document.documentElement.setAttribute("data-app-mounted", "1");
        vi.advanceTimersByTime(60_000);
        expect(box()).toBeNull();
    });

    it("shows the message immediately when a script fails to load", () => {
        run();
        const script = document.createElement("script");
        script.src = "/assets/index-abc123.js";
        document.head.appendChild(script);
        script.dispatchEvent(new Event("error"));
        expect(box()).not.toBeNull();
        expect(window.__nexoraBootErrors[0]).toMatchObject({ kind: "resource" });
        expect(window.__nexoraBootErrors[0].detail).toContain("index-abc123.js");
        script.remove();
    });

    it("shows the message immediately when a stylesheet fails to load", () => {
        run();
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "/assets/index-abc123.css";
        document.head.appendChild(link);
        link.dispatchEvent(new Event("error"));
        expect(box()).not.toBeNull();
        link.remove();
    });

    it("does not show a message for a failed script once the app has started", () => {
        run();
        document.documentElement.setAttribute("data-app-mounted", "1");
        const script = document.createElement("script");
        document.head.appendChild(script);
        script.dispatchEvent(new Event("error"));
        expect(box()).toBeNull();
        script.remove();
    });

    it("never adds the message twice", () => {
        run();
        const script = document.createElement("script");
        document.head.appendChild(script);
        script.dispatchEvent(new Event("error"));
        script.dispatchEvent(new Event("error"));
        vi.advanceTimersByTime(20_000);
        expect(document.querySelectorAll("#nexora-boot-failure")).toHaveLength(1);
        script.remove();
    });

    it("records uncaught errors and rejections that happen before the app starts", () => {
        run();
        window.dispatchEvent(new ErrorEvent("error", { message: "boom", error: new Error("boom") }));
        const rejection = new Event("unhandledrejection");
        rejection.reason = new Error("nope");
        window.dispatchEvent(rejection);
        expect(window.__nexoraBootErrors.map((e) => e.kind)).toEqual(expect.arrayContaining(["error", "rejection"]));
    });

    it("stops recording once the app has started and keeps at most 10 entries", () => {
        run();
        for (let i = 0; i < 25; i += 1) window.dispatchEvent(new ErrorEvent("error", { message: `e${i}` }));
        expect(window.__nexoraBootErrors).toHaveLength(10);
        document.documentElement.setAttribute("data-app-mounted", "1");
        const before = window.__nexoraBootErrors.length;
        window.dispatchEvent(new ErrorEvent("error", { message: "late" }));
        expect(window.__nexoraBootErrors).toHaveLength(before);
    });

    it("speaks Kiswahili for a Swahili browser", () => {
        vi.spyOn(window.navigator, "language", "get").mockReturnValue("sw-TZ");
        run();
        vi.advanceTimersByTime(15_100);
        expect(box().textContent).toContain("inachukua muda mrefu");
        expect(box().querySelector("button").textContent).toBe("Pakia upya");
    });

    it("honours ?lang=sw over the browser language", () => {
        window.history.pushState({}, "", "/?lang=sw");
        run();
        vi.advanceTimersByTime(15_100);
        expect(box().querySelector("button").textContent).toBe("Pakia upya");
        window.history.pushState({}, "", "/");
    });

    it("clear() removes the message (called by main.jsx when the app finally starts)", () => {
        run();
        vi.advanceTimersByTime(15_100);
        expect(box()).not.toBeNull();
        window.__nexoraBootGuard.clear();
        expect(box()).toBeNull();
    });
});

describe("index.html start-up wiring", () => {
    const html = readFileSync(join(ROOT, "index.html"), "utf8");

    it("loads boot.css and boot-guard.js before the app bundle", () => {
        const css = html.indexOf('href="/boot.css"');
        const guard = html.indexOf('src="/boot-guard.js"');
        const app = html.indexOf('src="/src/main.jsx"');
        expect(css).toBeGreaterThan(-1);
        expect(guard).toBeGreaterThan(-1);
        expect(app).toBeGreaterThan(guard);
    });

    it("has no inline executable script (the CSP forbids it): only external scripts and JSON-LD", () => {
        const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
        const scripts = [...withoutComments.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
        const inlineExecutable = scripts.filter(([, attrs, body]) => !/\bsrc=/.test(attrs) && !/application\/ld\+json/.test(attrs) && body.trim());
        expect(inlineExecutable).toHaveLength(0);
    });

    it("main.jsx signals that the app has started", () => {
        const main = readFileSync(join(ROOT, "src/main.jsx"), "utf8");
        expect(main).toContain('setAttribute("data-app-mounted", "1")');
    });
});
