#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       TodoVault Setup Script         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js not found. Please install it from https://nodejs.org${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}✗ Node.js 18+ required. Current: $(node -v)${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm $(npm -v)${NC}"

# Check for Xcode Command Line Tools (needed for native modules)
if ! xcode-select -p &> /dev/null; then
    echo -e "${YELLOW}Installing Xcode Command Line Tools...${NC}"
    xcode-select --install
    echo -e "${YELLOW}Please complete the Xcode tools installation and re-run this script.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Xcode Command Line Tools${NC}"

echo ""
echo -e "${BLUE}Installing dependencies...${NC}"
npm install

echo ""
echo -e "${BLUE}Building native modules for Electron...${NC}"
npx electron-rebuild -f -w better-sqlite3 2>/dev/null || {
    echo -e "${YELLOW}Warning: electron-rebuild failed, trying alternative...${NC}"
    # Fallback: try npm rebuild
    ./node_modules/.bin/electron-rebuild 2>/dev/null || true
}

echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║      Setup Complete! 🎉               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""
echo -e "Run the app with:  ${YELLOW}npm start${NC}"
echo ""
echo -e "Or for development (hot reload):  ${YELLOW}npm run dev${NC}"
echo ""
