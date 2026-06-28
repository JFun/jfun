#!/usr/bin/env bash
# Lanthorn App Store screenshots — iPhone 6.5" (1242×2688) + iPad 13" (2048×2732).
# Renders via Chrome DevTools Protocol device emulation (scripts/dev/shots.py) so
# the real mobile viewport is used and content (board + overlays) centers exactly.
# Headless --window-size does NOT set the layout viewport, which is why we use CDP.
# Output: screenshots/appstore/*.png
set -euo pipefail
exec python3 "$(dirname "$0")/shots.py"
