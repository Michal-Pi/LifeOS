#!/bin/bash
# Build script that filters out --debug flag which TypeScript doesn't support
args=()
for arg in "$@"; do
  if [ "$arg" != "--debug" ]; then
    args+=("$arg")
  fi
done
exec tsc -b "${args[@]}"

