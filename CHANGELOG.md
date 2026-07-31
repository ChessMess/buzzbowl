# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- After a touchdown, the game now keeps running (players moving, clock ticking) during the
  celebration window instead of freezing; the pause now only triggers once the window ends.
  The window was also extended from 40 frames (~0.7s) to 120 frames (2s). The Matter collision
  handler no longer pauses the play immediately on the endzone hit.
- Changed the Vite `base` to `./` (relative) so the same build serves correctly from any
  subpath: `buzzbowl.org/` (Firebase deploy at the site root) and the GitHub Pages test site at
  `brettkulp.github.io/buzzbowl/`. The previous deploy placed `dist` at the site root while
  `index.html` referenced absolute `/buzzbowl/assets/*`, so asset requests were caught by the
  SPA rewrite and returned `index.html` (`text/html`), breaking module script loading.
- Updated `firebase.json` caching so `index.html` is served with `no-cache` while hashed JS/CSS
  assets use long-lived immutable caching. Previously `index.html` was cached for an hour, so
  after a deploy a stale cached page could request an old hashed bundle that no longer existed,
  and the SPA catch-all rewrite returned `index.html` (MIME `text/html`) in its place, breaking
  module script loading.

### Changed

- Split `App.jsx` into `Header`, `Footer`, `EmailSignup`, and `OtherWork` components under
  `src/components/`, and moved the Firebase app/Firestore setup into `src/firebase.js`.
  `EmailSignup` now owns its own email/submitted state instead of `App` holding it. The email
  input is now a controlled component (it was missing `value`, so it never visually cleared
  after a successful submission).
- The "My Other Work & Partners" section only renders when the app is served from
  `buzzbowl.org`/`www.buzzbowl.org`, so forks and local dev builds don't show Brett Kulp's
  partner links.
- Reworked the header and footer with a subtle retro theme (warm palette, an "Alfa Slab One"
  wordmark, a gradient accent stripe) and tightened their spacing so the game menu is visible
  without scrolling on a typical viewport. The header is now a compact badge + wordmark instead
  of two large flanking logos, the long "how to play" instructions collapse into a native
  `<details>` disclosure above the game, and the footer's contact/contributing links are a
  single condensed row.
- Added a small gap between the header's bottom accent stripe and the text below it.
- Reverted the site palette from the retro brown/mustard scheme to Vite's default gray with a
  purple accent that matches the in-game `Button` color (`#4444aa`). The header's "Buzz Bowl"
  wordmark is now white and the background is dark gray again.
- Restored the flanking mirrored football logos around the header wordmark, and restyled the
  "How to play" disclosure from a purple-outlined pill into a solid purple button that matches
  the in-game buttons. Removed the purple border around the header logos, and replaced the
  purple accent stripe below the header with a neutral gray line. Restored the layered
  `text-shadow` effect on the "Buzz Bowl" wordmark with a dark gray offset.

### Fixed

- `PhaserGame` now forces a scale recheck (`game.scale.refresh()`) when the tab becomes visible.
  Phaser's `Scale.FIT` mode only recalculates on a window resize/orientation event or its own
  ~500ms poll, and that poll rides the game's render loop, which browsers throttle in a
  background tab — a game booted while its tab wasn't visible could lock in a stale canvas size
  with nothing left to correct it.
- `#game-container` only capped its size by viewport *width*, deriving height from a fixed 16:9
  `aspect-ratio`. On a wide-but-short browser window that height overran the fold with nothing
  to shrink it. Its width now also factors in the remaining viewport height, so it never grows
  past what actually fits above the fold.
### Added

- Rounded-corner players (both ends) with two thin white stripes on the front edge to visually distinguish facing direction at a glance.
- Console logging (unconditional) around the play lifecycle — snap, tackles, down/first-down/turnover resolution, and possession changes are tagged `[DEBUG]` via `console.log`; the high-volume per-collision trace is tagged `[DEBUG:collision]` via `console.debug` so it can be filtered out (or hidden by turning off "Verbose" in the browser console) without losing the rest — to help diagnose in-game rules bugs going forward.
- Save game progress to `localStorage` so a Standard Game survives a page refresh. A "Resume
  Game" button appears on the main menu whenever a save exists; starting a fresh Standard Game
  or Free Play, or finishing all four quarters, leaves no stale save behind.
