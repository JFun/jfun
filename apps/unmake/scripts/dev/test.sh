#!/usr/bin/env bash
# Unmake — headless Core contract. Runs the pure-C# rules + solver NUnit tests
# OUTSIDE Unity (and in CI) via `dotnet test`. The csproj LINKS the same
# Assets/Unmake/Core sources + Tests/CoreTests.cs the Unity Test Runner uses, so
# there is ONE contract that runs both places. Run after every Core/rules change
# (the cost of a code change — same discipline as the web games' test.sh).
#
# Needs the .NET SDK: `brew install dotnet` (the Core is engine-free by design).
set -euo pipefail
cd "$(dirname "$0")/../.."

command -v dotnet >/dev/null 2>&1 || export PATH="/opt/homebrew/bin:$PATH"
if ! command -v dotnet >/dev/null 2>&1; then
  echo "✗ dotnet not found — install with: brew install dotnet" >&2
  exit 1
fi

dotnet test tests/headless/Unmake.Core.Tests.csproj --nologo
