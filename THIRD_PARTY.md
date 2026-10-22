# Third-party filtering code

Stil includes YouTube filtering derived from **uBlock Origin Lite**, copyright
Raymond Hill and contributors, licensed under **GPL-3.0-or-later**. Stil is a
separate project, not an official uBlock Origin product. The combined project is
distributed under GPL-3.0-or-later; see `LICENSE`.

- Upstream: https://github.com/gorhill/uBlock
- Safari release: https://github.com/uBlockOrigin/uBOL-home/releases/tag/2026.1021.1354
- Checksummed artifact and selection details: `extension/vendor/youtube/provenance.json`
- Original corresponding scriptlet/filter sources: `extension/vendor/youtube/upstream/`
- Reproducible importer: `scripts/update-youtube.mjs`

The generated bundles retain upstream's framework and YouTube invocation
arguments. Stil restricts execution to the listed YouTube hosts, adds injection
status/idempotence, and omits unrelated sites and global scriptlets. Two bundled
network rules are selected from upstream's YouTube-scoped rules, with new IDs and
the Safari-compatible `domains` alias. Stil supplies its own toolbar UI,
settings integration, cookie-banner handling and fallback ad skipper.

Updates are explicitly downloaded and reviewed by the developer, then packaged
into the extension. No remote scripts or filter code are fetched at runtime.
When distributing a build, retain these notices, the license, and provide the
complete corresponding source, including the importer and native app sources.

GPLv3 and App Store distribution terms can conflict. Resolve that question
before submitting a store build; see `docs/APP_STORE.md`.
