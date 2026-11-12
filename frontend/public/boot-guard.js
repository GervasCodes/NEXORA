/* Start-up guard. Loaded as a plain external script BEFORE the app bundle (an inline script would
   be blocked by the site's Content-Security-Policy, see docs/FRONTEND_CSP.md).
   It exists because, until React starts, a visitor sees only the prerendered text shell. If the
   bundle is slow, blocked or broken, that used to look like a dead page with no explanation.

   What it does:
     1. records script/stylesheet load failures and uncaught errors that happen before the app
        starts in window.__nexoraBootErrors (main.jsx forwards them to Sentry once the app is up);
     2. if a script/stylesheet fails to load, or the app has not started after MAX_WAIT_MS, shows a
        clear message (English or Kiswahili) with a Reload button;
     3. removes the message when the app does start.
   The app signals "started" by setting data-app-mounted="1" on <html> (see main.jsx). */
(function () {
    "use strict";

    var MAX_WAIT_MS = 15000;
    var errors = (window.__nexoraBootErrors = []);

    var TEXT = {
        en: {
            message: "NEXORA is taking longer than usual to load. Please check your connection and try again.",
            button: "Reload"
        },
        sw: {
            message: "NEXORA inachukua muda mrefu kupakia. Tafadhali angalia mtandao wako kisha jaribu tena.",
            button: "Pakia upya"
        }
    };

    function mounted() {
        return document.documentElement.getAttribute("data-app-mounted") === "1";
    }

    function record(kind, detail) {
        if (errors.length >= 10) return;
        var text;
        try { text = String(detail && (detail.message || detail.reason || detail) || kind); } catch (e) { text = kind; }
        errors.push({ kind: kind, detail: text.slice(0, 200), at: new Date().toISOString() });
    }

    function language() {
        var wanted = "en";
        try {
            var fromQuery = /[?&]lang=(sw|en)\b/.exec(window.location.search);
            if (fromQuery) return fromQuery[1];
            var nav = (navigator.language || "").toLowerCase();
            if (nav.indexOf("sw") === 0) wanted = "sw";
        } catch (e) { /* default to English */ }
        return wanted;
    }

    function show() {
        if (mounted() || document.getElementById("nexora-boot-failure")) return;
        var root = document.getElementById("root");
        if (!root) return;

        var copy = TEXT[language()] || TEXT.en;
        var box = document.createElement("div");
        box.id = "nexora-boot-failure";
        box.setAttribute("role", "alert");

        var paragraph = document.createElement("p");
        paragraph.textContent = copy.message;

        var button = document.createElement("button");
        button.type = "button";
        button.textContent = copy.button;
        button.addEventListener("click", function () { window.location.reload(); });

        box.appendChild(paragraph);
        box.appendChild(button);
        root.insertBefore(box, root.firstChild);
    }

    // Capture phase, because a failed <script>/<link> load does not bubble.
    window.addEventListener("error", function (event) {
        var target = event.target;
        if (target && target !== window && (target.tagName === "SCRIPT" || target.tagName === "LINK")) {
            record("resource", target.src || target.href);
            show();
            return;
        }
        if (!mounted()) record("error", event.error || event.message);
    }, true);

    window.addEventListener("unhandledrejection", function (event) {
        if (!mounted()) record("rejection", event.reason);
    });

    window.setTimeout(function () {
        if (!mounted()) {
            record("timeout", "app did not start within " + MAX_WAIT_MS + " ms");
            show();
        }
    }, MAX_WAIT_MS);

    // Exposed so main.jsx can clear the message when the app finally starts.
    window.__nexoraBootGuard = {
        clear: function () {
            var box = document.getElementById("nexora-boot-failure");
            if (box && box.parentNode) box.parentNode.removeChild(box);
        }
    };
})();
