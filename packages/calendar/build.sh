#!/bin/bash
# Build script that filters out --debug flag which tsup doesn't support
args=()
for arg in "$@"; do
  if [ "$arg" != "--debug" ]; then
    args+=("$arg")
  fi
done
# Try local node_modules first, then root (pnpm hoisting), then pnpm exec
if [ -f "./node_modules/.bin/tsup" ]; then
  exec ./node_modules/.bin/tsup "${args[@]}"
elif [ -f "../../node_modules/.bin/tsup" ]; then
  exec ../../node_modules/.bin/tsup "${args[@]}"
else
  exec pnpm exec -- tsup "${args[@]}"
fi

