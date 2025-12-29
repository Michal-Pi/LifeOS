#!/bin/bash
# Prepare functions for Firebase deployment by resolving workspace dependencies

set -e

echo "Preparing functions for deployment..."

# Build functions
npm run build

# Vendor workspace packages for deploy
echo "Vendoring workspace dependencies..."
VENDOR_DIR="./vendor"
CALENDAR_VENDOR="${VENDOR_DIR}/lifeos-calendar"
mkdir -p "${CALENDAR_VENDOR}"

# Copy built calendar package into vendor directory
if [[ ! -d "../packages/calendar/dist" ]]; then
  echo "Calendar dist not found. Run: pnpm --filter @lifeos/calendar build"
  exit 1
fi

rm -rf "${CALENDAR_VENDOR}"
mkdir -p "${CALENDAR_VENDOR}"
cp "../packages/calendar/package.json" "${CALENDAR_VENDOR}/package.json"
cp -R "../packages/calendar/dist" "${CALENDAR_VENDOR}/dist"

echo "Updating workspace dependencies for deploy..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' '/"@lifeos\/agents": "workspace:\*",/d' package.json
  sed -i '' 's/"@lifeos\/calendar": "workspace:\*"/"@lifeos\/calendar": "file:.\/vendor\/lifeos-calendar"/' package.json
else
  sed -i '/"@lifeos\/agents": "workspace:\*",/d' package.json
  sed -i 's/"@lifeos\/calendar": "workspace:\*"/"@lifeos\/calendar": "file:.\/vendor\/lifeos-calendar"/' package.json
fi

echo "Functions prepared for deployment"
