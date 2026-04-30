/**
 * Pure-JS PNG icon generator — no native deps, uses Node's built-in zlib.
 * Generates the Kavach shield icon (colorful for dock, monochrome for tray).
 */
const zlib = require('zlib')

// ─── PNG ENCODER ──────────────────────────────────────────────────────────────

const _crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xFFFFFFFF
  for (const b of buf) c = _crcTable[(c ^ b) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const d = Buffer.isBuffer(data) ? data : Buffer.from(data)
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(d.length)
  const crcVal = Buffer.allocUnsafe(4); crcVal.writeUInt32BE(crc32(Buffer.concat([t, d])))
  return Buffer.concat([len, t, d, crcVal])
}

function rgbaToPNG(w, h, rgba) {
  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr.writeUInt8(8, 8); ihdr.writeUInt8(6, 9) // 8-bit RGBA
  ihdr.fill(0, 10)

  const stride = 1 + w * 4
  const raw = Buffer.allocUnsafe(h * stride)
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0 // filter: None
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4)
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

// ─── DRAWING HELPERS ──────────────────────────────────────────────────────────

function pointInPolygon(px, py, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}

function lerp(a, b, t) { return Math.round(a + (b - a) * Math.min(1, Math.max(0, t))) }

// ─── KAVACH SHIELD — COLORFUL (dock icon) ────────────────────────────────────

function createDockIcon(size = 512) {
  const s = size
  const rgba = Buffer.alloc(s * s * 4, 0)

  // Shield polygon (normalised 0-1, then scaled)
  const shield = [
    [0.14, 0.18], [0.28, 0.07], [0.50, 0.02],
    [0.72, 0.07], [0.86, 0.18], [0.91, 0.35],
    [0.88, 0.55], [0.70, 0.78], [0.50, 0.95],
    [0.30, 0.78], [0.12, 0.55], [0.09, 0.35]
  ].map(([x, y]) => [x * s, y * s])

  // Fill shield with purple→teal gradient
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      if (!pointInPolygon(x, y, shield)) continue
      const idx = (y * s + x) * 4
      const t = y / s
      // Purple #7c6af7 → Teal #4ecdc4
      rgba[idx]   = lerp(0x7c, 0x4e, t)
      rgba[idx+1] = lerp(0x6a, 0xcd, t)
      rgba[idx+2] = lerp(0xf7, 0xc4, t)
      rgba[idx+3] = 255
    }
  }

  // Inner shadow — darken near shield edge
  const edgeW = s * 0.035
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const idx = (y * s + x) * 4
      if (rgba[idx+3] === 0) continue
      let minD = Infinity
      for (let i = 0, j = shield.length - 1; i < shield.length; j = i++) {
        minD = Math.min(minD, distToSeg(x, y, shield[j][0], shield[j][1], shield[i][0], shield[i][1]))
      }
      if (minD < edgeW) {
        const f = 0.45 + 0.55 * (minD / edgeW)
        rgba[idx]   = Math.round(rgba[idx] * f)
        rgba[idx+1] = Math.round(rgba[idx+1] * f)
        rgba[idx+2] = Math.round(rgba[idx+2] * f)
      }
    }
  }

  // Draw bold white "V" — the Kavach logo mark
  const vPts = [
    [0.27 * s, 0.24 * s],
    [0.50 * s, 0.67 * s],
    [0.73 * s, 0.24 * s]
  ]
  const vThick = s * 0.075
  const vCapR = s * 0.04

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const idx = (y * s + x) * 4
      if (rgba[idx+3] === 0) continue
      const d1 = distToSeg(x, y, vPts[0][0], vPts[0][1], vPts[1][0], vPts[1][1])
      const d2 = distToSeg(x, y, vPts[1][0], vPts[1][1], vPts[2][0], vPts[2][1])
      const dist = Math.min(d1, d2)
      if (dist < vThick) {
        // Golden V stroke — #F5A623
        const alpha = Math.min(1, 1.5 - (dist / vThick))
        const a = Math.max(0, Math.min(1, alpha))
        rgba[idx]   = lerp(rgba[idx], 245, a)   // R
        rgba[idx+1] = lerp(rgba[idx+1], 166, a) // G
        rgba[idx+2] = lerp(rgba[idx+2], 35, a)  // B
      }
    }
  }

  return rgbaToPNG(s, s, rgba)
}

