# Phase 3 - Fallback and drawer UX (Workstream A)

Apply AFTER the Phase 2 zip (it builds on chatPrompt.js and the Phase 2 edits to
ai.service.js, ai.controller.js, README.md and the two test files below).

Scope: greetings and thanks get a template reply even when AI is off or capped;
the generic fallback is replaced by suggested-topic buttons; the drawer welcome
text is updated and the whole drawer is now translated (en/sw).

## Files added (2)
- backend/src/modules/ai/knowledge/fallback.js
- backend/tests/unit/ai/fallback.test.js

## Files modified (11)
- backend/src/modules/ai/ai.service.js (chat() fallback only; FAQ_KNOWLEDGE/findFaqMatch removed)
- backend/src/modules/ai/ai.controller.js (passes optional `language`)
- backend/src/modules/ai/ai.validator.js (optional `language`: "en" | "sw")
- backend/src/modules/ai/knowledge/README.md
- backend/tests/unit/ai/ai.service.test.js
- backend/tests/integration/ai.routes.test.js
- frontend/src/components/ai/NexoraAIDrawer.jsx
- frontend/src/api/ai.js (sendChatMessage sends `language`)
- frontend/src/i18n/en.js (28 `assistant.*` keys appended)
- frontend/src/i18n/sw.js (same 28 keys)
- frontend/tests/components/ai/NexoraAIDrawer.test.jsx

## Files deleted
None (the six FAQ entries were removed from ai.service.js, not a file).

## New env vars / migrations / dependencies
None.

## How to apply
Unzip over the repository root (paths are relative to the NEXORA/ folder).

## How to test
    cd backend
    npx cross-env NODE_ENV=test jest --runInBand tests/unit/ai tests/integration/ai.routes
    npx eslint src/modules/ai tests/unit/ai tests/integration/ai.routes.test.js
    cd ../frontend
    npx vitest run
    node scripts/check-jsx-literals.mjs src | grep NexoraAIDrawer   # expect no output

Manual: set AI off in Admin Settings (or remove the provider key), open the drawer,
then try: "mambo", "asante", "how do I track my order", "qwerty", and tap each topic
button in English and in Swahili (toggle SW|EN, close and reopen the drawer).

## Behaviour
- Backend `knowledge/fallback.js` (pure, no DB, no tokens):
  - Greeting ("hi", "mambo", "habari yako"...) -> friendly template + topic buttons.
  - Thanks ("thanks", "asante sana"...) -> short template, no buttons.
  - Clear topic match (track, refunds/returns, payments, cancel, become seller,
    bookings, support) -> a short answer in the person's language.
  - Anything else -> "I'm not sure..." + the 6 topic buttons. No dead end.
  - A greeting followed by a real question ("hi, how do I track my order?") is treated
    as a question, not small talk. Words match whole words/stems, so "facebook" does not
    trigger "book".
  - Language: clear markers in the message win; otherwise the drawer's UI language
    (new optional `language` request field); otherwise English.
- Response gains `suggestedTopics: string[]` on the non-AI path only. Model answers are
  unchanged: `{ reply, aiGenerated: true, truncated }`.
- A "Show more" call when the model is unavailable now returns an empty reply, so the
  drawer keeps the existing bubble instead of appending a fallback sentence.
- Drawer: welcome message (en/sw) now describes the wider scope and the information-only
  rule; the welcome and every fallback reply show topic buttons (only on the latest
  assistant message; tapping one sends that topic's question). The old three chips
  ("Where's my order?", "How do I return?", "Find me a product") were removed.
- Drawer strings (title, tagline, placeholder, send, close, show more, limit notes,
  error messages) are now t() keys, so the drawer adds no new lint:i18n hits.

## Test results
Backend AI suites: 13 suites, 209 tests pass. Backend tests/integration folder: 11 suites,
98 tests pass. Backend eslint: 0 errors, 1 pre-existing warning (`facts` unused).
Frontend: full vitest run 90 files, 555 tests pass. Drawer: 14 tests pass.
Frontend eslint on the drawer: 1 error (jsx-a11y no-noninteractive-element-interactions on
the dialog's onKeyDown) that is also present in the original file; not changed here.
Not done: live-provider run, browser/visual check of the buttons on a phone.

## Decisions / notes for you
1. SWAHILI REVIEW NEEDED: all Swahili text (fallback answers, templates, 28 UI keys) was
   written by AI and has not been checked by a native speaker. UI terms reuse existing
   sw.js wording (Maagizo, Fuatilia agizo, Migogoro, Ripoti tatizo, Uhifadhi).
2. Topic buttons: the six topics are track order, refunds and returns, payment options,
   cancel an order, become a seller, contact support. Say if you want others.
3. The button question strings exist in two places that must stay identical:
   backend fallback.js `TOPIC_QUESTIONS` and frontend i18n
   `assistant.topic.<id>.question`. A backend test checks each backend question resolves
   to its own answer, but nothing automatic compares the two files.
4. Offline topic answers restate the old FAQ plus Phase 1 pack facts at summary level and
   quote no numbers (return windows etc. are not in them). The support answer uses
   SUPPORT_CONTACT, so the pending owner confirmation of email/phone still applies.
5. Greetings and thanks are answered by template only when the model did not answer
   (AI off, capped, no provider, or error). When AI is on, they still go to the model.
   Say if you want them answered by template always, to save tokens.
