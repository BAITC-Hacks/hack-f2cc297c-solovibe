#!/bin/sh
set -eu
if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
  node migrate.cjs
fi
exec node server.js
