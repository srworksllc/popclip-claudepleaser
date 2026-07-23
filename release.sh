#!/bin/bash

# Release Script for Claudify (PopClip Extension)
#
# Usage:
#   ./release.sh <version>    Build, tag, push, and create GitHub release
#   ./release.sh              Show usage
#
# Example:
#   ./release.sh 1.2.0

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

EXT_DIR="Claudify.popclipext"
CONFIG_FILE="$EXT_DIR/Config.json"
PACKAGE_FILE="$EXT_DIR/package.json"
ZIP_NAME="Claudify.popclipextz"
GITHUB_REPO="srworksllc/popclip-claudify"

NEW_VERSION="$1"

if [ -z "$NEW_VERSION" ]; then
  CURRENT=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['version'])")
  echo "Usage: ./release.sh <version>"
  echo ""
  echo "  Current version: $CURRENT"
  echo ""
  echo "Example:"
  echo "  ./release.sh 1.2.0"
  exit 1
fi

# ── Validate version format ──────────────────────────────────────────

if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Invalid version format. Use X.Y.Z (e.g., 1.2.0)"
  exit 1
fi

# ── Check for uncommitted changes ────────────────────────────────────

if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Uncommitted changes. Commit or stash before releasing."
  exit 1
fi

# ── Check version is newer ───────────────────────────────────────────

CURRENT_VERSION=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['version'])")

version_to_int() {
  local IFS=.
  local parts=($1)
  echo $(( parts[0] * 10000 + parts[1] * 100 + parts[2] ))
}

CURRENT_INT=$(version_to_int "$CURRENT_VERSION")
NEW_INT=$(version_to_int "$NEW_VERSION")

if [ "$NEW_INT" -le "$CURRENT_INT" ]; then
  echo "Error: New version ($NEW_VERSION) must be greater than current ($CURRENT_VERSION)"
  exit 1
fi

# ── Check gh CLI ─────────────────────────────────────────────────────

if ! command -v gh &>/dev/null; then
  echo "Error: GitHub CLI (gh) is required. Install with: brew install gh"
  exit 1
fi

echo "========================================"
echo "  Claudify — Release $CURRENT_VERSION → $NEW_VERSION"
echo "========================================"

# ── Step 1: Version bump ─────────────────────────────────────────────

echo ""
echo "Step 1: Updating version..."

# Update Config.json version field
python3 -c "
import json
with open('$CONFIG_FILE', 'r') as f:
    config = json.load(f)
config['version'] = '$NEW_VERSION'
for opt in config.get('options', []):
    if opt.get('identifier') == 'version-heading':
        opt['label'] = 'Version $NEW_VERSION · srworks.co'
with open('$CONFIG_FILE', 'w') as f:
    json.dump(config, f, indent=2)
    f.write('\n')
"

# Update package.json version field
python3 -c "
import json
with open('$PACKAGE_FILE', 'r') as f:
    pkg = json.load(f)
pkg['version'] = '$NEW_VERSION'
with open('$PACKAGE_FILE', 'w') as f:
    json.dump(pkg, f, indent=2)
    f.write('\n')
"

echo "  Config.json  → $NEW_VERSION"
echo "  package.json → $NEW_VERSION"

# ── Step 2: Sync documentation ───────────────────────────────────

echo ""
echo "Step 2: Syncing docs from settings.js (MODELS)..."

python3 << 'PYEOF'
import re, os

SCRIPT_DIR = os.path.dirname(os.path.abspath("release.sh")) or "."
EXT_DIR = os.path.join(SCRIPT_DIR, "Claudify.popclipext")
SETTINGS = os.path.join(EXT_DIR, "settings.js")
CLAUDE_MD = os.path.join(SCRIPT_DIR, "CLAUDE.md")
README = os.path.join(SCRIPT_DIR, "README.md")
BUNDLE_README = os.path.join(EXT_DIR, "README.md")

# ── Parse MODELS from settings.js ──
# Truth source: const MODELS = { fast: "...", smart: "..." };

with open(SETTINGS) as f:
    src = f.read()

block_match = re.search(r'const\s+MODELS\s*=\s*\{([^}]+)\};', src, re.DOTALL)
if not block_match:
    raise SystemExit("Error: could not find MODELS block in settings.js")

