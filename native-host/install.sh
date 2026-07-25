#!/usr/bin/env bash
# Double-click (or `./install.sh <extension_id>`) installer for macOS/Linux:
# registers native-host/index.js as a Chrome Native Messaging host. Pass the
# extension ID the first time; install.js bakes it in as the default, so a
# later run with no argument reuses it.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

chmod +x install.js index.js

node install.js "${1-}"

echo
echo "------------------------------------------------------------"
echo "[diff-guard] Установка завершена."
echo "------------------------------------------------------------"