// ─── KAVACH APP ICON — dark square + bold golden V (Adobe-style) ─────────────

function createAppIcon(size = 512) {
  const s = size
  const rgba = Buffer.alloc(s * s * 4, 0)

  // 10% transparent padding on each side — keeps icon same visual size as other Mac apps
  const pad = s * 0.10
  const inner = s - pad * 2   // actual icon art area
  const cx = s / 2, cy = s / 2

  // Dark background with macOS-style rounded corners (radius ~22% of inner area)
  const r = inner * 0.22
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = Math.max(0, Math.abs(x - cx) - (inner / 2 - r))
      const dy = Math.max(0, Math.abs(y - cy) - (inner / 2 - r))
      if (Math.hypot(dx, dy) > r) continue
      const idx = (y * s + x) * 4
      rgba[idx]   = 0x0f
      rgba[idx+1] = 0x0f
      rgba[idx+2] = 0x13
      rgba[idx+3] = 255
    }
  }

  // Bold golden "V" — coordinates relative to padded inner area
  const vTop  = pad + inner * 0.18
  const vBot  = pad + inner * 0.82
  const vLeft = pad + inner * 0.13
  const vRight= pad + inner * 0.87
  const vMid  = s * 0.50
  const thick  = inner * 0.13

  const arm1 = [[vLeft, vTop], [vMid, vBot]]
  const arm2 = [[vRight, vTop], [vMid, vBot]]

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const idx = (y * s + x) * 4
      if (rgba[idx+3] === 0) continue  // outside rounded rect
      const d1 = distToSeg(x, y, arm1[0][0], arm1[0][1], arm1[1][0], arm1[1][1])
      const d2 = distToSeg(x, y, arm2[0][0], arm2[0][1], arm2[1][0], arm2[1][1])
      const d = Math.min(d1, d2)
      if (d < thick) {
        // Soft anti-aliased edge
        const a = Math.max(0, Math.min(1, (thick - d) / (thick * 0.08) ))
        rgba[idx]   = lerp(rgba[idx],   0xF5, a)   // #F5A623 gold
        rgba[idx+1] = lerp(rgba[idx+1], 0xA6, a)
        rgba[idx+2] = lerp(rgba[idx+2], 0x23, a)
      }
    }
  }

  return rgbaToPNG(s, s, rgba)
}

// ─── KAVACH SHIELD — MONOCHROME (tray icon, template image) ──────────────────

function createTrayIcon(size = 18) {
  const s = size
  const rgba = Buffer.alloc(s * s * 4, 0)

  const shield = [
    [0.14, 0.18], [0.50, 0.02], [0.86, 0.18],
    [0.91, 0.35], [0.88, 0.55], [0.50, 0.95],
    [0.12, 0.55], [0.09, 0.35]
  ].map(([x, y]) => [x * s, y * s])

  // Filled black shield
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      if (!pointInPolygon(x, y, shield)) continue
      const idx = (y * s + x) * 4
      rgba[idx] = rgba[idx+1] = rgba[idx+2] = 0
      rgba[idx+3] = 255
    }
  }

  // White V cutout inside
  const vPts = [[0.28*s, 0.26*s], [0.50*s, 0.68*s], [0.72*s, 0.26*s]]
  const vThick = s * 0.16

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const idx = (y * s + x) * 4
      if (rgba[idx+3] === 0) continue
      const dist = Math.min(
        distToSeg(x, y, vPts[0][0], vPts[0][1], vPts[1][0], vPts[1][1]),
        distToSeg(x, y, vPts[1][0], vPts[1][1], vPts[2][0], vPts[2][1])
      )
      if (dist < vThick) {
        // Cut out = white (transparent in template mode)
        rgba[idx] = rgba[idx+1] = rgba[idx+2] = 255
        rgba[idx+3] = 255
      }
    }
  }

  return rgbaToPNG(s, s, rgba)
}

module.exports = { createDockIcon, createTrayIcon, createAppIcon }
