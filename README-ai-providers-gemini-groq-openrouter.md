# NEXORA — Add Gemini, Groq, OpenRouter AI providers

Ad hoc addition to the existing pluggable AI-provider system
(`backend/src/modules/ai/providers/`), which already supported
`anthropic` and `openai`. This adds three more adapters behind the same
`AI_PROVIDER` env-var switch — no roadmap phase number, no changes to
`ai.service.js` or any feature logic, since the registry already fully
decouples the two.

## Is this safe to add?

Yes, with the same caveats that already applied to the two existing
providers:

- **No behavior changes with nothing configured.** `AI_PROVIDER` is
  unset by default; every AI feature already has a rule-based
  fallback and works with zero providers wired up. Adding three more
  *options* to a switch that defaults to "off" doesn't change any
  existing deployment's behavior.
- **Same trust boundary as before.** Whichever provider you pick
  receives the same `SAFETY_PREAMBLE`-wrapped prompts as
  anthropic/openai did — user-submitted text is passed as data, not
  instructions, and the model is never given order/payment/moderation
  authority (see `ai.service.js`'s `SAFETY_PREAMBLE`). None of that
  changes per-provider.
- **Fail-open, not fail-open-to-a-crash.** Each new adapter's
  `isConfigured()` gate and `registry.validateRegistry()`'s boot-time
  check work exactly like the existing two: a typo'd `AI_PROVIDER` or
  a missing key logs a warning and falls back, it doesn't throw.
- **Your API keys, your cost/quota exposure.** The genuinely new risk
  is entirely operational, not a code-safety issue: whichever key you
  put in `GEMINI_API_KEY` / `GROQ_API_KEY` / `OPENROUTER_API_KEY`
  starts accruing usage against *that* vendor's account the moment
  `AI_PROVIDER` selects it. The existing spend-guard
  (`checkSpendGuard` / `ai_usage_log`, admin-configurable daily/monthly
  token caps) applies uniformly regardless of which provider is active,
  so the same protection you already had for anthropic/openai carries
  over unchanged — but it's a soft cap enforced by this app, not a
  hard limit enforced by the vendor, so keep the vendor's own
  dashboard limits/alerts on too. Never commit the key values
  themselves to the repo (this phase adds no `.env.example`, since one
  didn't exist in the repo before this phase — see the standing
  due-diligence note about that).
- **Only one provider is ever active at a time.** `AI_PROVIDER` selects
  a single adapter; setting multiple providers' API keys in `.env`
  simultaneously is harmless — only the one named by `AI_PROVIDER` is
  ever read.

## What changed

- `backend/src/modules/ai/providers/gemini.provider.js` (new) — Google
  Generative Language API. Its request/response shape differs from the
  other four (`systemInstruction` + `contents[]`, not OpenAI-style
  `messages[]`), so this one translates rather than reusing another
  file's body. Role mapping: `assistant` → Gemini's `model`, everything
  else → `user`.
- `backend/src/modules/ai/providers/groq.provider.js` (new) — Groq's
  endpoint is OpenAI-compatible, so this mirrors
  `openai.provider.js`'s request/response handling against
  `https://api.groq.com/openai/v1/chat/completions`.
- `backend/src/modules/ai/providers/openrouter.provider.js` (new) —
  also OpenAI-compatible, against
  `https://openrouter.ai/api/v1/chat/completions`. Adds two optional
  headers (`HTTP-Referer`/`X-Title`, from `AI_OPENROUTER_SITE_URL`/
  `AI_OPENROUTER_SITE_NAME`) purely for OpenRouter's own dashboard
  attribution — omitted entirely when unset, no effect on the API
  response either way.
- `backend/src/modules/ai/providers/registry.js` — registered all
  three new adapters in `PROVIDERS`; `getActiveProvider()`,
  `isAnyConfigured()`, and `validateRegistry()` needed no logic changes,
  since they were already written generically against the `PROVIDERS`
  map rather than hardcoding "anthropic or openai".
- `backend/tests/unit/ai/registry.test.js` — extended the existing
  "selected and configured" cases to cover `gemini`/`groq`/`openrouter`
  alongside the two that were already there.
- `backend/tests/unit/ai/gemini.provider.test.js`,
  `groq.provider.test.js`, `openrouter.provider.test.js` (new) — each
  covers `isConfigured()`, a mocked-`fetch` happy path asserting the
  request shape sent and the response normalized to the shared
  `{ text, inputTokens, outputTokens }` contract, and a non-ok response
  throwing (so `ai.service.js`'s `callProvider` falls back correctly).
- `docs/DEPLOYMENT.md` — added a "6.7 AI providers (optional)" section
  documenting `AI_PROVIDER`'s now-five supported values, their required
  keys, and default models, since no such section existed for
  anthropic/openai either before this phase.

`ai.service.js` itself, `ai.controller.js`, `ai.routes.js`, and every
feature function were **not touched** — they already call only
`registry.getActiveProvider()` / `registry.isAnyConfigured()` and never
reference a provider name directly.

## New env vars

| Var | Required for | Notes |
|---|---|---|
| `GEMINI_API_KEY` | `AI_PROVIDER=gemini` | |
| `GROQ_API_KEY` | `AI_PROVIDER=groq` | |
| `OPENROUTER_API_KEY` | `AI_PROVIDER=openrouter` | |
| `AI_OPENROUTER_SITE_URL` | optional, openrouter only | For OpenRouter's attribution dashboard only |
| `AI_OPENROUTER_SITE_NAME` | optional, openrouter only | Same |

`AI_MODEL` (already existed) now also applies to these three, with a
new provider-specific default when unset — see the table in
`docs/DEPLOYMENT.md` §6.7.

## Testing

Full backend suite run after this change: **64 suites / 909 tests
passing** (up from 61/900 before — 3 new files × ~3 tests each, plus
the registry file's tests extended in place), lint untouched (no lint
run requested this phase, no new lint-relevant patterns introduced —
files closely mirror the existing openai/anthropic providers' style).

## Not done / out of scope

- **No admin-UI dropdown.** There isn't one today for anthropic/openai
  either — provider selection is `AI_PROVIDER` env-var only, unchanged
  by this phase.
- **No `.env.example`.** Confirmed still absent from the repo root
  (flagged previously in the due-diligence report); adding one is a
  separate, repo-wide decision, not specific to this phase.
- **PROGRESS.md** was not present in this upload of the repo to update
  — if you're tracking this alongside the numbered roadmaps, it can be
  logged as an ad hoc entry once that file is available.
