import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

interface DecodedPng {
  width: number
  height: number
  data: Uint8Array
}

interface Rgb {
  r: number
  g: number
  b: number
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const decodedPngCache = new Map<string, DecodedPng>()
const backgroundCache = new Map<string, string[]>()
const moduleDir = path.dirname(fileURLToPath(import.meta.url))

export function renderGtmAssetBackground(args: {
  cwd: string
  width: number
  height: number
  darken?: number
}) {
  const width = Math.max(24, Math.trunc(args.width))
  const height = Math.max(6, Math.trunc(args.height))
  const darken = clamp(args.darken ?? 0.38, 0.05, 0.95)
  const assetPath = resolveAssetPath(args.cwd)

  if (!existsSync(assetPath)) {
    return renderFallbackBackground(width, height)
  }

  const cacheKey = `${assetPath}::${width}x${height}::${darken.toFixed(3)}`
  const cached = backgroundCache.get(cacheKey)
  if (cached) return cached

  const decoded = decodePng(assetPath)
  if (!decoded) {
    return renderFallbackBackground(width, height)
  }

  const rendered = renderFromDecodedPng(decoded, width, height, darken)
  backgroundCache.set(cacheKey, rendered)
  return rendered
}

function resolveAssetPath(cwd: string) {
  const repoAssetPath = path.join(cwd, 'cover', 'assets', 'gtm-engineer.png')
  if (existsSync(repoAssetPath)) {
    return repoAssetPath
  }

  const packagedAssetPath = path.join(moduleDir, '..', 'assets', 'gtm-engineer.png')
  return packagedAssetPath
}

function renderFromDecodedPng(decoded: DecodedPng, width: number, height: number, darken: number) {
  const lines: string[] = []
  const targetPixelHeight = height * 2

  for (let y = 0; y < height; y += 1) {
    const upperY = Math.min(decoded.height - 1, Math.floor((y * 2) * decoded.height / targetPixelHeight))
    const lowerY = Math.min(decoded.height - 1, Math.floor((y * 2 + 1) * decoded.height / targetPixelHeight))
    let line = ''

    for (let x = 0; x < width; x += 1) {
      const srcX = Math.min(decoded.width - 1, Math.floor(x * decoded.width / width))
      const upper = readPixel(decoded, srcX, upperY)
      const lower = readPixel(decoded, srcX, lowerY)
      const tonedUpper = tonePixel(upper, darken)
      const tonedLower = tonePixel(lower, darken)

      line += `\x1b[38;2;${tonedUpper.r};${tonedUpper.g};${tonedUpper.b}m`
      line += `\x1b[48;2;${tonedLower.r};${tonedLower.g};${tonedLower.b}m▀`
    }

    line += '\x1b[0m'
    lines.push(line)
  }

  return lines
}

function renderFallbackBackground(width: number, height: number) {
  const lines: string[] = []
  const shade = [' ', '.', ':', '-', '=', '+', '*', '#', '%', '@']

  for (let y = 0; y < height; y += 1) {
    let line = ''
    for (let x = 0; x < width; x += 1) {
      const xRatio = width > 1 ? x / (width - 1) : 0
      const yRatio = height > 1 ? y / (height - 1) : 0
      const intensity = Math.sin((xRatio * 3.1) + (yRatio * 4.3)) * 0.5 + 0.5
      const shadeIndex = Math.max(0, Math.min(shade.length - 1, Math.floor(intensity * (shade.length - 1))))
      line += `\x1b[38;2;${18 + Math.floor(40 * xRatio)};${82 + Math.floor(65 * yRatio)};${120 + Math.floor(80 * xRatio)}m${shade[shadeIndex]}`
    }
    line += '\x1b[0m'
    lines.push(line)
  }

  return lines
}

function readPixel(decoded: DecodedPng, x: number, y: number): Rgb {
  const stride = decoded.width * 3
  const offset = y * stride + x * 3
  return {
    r: decoded.data[offset] || 0,
    g: decoded.data[offset + 1] || 0,
    b: decoded.data[offset + 2] || 0
  }
}

function tonePixel(pixel: Rgb, darken: number): Rgb {
  const lift = 8
  return {
    r: clampByte(Math.round(pixel.r * darken) + lift),
    g: clampByte(Math.round(pixel.g * darken) + lift),
    b: clampByte(Math.round(pixel.b * darken) + lift)
  }
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.trunc(value)))
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function decodePng(filePath: string): DecodedPng | null {
  const cached = decodedPngCache.get(filePath)
  if (cached) return cached

  const binary = readFileSync(filePath)
  if (!binary.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return null
  }

  let offset = PNG_SIGNATURE.length
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idatChunks: Buffer[] = []

  while (offset + 12 <= binary.length) {
    const length = binary.readUInt32BE(offset)
    const chunkType = binary.toString('ascii', offset + 4, offset + 8)
    const chunkStart = offset + 8
    const chunkEnd = chunkStart + length
    if (chunkEnd > binary.length) return null

    if (chunkType === 'IHDR') {
      width = binary.readUInt32BE(chunkStart)
      height = binary.readUInt32BE(chunkStart + 4)
      bitDepth = binary.readUInt8(chunkStart + 8)
      colorType = binary.readUInt8(chunkStart + 9)
    } else if (chunkType === 'IDAT') {
      idatChunks.push(binary.subarray(chunkStart, chunkEnd))
    } else if (chunkType === 'IEND') {
      break
    }

    offset = chunkEnd + 4
  }

  if (!width || !height || bitDepth !== 8 || colorType !== 2 || idatChunks.length === 0) {
    return null
  }

  const compressed = Buffer.concat(idatChunks)
  const scanlines = inflateSync(compressed)
  const bytesPerPixel = 3
  const rowStride = width * bytesPerPixel
  const expectedLength = (rowStride + 1) * height
  if (scanlines.length < expectedLength) {
    return null
  }

  const reconstructed = new Uint8Array(width * height * bytesPerPixel)

  let srcOffset = 0
  let dstOffset = 0
  for (let y = 0; y < height; y += 1) {
    const filterType = scanlines[srcOffset]
    srcOffset += 1

    for (let x = 0; x < rowStride; x += 1) {
      const rawByte = scanlines[srcOffset + x]
      const left = x >= bytesPerPixel ? reconstructed[dstOffset + x - bytesPerPixel] : 0
      const up = y > 0 ? reconstructed[dstOffset + x - rowStride] : 0
      const upLeft = y > 0 && x >= bytesPerPixel
        ? reconstructed[dstOffset + x - rowStride - bytesPerPixel]
        : 0

      let value = 0
      switch (filterType) {
        case 0:
          value = rawByte
          break
        case 1:
          value = rawByte + left
          break
        case 2:
          value = rawByte + up
          break
        case 3:
          value = rawByte + Math.floor((left + up) / 2)
          break
        case 4:
          value = rawByte + paethPredictor(left, up, upLeft)
          break
        default:
          return null
      }

      reconstructed[dstOffset + x] = value & 0xff
    }

    srcOffset += rowStride
    dstOffset += rowStride
  }

  const decoded: DecodedPng = { width, height, data: reconstructed }
  decodedPngCache.set(filePath, decoded)
  return decoded
}

function paethPredictor(left: number, up: number, upLeft: number) {
  const predictor = left + up - upLeft
  const leftDistance = Math.abs(predictor - left)
  const upDistance = Math.abs(predictor - up)
  const upLeftDistance = Math.abs(predictor - upLeft)
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left
  if (upDistance <= upLeftDistance) return up
  return upLeft
}
