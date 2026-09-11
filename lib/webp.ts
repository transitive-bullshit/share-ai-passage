/** Read canvas dimensions for smoke checks without decoding image pixels.
 * https://developers.google.com/speed/webp/docs/riff_container
 */
export function webpDimensions(bytes: Buffer) {
  if (
    bytes.length < 20 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WEBP' ||
    bytes.readUInt32LE(4) + 8 !== bytes.length
  )
    return undefined

  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = bytes.toString('ascii', offset, offset + 4)
    const size = bytes.readUInt32LE(offset + 4)
    const start = offset + 8
    if (start + size + (size % 2) > bytes.length) return undefined

    if (kind === 'VP8X' && size >= 10) {
      return {
        width: bytes.readUIntLE(start + 4, 3) + 1,
        height: bytes.readUIntLE(start + 7, 3) + 1
      }
    }
    if (
      kind === 'VP8 ' &&
      size >= 10 &&
      (bytes[start]! & 1) === 0 &&
      bytes.toString('hex', start + 3, start + 6) === '9d012a'
    ) {
      return {
        width: bytes.readUInt16LE(start + 6) & 0x3fff,
        height: bytes.readUInt16LE(start + 8) & 0x3fff
      }
    }
    if (kind === 'VP8L' && size >= 5 && bytes[start] === 0x2f) {
      const dimensions = bytes.readUInt32LE(start + 1)
      return {
        width: (dimensions & 0x3fff) + 1,
        height: ((dimensions >>> 14) & 0x3fff) + 1
      }
    }
    offset = start + size + (size % 2)
  }
  return undefined
}
