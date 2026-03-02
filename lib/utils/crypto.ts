import { keccak_256 } from '@noble/hashes/sha3.js'

// --- Public Key Encoding ---

/**
 * Extract 65-byte uncompressed public key from SPKI DER envelope.
 * AWS KMS returns keys in SubjectPublicKeyInfo format.
 */
export function extractRawPublicKey(spki: Uint8Array): Uint8Array {
  let pos = 0

  // Outer SEQUENCE
  if (spki[pos] !== 0x30) throw new Error('Invalid SPKI: missing outer SEQUENCE')
  pos++
  pos += spki[pos] & 0x80 ? 1 + (spki[pos] & 0x7f) : 1

  // Algorithm identifier SEQUENCE
  if (spki[pos] !== 0x30) throw new Error('Invalid SPKI: missing algorithm SEQUENCE')
  pos++
  const algoLen = spki[pos]
  pos += 1 + algoLen

  // BIT STRING containing the key
  if (spki[pos] !== 0x03) throw new Error('Invalid SPKI: missing BIT STRING')
  pos++
  pos += spki[pos] & 0x80 ? 1 + (spki[pos] & 0x7f) : 1
  pos++ // skip unused-bits byte

  const raw = spki.slice(pos, pos + 65)
  if (raw[0] !== 0x04 || raw.length !== 65) {
    throw new Error(`Expected 65-byte uncompressed key (0x04 prefix), got ${raw.length}`)
  }
  return raw
}

/**
 * Compress a 65-byte uncompressed secp256k1 public key to 33 bytes.
 */
export function compressPublicKey(uncompressed: Uint8Array): Uint8Array {
  if (uncompressed.length !== 65 || uncompressed[0] !== 0x04) {
    throw new Error('Expected 65-byte uncompressed key with 0x04 prefix')
  }
  const x = uncompressed.slice(1, 33)
  const yLastByte = uncompressed[64]
  const prefix = yLastByte % 2 === 0 ? 0x02 : 0x03
  const compressed = new Uint8Array(33)
  compressed[0] = prefix
  compressed.set(x, 1)
  return compressed
}

// --- Signature Decoding ---

const SECP256K1_ORDER = BigInt(
  '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141'
)
const HALF_ORDER = SECP256K1_ORDER / 2n

function toUint(bytes: Uint8Array): bigint {
  return BigInt('0x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''))
}

function fromUint(n: bigint): Uint8Array {
  const hex = n.toString(16).padStart(64, '0')
  const out = new Uint8Array(32)
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/**
 * Decode a DER ECDSA signature into raw 64-byte (r || s) format
 * with low-S normalization as required by Hedera.
 */
export function decodeSignature(der: Uint8Array): Uint8Array {
  let pos = 0

  if (der[pos] !== 0x30) throw new Error('Invalid DER: missing SEQUENCE')
  pos++
  pos += der[pos] & 0x80 ? 1 + (der[pos] & 0x7f) : 1

  // r
  if (der[pos] !== 0x02) throw new Error('Invalid DER: missing INTEGER for r')
  pos++
  const rLen = der[pos]
  pos++
  let r = der.slice(pos, pos + rLen)
  pos += rLen

  // s
  if (der[pos] !== 0x02) throw new Error('Invalid DER: missing INTEGER for s')
  pos++
  const sLen = der[pos]
  pos++
  let s = der.slice(pos, pos + sLen)

  // Strip leading zero padding
  if (r.length > 32) r = r.slice(r.length - 32)
  if (s.length > 32) s = s.slice(s.length - 32)

  // Low-S normalization
  let sInt = toUint(s)
  if (sInt > HALF_ORDER) sInt = SECP256K1_ORDER - sInt

  const output = new Uint8Array(64)
  const rPad = new Uint8Array(32)
  rPad.set(r, 32 - r.length)
  output.set(rPad, 0)
  output.set(fromUint(sInt), 32)
  return output
}

// --- EVM Address ---

/**
 * Derive a checksummed EVM address from a 65-byte uncompressed public key.
 * address = keccak256(pubkey[1..65])[-20:]
 */
export function computeEvmAddress(publicKeyHex: string): string {
  const bytes = Buffer.from(publicKeyHex, 'hex')
  if (bytes.length !== 65 || bytes[0] !== 0x04) {
    throw new Error(`Expected 65-byte uncompressed key, got ${bytes.length}`)
  }

  const hash = keccak_256(bytes.slice(1))
  const raw = Array.from(hash.slice(-20), (b) => b.toString(16).padStart(2, '0')).join('')

  // EIP-55 checksum
  const hashHex = Array.from(keccak_256(Buffer.from(raw, 'utf8')), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('')

  let checksummed = '0x'
  for (let i = 0; i < 40; i++) {
    checksummed += parseInt(hashHex[i], 16) >= 8 ? raw[i].toUpperCase() : raw[i]
  }
  return checksummed
}
