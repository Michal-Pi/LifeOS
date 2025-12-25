#!/bin/bash
# Prepare functions for Firebase deployment by resolving workspace dependencies

set -e

echo "Preparing functions for deployment..."

# Build functions
npm run build

# Remove @lifeos/calendar from runtime dependencies
# (it's only needed for type checking during build, not at runtime)
echo "Removing @lifeos/calendar from runtime dependencies..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' '/"@lifeos\/calendar": "workspace:\*",/d' package.json
else
  sed -i '/"@lifeos\/calendar": "workspace:\*",/d' package.json
fi

echo "Functions prepared for deployment"
