#!/bin/bash
# KaVach — one-time installer
# Run once: bash install.sh
# After this, open KaVach from Applications like any other Mac app.

set -e
cd "$(dirname "$0")"

echo "📦 Installing dependencies..."
npm install --silent

echo "🎨 Generating icon..."
node scripts/gen-icons.js

echo "🔨 Building app..."
npx vite build

echo "📦 Packaging..."
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --config.mac.identity=null 2>/dev/null | grep -E "packaging|building|✓|error" || true

DMG=$(ls dist/KaVach-*.dmg 2>/dev/null | head -1)
if [ -z "$DMG" ]; then
  echo "❌ Build failed — no DMG found in dist/"
  exit 1
fi

echo "📲 Installing to /Applications..."
hdiutil attach "$DMG" -nobrowse -quiet
VOLPATH="/Volumes/KaVach"
if [ -d "/Applications/KaVach.app" ]; then
  rm -rf "/Applications/KaVach.app"
fi
cp -R "$VOLPATH/KaVach.app" /Applications/
hdiutil detach "$VOLPATH" -quiet

echo ""
echo "✅ KaVach installed to /Applications/KaVach.app"
echo "   Open it from Launchpad or Spotlight — no terminal needed."
echo ""
echo "   First launch: macOS may say 'unverified developer'"
echo "   → Right-click KaVach.app → Open → Open"
