# Changelog

Notable changes to Stil. Versions follow semantic versioning. Dates are the
release dates of the tagged source.

## [0.3.0] — 2026-10-22

### Added

- Bundled YouTube scriptlets from the pinned upstream Safari release
  `2026.1021.1354`, with a reproducible importer and recorded checksums.
- Registration in Safari's MAIN and ISOLATED worlds at `document_start`, scoped
  to exact YouTube hostnames and skipped for paused sites.
- Filtering of initial player data, Fetch/XHR player responses and sponsored
  Shorts entries.
- Popup status showing the loaded upstream filter release in both execution
  worlds.
- `THIRD_PARTY.md`, upstream corresponding sources and GPL-3.0-or-later
  licensing for the combined work.

### Changed

- Released as **Stil** for the first public release.
- Added a signed and notarized release workflow plus user-facing install
  documentation.
- Native app deployment target is macOS 13.6, with universal Apple silicon and
  Intel builds.
- Minimum supported Safari version is now 18.6.
- Stil is distributed under GPL-3.0-or-later because it incorporates
  third-party GPL filter code.
- `#player-ads` is no longer hidden cosmetically, matching upstream's YouTube
  compatibility filters.
- Build output verifies manifest resources before the extension is packaged.

### Fixed

- Document-start filtering now runs before the page consumes initial player
  data, instead of after a late message round-trip.
- Saved site and global pause settings are respected across page and browser
  reloads.

## [0.2.0]

### Added

- Best-effort YouTube ad skipping: advances finite, seekable ad videos, hides
  common sponsored placements and restores the previous mute state.
- Per-site pause list with exact-host matching, including cross-origin frames.

### Changed

- Cookie hiding and ad blocking can be controlled independently.

## [0.1.0]

### Added

- Initial Safari Web Extension: declarative network filtering for a curated
  starter list, reversible cookie-banner hiding, ad-container hiding, toolbar
  popup and local-only settings.
