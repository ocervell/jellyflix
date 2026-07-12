# Android TV D-pad — keyboard E2E verification (2026-07-12)

Driven with Playwright real arrow-key + Enter + Escape events against `npm run dev`,
verifying norigin spatial navigation (focus detected via `[data-focused="true"]`).

## Verified working
- **Home:** initial focus lands on the first content card; ArrowRight/Left move within a
  row; ArrowUp/Down move between rows. Visible white focus ring + the hover-expand chrome
  appears under focus (hover→focus conversion works).
- **Enter** on a focused card opens the DetailModal; modal initial focus lands on
  Play/Continue.
- **Escape** closes the DetailModal and does NOT navigate away (back-stack consumes it).
- **Library grid:** initial focus on first poster; 2-D arrow navigation moves focus across
  tiles (e.g. "À l'aube de l'Amérique" → down/right → "Andor") with the focus ring +
  action overlay shown under focus (screenshot confirmed).
- Full unit suite green (160 tests), `npm run build` clean.

## Known gaps / follow-ups (see progress ledger)
- Native `<select>` (FilterBar "Sort by", EpisodeList season) are NOT wrapped in Focusable,
  so they are likely unreachable by pure D-pad (arrow-only) navigation — wrap them if the
  sort/season control must be remote-reachable.
- Initial `setFocus` races content load — reliable once content is in, but timing-sensitive
  right at mount.
- `aria-expanded` (toggles) / `role="menu"` (panels) dropped when converting to
  Focusable/FocusSection — a11y follow-up.
- Capacitor APK: `docs/tv-build.md` should document wiring Android hardware Back
  (`@capacitor/app` `backButton` event) to dispatch a keydown, since the web back-stack
  listens for keydown, not Capacitor's backButton (a plain TV browser already sends a keydown).

## Not exercised by automated E2E (reviewed in code; verify on-device)
- Player controls via D-pad + Scrubber Left/Right seek (±10s, single not double after the
  Task-7 keydown reconciliation); TrackMenu focus trap + Back-to-close; remote Back exits
  the player.
