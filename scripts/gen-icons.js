#!/usr/bin/env node
/**
 * Generates KaVach.icns for the dock/Finder icon.
 * Requires macOS (uses iconutil, built-in to every Mac).
 */
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { createAppIcon } = require('../electron/iconGen')

const ICONSET = path.join(__dirname, '../assets/KaVach.iconset')
const ICNS_OUT = path.join(__dirname, '../assets/KaVach.icns')

// Required sizes for a complete macOS iconset
const SIZES = [
  { file: 'icon_16x16.png',       px: 16 },
  { file: 'icon_16x16@2x.png',    px: 32 },
  { file: 'icon_32x32.png',       px: 32 },
  { file: 'icon_32x32@2x.png',    px: 64 },
  { file: 'icon_128x128.png',     px: 128 },
  { file: 'icon_128x128@2x.png',  px: 256 },
  { file: 'icon_256x256.png',     px: 256 },
  { file: 'icon_256x256@2x.png',  px: 512 },
  { file: 'icon_512x512.png',     px: 512 },
  { file: 'icon_512x512@2x.png',  px: 1024 },
]

console.log('Generating KaVach icon PNGs...')
fs.mkdirSync(ICONSET, { recursive: true })

for (const { file, px } of SIZES) {
  const png = createAppIcon(px)
  fs.writeFileSync(path.join(ICONSET, file), png)
  console.log(`  ✓ ${file} (${px}px)`)
}

console.log('Converting to .icns via iconutil...')
execSync(`iconutil -c icns "${ICONSET}" -o "${ICNS_OUT}"`)
fs.rmSync(ICONSET, { recursive: true })
console.log(`  ✓ KaVach.icns created at assets/`)
