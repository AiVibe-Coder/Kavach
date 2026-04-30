#!/usr/bin/env node
const fs   = require('fs')
const path = require('path')
const { createAppIcon } = require('../electron/iconGen')

const OUT = path.join(__dirname, 'icons')
fs.mkdirSync(OUT, { recursive: true })

for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(OUT, `${size}.png`), createAppIcon(size))
  console.log(`  ✓ icons/${size}.png`)
}
