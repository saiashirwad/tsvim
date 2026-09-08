#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
npx tsc --noEmit -p tsconfig.test.json
npx tstl
npx tstl -p tsconfig.test.json
nvim --headless -u NONE -l test/runner.lua
nvim --headless -u NONE -l test/config.lua
