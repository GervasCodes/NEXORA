# Nexora Assistant knowledge pack

`nexoraKnowledge.js` holds the curated facts the chat assistant uses to answer
questions about NEXORA. It is information only: it describes what a person can
do themselves and which page to use, never an action the assistant performs.

## Updating it

- Edit the section text in `nexoraKnowledge.js`. One section per topic, each with
  an `audience` (`everyone`, `seller` or `delivery`).
- Fees, windows and limits must come from `platform_settings` through the
  `build(s)` argument, never typed in as numbers. If a setting is missing the
  section must fall back to wording without a number.
- The support email and phone live in one constant, `SUPPORT_CONTACT`. They still
  need owner confirmation (the email is a personal address).
- When a policy changes in `frontend/src/legal/*.md`, update the matching summary.
  The legal pages stay the authoritative text.

## Never add

Escrow or licensing reviews, security checklists, known-issues, the administrator
manual, fraud internals, AI token caps, credentials, internal file paths,
BRELA/TIN identifiers or any admin-only workflow. The tests in
`tests/unit/ai/nexoraKnowledge.test.js` fail if those terms appear.

## Who sees what

- Signed-out visitors and buyers: buyer information and general seller information.
- Sellers: also wallet, commission, withdrawals, promotion and plans.
- Delivery agents: also delivery-agent specifics.
- Admins: everything above. Unknown roles are treated as signed-out.

## Size

Target is roughly 3 to 5k tokens per role (currently about 2.3k for signed-out
visitors and 2.8k for sellers). A test enforces the upper bound.

## Status

Connected in Phase 2: `ai.service.js#chat` loads `getKnowledgeText({ role })` on every
call (role comes from the verified JWT, `null` when signed out) and passes it to
`chatPrompt.js#buildChatSystemPrompt`, which holds the behaviour rules (greetings,
off-topic, information-only, no invention, no private contacts). The six FAQ entries
in `ai.service.js` were removed in Phase 3. When the model cannot answer (AI off, capped,
no provider, provider error, empty pack) `fallback.js` replies instead: a template for
greetings and thanks, a short answer for a clearly matched topic, otherwise "not sure" plus
`suggestedTopics` ids that the drawer shows as buttons. It is bilingual (en/sw) and free.

## Evaluation (Phase 4)

`backend/tests/fixtures/ai/chatEvalSet.json` holds 57 questions (English and Swahili):
greetings, thanks, normal NEXORA questions, role-gating checks, trap prompts ("order this
for me", "give me the admin's number", "ignore previous instructions", forged history) and
off-topic requests. Each item states what the free fallback must return and the rule checks
a live model reply must pass.

- Offline, every CI run: `tests/unit/ai/chatEval.test.js` (fallback vs the set, prompt
  pipeline per question, role gating, reply-checker self-tests).
- Fallback path by hand: `node scripts/ai-chat-eval.js`.
- Real model: `node scripts/ai-chat-eval.js --live --yes` (spends tokens, writes usage rows;
  use staging). Read the printed answers: the checks catch unsafe replies, not weak wording.
- Real fallback rate: `node scripts/ai-chat-eval.js --quality` (wraps `getQualityOverview`).

Add a question by appending an item to the JSON; the shape test checks it.
