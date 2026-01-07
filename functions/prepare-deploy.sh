#!/bin/bash
# Prepare functions for Firebase deployment by resolving workspace dependencies

set -e

echo "Preparing functions for deployment..."

# Vendor workspace packages for deploy (must be done before build)
echo "Vendoring workspace dependencies..."
VENDOR_DIR="./vendor"
CALENDAR_VENDOR="${VENDOR_DIR}/lifeos-calendar"
AGENTS_VENDOR="${VENDOR_DIR}/lifeos-agents"
CORE_VENDOR="${VENDOR_DIR}/lifeos-core"
mkdir -p "${CALENDAR_VENDOR}"
mkdir -p "${AGENTS_VENDOR}"
mkdir -p "${CORE_VENDOR}"

# Copy built calendar package into vendor directory
if [[ ! -d "../packages/calendar/dist" ]]; then
  echo "Calendar dist not found. Run: pnpm --filter @lifeos/calendar build"
  exit 1
fi

# Copy built agents package into vendor directory
if [[ ! -d "../packages/agents/dist" ]]; then
  echo "Agents dist not found. Run: pnpm --filter @lifeos/agents build"
  exit 1
fi

# Copy built core package into vendor directory (agents depends on it)
if [[ ! -d "../packages/core/dist" ]]; then
  echo "Core dist not found. Run: pnpm --filter @lifeos/core build"
  exit 1
fi

rm -rf "${CALENDAR_VENDOR}"
mkdir -p "${CALENDAR_VENDOR}"
cp "../packages/calendar/package.json" "${CALENDAR_VENDOR}/package.json"
cp -R "../packages/calendar/dist" "${CALENDAR_VENDOR}/dist"

rm -rf "${AGENTS_VENDOR}"
mkdir -p "${AGENTS_VENDOR}"
cp "../packages/agents/package.json" "${AGENTS_VENDOR}/package.json"
cp -R "../packages/agents/dist" "${AGENTS_VENDOR}/dist"

rm -rf "${CORE_VENDOR}"
mkdir -p "${CORE_VENDOR}"
cp "../packages/core/package.json" "${CORE_VENDOR}/package.json"
cp -R "../packages/core/dist" "${CORE_VENDOR}/dist"

# Update workspace dependencies in vendored package.json files to use file paths
if [[ "$OSTYPE" == "darwin"* ]]; then
  # Replace @lifeos/core workspace dependency with file path in agents package.json
  sed -i '' 's/"@lifeos\/core": "workspace:\*"/"@lifeos\/core": "file:..\/lifeos-core"/' "${AGENTS_VENDOR}/package.json"
  # Remove any other workspace dependencies
  sed -i '' '/"workspace:\*"/d' "${AGENTS_VENDOR}/package.json"
  sed -i '' '/"workspace:\*"/d' "${CALENDAR_VENDOR}/package.json"
  sed -i '' '/"workspace:\*"/d' "${CORE_VENDOR}/package.json"
else
  # Replace @lifeos/core workspace dependency with file path in agents package.json
  sed -i 's/"@lifeos\/core": "workspace:\*"/"@lifeos\/core": "file:..\/lifeos-core"/' "${AGENTS_VENDOR}/package.json"
  # Remove any other workspace dependencies
  sed -i '/"workspace:\*"/d' "${AGENTS_VENDOR}/package.json"
  sed -i '/"workspace:\*"/d' "${CALENDAR_VENDOR}/package.json"
  sed -i '/"workspace:\*"/d' "${CORE_VENDOR}/package.json"
fi

echo "Updating workspace dependencies for deploy..."
# Create a backup of package.json
cp package.json package.json.backup

# Replace workspace dependencies with file paths
# Be careful not to remove firebase-admin or other critical dependencies
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' 's/"@lifeos\/agents": "workspace:\*"/"@lifeos\/agents": "file:.\/vendor\/lifeos-agents"/' package.json
  sed -i '' 's/"@lifeos\/calendar": "workspace:\*"/"@lifeos\/calendar": "file:.\/vendor\/lifeos-calendar"/' package.json
  # Remove any remaining workspace: dependencies (but preserve other dependencies)
  sed -i '' '/"workspace:\*"/d' package.json
else
  sed -i 's/"@lifeos\/agents": "workspace:\*"/"@lifeos\/agents": "file:.\/vendor\/lifeos-agents"/' package.json
  sed -i 's/"@lifeos\/calendar": "workspace:\*"/"@lifeos\/calendar": "file:.\/vendor\/lifeos-calendar"/' package.json
  # Remove any remaining workspace: dependencies (but preserve other dependencies)
  sed -i '/"workspace:\*"/d' package.json
fi

