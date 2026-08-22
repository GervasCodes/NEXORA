# NEXORA — All phases (1–5)

Each phase is in its own folder with only the files that phase changed,
plus its own `PHASEn_CHANGES.md` explaining what and why. Apply them in
order (1 → 5), copying each folder's `frontend/...` files into the
matching paths in your NEXORA checkout — each phase builds on the last.

Note: `Header.jsx` appears in both `phase4_logout_confirmation/` and
`phase5_logo_mark/` — the copy in phase 5 is the final, cumulative
version (it already includes phase 4's confirmation-dialog change), so
if you're applying phase 5 you don't need phase 4's copy of that file
separately.

| Folder | Phase | Files changed |
|---|---|---|
| `phase1_personalized_greeting/` | Personalized "Welcome back, {name}" greeting | 3 |
| `phase2_session_expiry/` | 3-day idle session expiry + clear session-loss messaging | 3 |
| `phase3_auto_updates/` | Smarter, safer auto-apply of app updates | 1 |
| `phase4_logout_confirmation/` | Confirmation dialog before sign-out | 2 |
| `phase5_logo_mark/` | Circle-with-three-holes mark added to the nav | 1 |

Rebuild the frontend after applying (`npm run build` inside `frontend/`).
No backend or database changes were required for any of these phases.
