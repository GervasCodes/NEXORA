# NEXORA – all phases (1–5), combined

Contents: the files for the language/theme navbar controls (Phase 1), Home welcome line (Phase 2), holiday backend and settings (Phase 3), holiday visuals (Phase 4), and tests plus admin manual (Phase 5), at their current state in the uploaded NEXORA.zip.

IMPORTANT: this was assembled from the final repo state by searching for the phase features, not from the per-phase zips, so a file touched by an earlier phase that I did not recognise could be missing. Per-file details are in each phase's own CHANGES.md; Phase 5 notes are below.

Known gap: AdminSettings.jsx has no "Holiday theme" card (Phase 3, item 3), so it is not in this package.

# NEXORA Phase 5 – QA, docs, final package

## New files (NEXORA/frontend/tests/)
- components/LanguageToggle.test.jsx – 10 tests: closed by default (aria-haspopup / aria-expanded), lists every entry in LANGUAGES with the active one checked, selecting switches language and closes, closes on Escape (focus returns to trigger), outside click, route change and Tab; ArrowDown/ArrowUp/Home/End and Enter; mobile "row" variant expands in place.
- components/WelcomeBackLine.test.jsx – 5 tests on the Home hero line: plain `<p>` (no pill classes, no icon), `whitespace-nowrap truncate max-w-full` on a 120-character username, first-name fallback, hidden when signed out, Kiswahili text.
- context/HolidayContext.test.jsx – 13 tests: off until the server answers, Christmas / New Year visible, server off (covers admin-off and FORCE_OFF as seen by the storefront), unknown mode, request failure, reduced-motion, Data Saver, dismiss / remember / restore, dismissal is per season, localStorage unavailable, New Year year rollover helpers.
- components/holiday/Holiday.test.jsx – 10 tests: HolidayMount renders nothing when not visible and a `pointer-events-none` canvas when visible; animation pauses on hidden tab, resumes, and stops on unmount; particle caps; HolidayToggle hidden when inactive or suppressed and labelled correctly.

## Changed files
- NEXORA/docs/operations/administrator-manual.md – settings table row plus a "Turning the holiday theme on or off" section (the three settings, auto date rules, Tanzania time, API steps, `HOLIDAY_THEME_DEFAULT`, `HOLIDAY_THEME_FORCE_OFF`, `HOLIDAY_THEME_TIMEZONE`).

No application source files were changed in this phase.

## Verified
- The 4 new files plus the existing Header test: 41/41 pass (vitest). ESLint clean on the new test files.

## Could not verify / open items
- **Phase 3 gap:** `AdminSettings.jsx` has no "Holiday theme" card (no holiday code in that file). The backend keys and endpoint exist, so the manual describes the API route and says so. Not built here because it is Phase 3 work.
- Backend tests (holidayTheme unit and integration, force-off, admin auth, year rollover) already exist from Phase 3 but I could not run them: `npm ci` failed in this environment.
- Full frontend suite was not re-run, only the files above.
- Manual checks at 360px / tablet / desktop, light/dark, EN/SW were not repeated; Phase 4 covered 360 and 1280 only. Tests are jsdom, so no real layout, truncation rendering or visual check.
- Known existing issue from Phase 4: at 360px the homepage skeleton rails overflow horizontally.