# Verify firebase-admin is still in package.json after modifications
if ! grep -q '"firebase-admin"' package.json; then
  echo "ERROR: firebase-admin was removed from package.json!"
  echo "Restoring from backup..."
  cp package.json.backup package.json
  # Try again with more careful sed
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' 's/"@lifeos\/agents": "workspace:\*"/"@lifeos\/agents": "file:.\/vendor\/lifeos-agents"/' package.json
    sed -i '' 's/"@lifeos\/calendar": "workspace:\*"/"@lifeos\/calendar": "file:.\/vendor\/lifeos-calendar"/' package.json
  else
    sed -i 's/"@lifeos\/agents": "workspace:\*"/"@lifeos\/agents": "file:.\/vendor\/lifeos-agents"/' package.json
    sed -i 's/"@lifeos\/calendar": "workspace:\*"/"@lifeos\/calendar": "file:.\/vendor\/lifeos-calendar"/' package.json
  fi
fi

# Verify package.json is valid JSON before installing
if ! node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8'))" 2>/dev/null; then
  echo "ERROR: package.json is invalid JSON after modifications!"
  echo "Restoring from backup..."
  cp package.json.backup package.json
  # Re-apply changes more carefully
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' 's/"@lifeos\/agents": "workspace:\*"/"@lifeos\/agents": "file:.\/vendor\/lifeos-agents"/' package.json
    sed -i '' 's/"@lifeos\/calendar": "workspace:\*"/"@lifeos\/calendar": "file:.\/vendor\/lifeos-calendar"/' package.json
  else
    sed -i 's/"@lifeos\/agents": "workspace:\*"/"@lifeos\/agents": "file:.\/vendor\/lifeos-agents"/' package.json
    sed -i 's/"@lifeos\/calendar": "workspace:\*"/"@lifeos\/calendar": "file:.\/vendor\/lifeos-calendar"/' package.json
  fi
fi

# Install vendored dependencies
# Use --ignore-scripts to skip native compilation (not needed for Firebase Functions)
echo "Installing vendored dependencies..."
npm install --ignore-scripts

# Verify critical dependencies are installed
if [ ! -d "node_modules/firebase-admin" ]; then
  echo "ERROR: firebase-admin not found in node_modules after install"
  echo "Checking package.json..."
  cat package.json | grep -A 2 -B 2 firebase-admin || echo "firebase-admin not in package.json!"
  exit 1
fi

if [ ! -d "node_modules/firebase-functions" ]; then
  echo "ERROR: firebase-functions not found in node_modules after install"
  exit 1
fi

echo "✓ firebase-admin and firebase-functions verified in node_modules"

# Build functions
echo "Building functions..."
npm run build

# Final verification before Firebase packages
echo "Final verification before deployment..."
if [ ! -d "node_modules/firebase-admin" ]; then
  echo "ERROR: firebase-admin missing before Firebase packaging!"
  echo "Reinstalling dependencies..."
  npm install --ignore-scripts --force
fi

# Verify package.json has firebase-admin as a regular dependency (not file path)
if ! grep -q '"firebase-admin":' package.json; then
  echo "ERROR: firebase-admin not in package.json dependencies!"
  exit 1
fi

# Ensure firebase-admin is not using a file path (should be from npm)
if grep -q '"firebase-admin": "file:' package.json; then
  echo "ERROR: firebase-admin is using file path instead of npm version!"
  echo "Restoring firebase-admin to npm version..."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' 's/"firebase-admin": "file:.*"/"firebase-admin": "^12.2.0"/' package.json
  else
    sed -i 's/"firebase-admin": "file:.*"/"firebase-admin": "^12.2.0"/' package.json
  fi
  npm install --ignore-scripts firebase-admin@^12.2.0
fi

# List critical packages to verify they're present
echo "Verifying critical packages in node_modules:"
ls -la node_modules/ | grep -E "(firebase-admin|firebase-functions)" || echo "WARNING: Critical packages not found!"

# Show package.json dependencies section for debugging
echo "Current package.json dependencies:"
node -e "const pkg = require('./package.json'); console.log(JSON.stringify(pkg.dependencies, null, 2))" || echo "Failed to parse package.json"

# Final validation: ensure package.json is valid and firebase-admin is present
echo "Final package.json validation:"
if ! node -e "const pkg = require('./package.json'); if (!pkg.dependencies || !pkg.dependencies['firebase-admin']) { console.error('firebase-admin missing from dependencies!'); process.exit(1); }" 2>&1; then
  echo "ERROR: package.json validation failed!"
  echo "Restoring from backup and trying again..."
  cp package.json.backup package.json
  npm install --ignore-scripts
  exit 1
fi

# Print final package.json to verify it's correct
echo "✓ package.json is valid and contains firebase-admin"
echo "Final package.json dependencies:"
node -e "const pkg = require('./package.json'); console.log(JSON.stringify({ 'firebase-admin': pkg.dependencies['firebase-admin'], 'firebase-functions': pkg.dependencies['firebase-functions'] }, null, 2))"

# Ensure package.json is readable and valid JSON
if ! node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8'))" 2>/dev/null; then
  echo "ERROR: package.json is not valid JSON!"
  exit 1
fi

echo "Functions prepared for deployment"
