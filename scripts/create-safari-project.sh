#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="$ROOT/build/safari"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Safari extension packaging requires macOS and Xcode."
  exit 1
fi

if [[ -z "${DEVELOPER_DIR:-}" && -d /Applications/Xcode.app/Contents/Developer ]]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi

if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  echo "Install Xcode from the Mac App Store, then open it once to finish setup."
  echo "After that, run: npm run safari"
  echo "The Command Line Tools alone do not include Safari's extension converter."
  exit 1
fi

if [[ -e "$OUTPUT" ]]; then
  echo "A Safari project already exists at: $OUTPUT"
  echo "Open its .xcodeproj in Xcode and rebuild. The extension source is linked."
  echo "To generate a fresh project, move the existing directory first."
  exit 1
fi

BUNDLE_ID="${BUNDLE_ID:-io.github.ersarue.Stil}"
if [[ "$BUNDLE_ID" != *.* ]]; then
  echo "BUNDLE_ID must be a reverse-DNS identifier, for example io.github.ersarue.Stil."
  exit 1
fi

# Safari's converter capitalizes the final component for the app target but
# reuses the input verbatim for the extension target. Normalize both so the
# extension identifier is prefixed exactly by the app identifier.
bundle_prefix="${BUNDLE_ID%.*}"
bundle_leaf="${BUNDLE_ID##*.}"
bundle_leaf="$(printf '%s' "${bundle_leaf:0:1}" | tr '[:lower:]' '[:upper:]')${bundle_leaf:1}"
BUNDLE_ID="$bundle_prefix.$bundle_leaf"

converter_args=(
  "$ROOT/extension"
  --project-location "$OUTPUT"
  --app-name Stil
  --bundle-identifier "$BUNDLE_ID"
  --macos-only
)

if [[ "${CI:-}" == "true" ]]; then
  converter_args+=(--no-open --no-prompt)
fi

mkdir -p "$ROOT/build"
xcrun safari-web-extension-converter "${converter_args[@]}"

PROJECT="$OUTPUT/Stil/Stil.xcodeproj/project.pbxproj"
VERSION="$(node -e 'console.log(require(process.argv[1]).version)' "$ROOT/package.json")"
# The converter's template follows the installed SDK and can default the app
# target to the newest macOS. Pin a practical minimum and keep the app version
# aligned with package.json.
perl -pi -e "s/MACOSX_DEPLOYMENT_TARGET = [0-9.]+;/MACOSX_DEPLOYMENT_TARGET = 13.6;/g; s/MARKETING_VERSION = [0-9.]+;/MARKETING_VERSION = $VERSION;/g" "$PROJECT"

echo "Minimum macOS: 13.6; app version: $VERSION"
echo "Generated Xcode project with bundle identifier: $BUNDLE_ID"
echo "Open it with: open \"$OUTPUT/Stil/Stil.xcodeproj\""
