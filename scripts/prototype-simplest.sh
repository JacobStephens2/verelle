#!/usr/bin/env bash
# PROTOTYPE — serves the throwaway simplest-Verelle UI at http://127.0.0.1:4173/prototype-simplest.html
set -euo pipefail

cd "$(dirname "$0")/../crates/verelle-web"
python3 -m http.server 4173 --bind 127.0.0.1
