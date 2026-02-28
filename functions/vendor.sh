#!/bin/bash
# Rebuild workspace packages and copy their dist into functions/vendor/
# Run from the functions/ directory (or via pnpm --filter functions vendor)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VENDOR_DIR="./vendor"
PACKAGES_DIR="../packages"

PKGS=("core" "agents" "calendar" "training")
VENDOR_NAMES=("lifeos-core" "lifeos-agents" "lifeos-calendar" "lifeos-training")

# Step 1: Build all workspace packages (turbo handles dependency order)
echo "Building workspace packages..."
(cd .. && pnpm turbo run build --filter '@lifeos/*')

# Step 2: Copy dist + package.json into vendor/
for i in "${!PKGS[@]}"; do
  pkg="${PKGS[$i]}"
  vendor_name="${VENDOR_NAMES[$i]}"
  src="${PACKAGES_DIR}/${pkg}"
  dest="${VENDOR_DIR}/${vendor_name}"

  if [[ ! -d "${src}/dist" ]]; then
    echo "ERROR: ${src}/dist not found after build"
    exit 1
  fi

  rm -rf "${dest}"
  mkdir -p "${dest}"
  cp "${src}/package.json" "${dest}/package.json"
  cp -R "${src}/dist" "${dest}/dist"

  # Rewrite workspace:* deps to file: paths in vendored package.json
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' 's/"@lifeos\/core": "workspace:\*"/"@lifeos\/core": "file:..\/lifeos-core"/' "${dest}/package.json"
    sed -i '' '/"workspace:\*"/d' "${dest}/package.json"
  else
    sed -i 's/"@lifeos\/core": "workspace:\*"/"@lifeos\/core": "file:..\/lifeos-core"/' "${dest}/package.json"
    sed -i '/"workspace:\*"/d' "${dest}/package.json"
  fi
done

echo "✓ Vendor directory updated"
