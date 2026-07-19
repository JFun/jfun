#!/usr/bin/env bash
# One-shot support/privacy pages deploy → Firebase Hosting (the App Store
# Support/Privacy URL host). Source of truth: docs/cut/ in the repo root;
# hosting config = root firebase.json (multi-target). Needs `firebase login` once.
set -euo pipefail
cd "$(dirname "$0")/../../../.."
firebase deploy --only hosting:cut --project cut