models = {}
for m in re.finditer(r'(\w+)\s*:\s*"([^"]+)"', block_match.group(1)):
    models[m.group(1)] = m.group(2)

if not models:
    raise SystemExit("Error: MODELS block parsed but contained no entries")

# ── Refresh the "Model ID" column in the model tables ──
# Rows look like: | Smarter | `smart` | `claude-sonnet-5` | Jul 2026 |
# We only rewrite the model-ID cell; human labels stay hand-written.

def rewrite_row(m):
    label, key, _old_id, date = m.group(1), m.group(2), m.group(3), m.group(4)
    new_id = models.get(key.strip())
    if not new_id:
        return m.group(0)
    return f"| {label} | `{key}` | `{new_id}` | {date} |"

ROW_RE = r'\|\s*([^|]+?)\s*\|\s*`(\w+)`\s*\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|'

for path in [CLAUDE_MD, README, BUNDLE_README]:
    with open(path) as f:
        content = f.read()

    content = re.sub(ROW_RE, rewrite_row, content)

    with open(path, "w") as f:
        f.write(content)

print(f"  Models: {len(models)}")
for k, v in models.items():
    print(f"    {k:6s} → {v}")
print(f"  CLAUDE.md    ✓")
print(f"  README.md    ✓ (both copies)")
PYEOF

# ── Step 3: Build ZIP ────────────────────────────────────────────────

echo ""
echo "Step 3: Building $ZIP_NAME..."

rm -f "$ZIP_NAME"

cd "$SCRIPT_DIR"
zip -rq "$ZIP_NAME" "$EXT_DIR" \
  -x "$EXT_DIR/.*" \
  -x "*/.*" \
  -x "*/.DS_Store" \
  -x "*/._*"

ZIP_SIZE=$(du -h "$ZIP_NAME" | cut -f1)
echo "  Created: $ZIP_NAME ($ZIP_SIZE)"

# ── Step 4: Git commit + tag ─────────────────────────────────────────

echo ""
echo "Step 4: Committing and tagging..."

git add "$CONFIG_FILE" "$PACKAGE_FILE" CLAUDE.md README.md "$EXT_DIR/README.md"
git commit -m "Release v$NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "Version $NEW_VERSION"

echo "  Committed and tagged v$NEW_VERSION"

# ── Step 5: Push ─────────────────────────────────────────────────────

echo ""
echo "Step 5: Pushing to GitHub..."

git push origin main
git push origin "v$NEW_VERSION"

echo "  Pushed commit and tag"

# ── Step 6: GitHub release ───────────────────────────────────────────

echo ""
echo "Step 6: Creating GitHub release..."

# Collect commits since last tag
PREV_TAG=$(git tag --sort=-v:refname | grep -v "v$NEW_VERSION" | head -1)
RELEASE_NOTES=""
if [ -n "$PREV_TAG" ]; then
  RELEASE_NOTES=$(git log "$PREV_TAG"..HEAD~1 --pretty=format:"- %s" --reverse | grep -v "^- Release v")
fi
if [ -z "$RELEASE_NOTES" ]; then
  RELEASE_NOTES="- Bug fixes and improvements"
fi

NOTES_FILE=$(mktemp)
cat > "$NOTES_FILE" <<EOF
## What's Changed

$RELEASE_NOTES

## Install

Download \`$ZIP_NAME\` and double-click to install in PopClip.
EOF

gh release create "v$NEW_VERSION" "$ZIP_NAME" \
  --repo "$GITHUB_REPO" \
  --title "Claudify v$NEW_VERSION" \
  --notes-file "$NOTES_FILE"

rm -f "$NOTES_FILE"

echo "  Release created with $ZIP_NAME attached"

# ── Step 7: Cleanup ──────────────────────────────────────────────────

echo ""
echo "Step 7: Cleaning up..."

rm -f "$ZIP_NAME"
echo "  Removed $ZIP_NAME"

# ── Done ─────────────────────────────────────────────────────────────

echo ""
echo "========================================"
echo "  Claudify v$NEW_VERSION released!"
echo "========================================"
echo ""
echo "  Tag:     v$NEW_VERSION"
echo "  Release: https://github.com/$GITHUB_REPO/releases/tag/v$NEW_VERSION"
echo ""