- Play review: a "Review Play" button next to the Menu button lights up once a play ends.
  Drag the timeline scrubber above the field, or step through in eighths with the arrow
  buttons, to watch all 22 players retrace their exact recorded path — including any
  mid-play possession change. The button becomes "Resume" while reviewing and puts everyone
  back on their end-of-play spot. Recording runs to the true end of the play rather than the
  whistle, so a touchdown replay includes the run on into the endzone during the celebration
  window, and Review Play only lights up once everything has actually stopped moving.
  Recording is capped at 1800 frames (~30s at 60fps, about 3KB/frame) per play, so a play
  that never draws a tackle can't grow unbounded.

### Fixed

- Player collision body now matches the visible base (rectangle sized to the base's width/height) instead of an oversized circle that extended well past the drawn shape.
- Tackles no longer bounce the ball carrier and tackler apart before the down is called: pausing a play now freezes every player's physics body in place instead of only zeroing velocity, so Matter's collision-resolution can't shove overlapping bodies apart after contact.
- Menu navigation (`MainMenu` and the in-game "Menu" button) now always restarts the target
  scene instead of waking a previously slept one. Waking never re-ran a scene's `init()`, so
  once you'd visited Standard Game or Free Play once, every later visit silently replayed
  whatever state was left in memory — most visibly, starting a new Standard Game after
  bouncing through Free Play would resume the old game instead of starting fresh.
- Touchdowns were firing about 3 yards early on the left end zone (barely early on the right): the end zone sensors were hardcoded at positions that weren't actually symmetric relative to their own goal lines (the left sensor sat 9px past its goal line, the right one only 1px off). Both are now derived from the same goal-line formula, so a touchdown fires consistently on either side as soon as any part of the ball carrier crosses the goal line (leading edge, as before), not when their center does. The frame-by-frame tunneling backstop in `update()` used the same stale hardcoded positions and has been updated to match.
- Player collision bodies are now chamfered to match the rounded corners of the drawn base, so a tackle can no longer register on a sharp rectangular corner while the rounded visual corners still show daylight between the two players.
- The save now updates immediately after every tackle, not just on formation/possession/
  Next Play changes — refreshing while the "Down!"/"Touchdown" popup is showing no longer
  loses that play's result.
- Refreshing during the tackle popup after a touchdown or turnover on downs no longer
  loads stale possession state. The possession change for those events is deferred to
  `nextPlay`, so `scored` and `turnoverOnDowns` are now saved with the game state and
  `loadGame` applies the pending possession change on resume, keeping the state
  consistent.
- Defensive formation positions are now clamped to the canvas the same way offense already
  was. Near either goal line — most reliably right after a change of possession pins the line
  of scrimmage deep — defenders (especially deep safeties) could be placed hundreds of pixels
  off-canvas.
- The in-game "Restart" button now actually starts a fresh game after a game was entered via
  "Resume Game". `scene.restart()` with no argument keeps whatever data the scene was
  originally started with, so a resumed game kept replaying the same save every time Restart
  was clicked, making the button look like it did nothing.
- `createPlayers()` no longer hardcodes `hasBall` on the Home RB based on the offensive
  formation. After a possession-change resume, `checkBallCarrier()` only touches the current
  offense's players, leaving the now-defensive Home RB with a stale ball-carrier flag —
  which created a phantom second ball carrier and triggered an immediate tackle at play
  start. The ball carrier is now assigned exclusively by `checkBallCarrier()` during the
  formation toggle, the same way it is during normal gameplay.

## [0.1.0] - 2026-07-28

### Added
- Initial Buzz Bowl prototype: Phaser 3 game rendered inside a React/Vite shell.
- Main menu with mode selection.
- Free play mode (manual possession, no game clock).
- Standard game mode (quarters, game clock, downs).
- Firebase Hosting deploy script.
- GitHub Pages preview deploy workflow.
