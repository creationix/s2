// This is like n2.ts, but using 6 bit bytes so that it can be encoded in base64 natively
// This uses urlsafe base64 encoding (with - and _ instead of + and /)
//
// Variable length tagged integer encoding
//
//   ttt 0xx ( u2 / i2 ) 0 to 3 or -2 to 1
//
//   xxxxxx 
//   ttt 100 ( u6 / i6 ) 0 to 63 or -32 to 31 
//
//   xxxxxx xxxxxx
//   ttt 101 ( u12 /  i12 ) 4Ki or +- 2Ki
//
//   xxxxxx xxxxxx xxxxxx xxxxxx
//   ttt 110 ( u24 / i24 ) 16Mi or +- 8Mi
// 
//   xxxxxx xxxxxx xxxxxx xxxxxx
//   xxxxxx xxxxxx xxxxxx xxxxxx
//   ttt 111 ( u48 / i48 ) 256Ti or += 128Ti
//
// Value Types
//
//   0 - EXT (data)
//   1 - NUM (value)
//   2 - STR (length)
//   3 - BIN (length)
//   4 - LST (length)
//   5 - MAP (length)
//   6 - PTR (offset)
//   7 - REF (index)
//
// Built-in Refs
//
//   0 - null
//   1 - true
//   2 - false

import { makeKey } from './structural-key.ts';

const EXT = 0 // 000
const NUM = 1 // 001
const STR = 2 // 010
const BIN = 3 // 011 
const LST = 4 // 100
const MAP = 5 // 101
const PTR = 6 // 110
const REF = 7 // 111

const NULL = 0
const TRUE = 1
const FALSE = 2


const B64_ENC: Record<number,string> = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
const B64_DEC: Record<string, number> = {}
for (let i = 0; i < 64; i++) {
    B64_DEC[B64_ENC[i] as string] = i
}

export function encode(value: unknown): string {
    const parts: string[] = []
    let currentSize = 0
    // Map from value to byte offset it was written on
    const seen = new Map<unknown, number>()
    // Map from value to estimated cost of encoding it
    const costs = new Map<unknown, number>()

    encodeAny(value)

    return parts.join('')

    function writeUnsignedVarInt(type: number, value: number) {
        if (!Number.isInteger(value) || value < 0) {
            throw new Error(`Value is not a positive integer: ${value}`)
        }
        if (value < 4) {
            parts.push(B64_ENC[(type << 3) | value] as string)
            currentSize += 1
        } else if (value < 64) {
            parts.push(B64_ENC[value] as string 
                + B64_ENC[(type << 3) | 4] as string)
            currentSize += 2
        } else if (value < 0x1000) {
            parts.push(B64_ENC[(value >> 6) & 0x3f] as string
                + B64_ENC[value & 0x3f] as string
                + B64_ENC[(type << 3) | 5] as string)
            currentSize += 3
        } else if (value < 0x1000000) {
            parts.push(B64_ENC[(value >> 18) & 0x3f] as string
                + B64_ENC[(value >> 12) & 0x3f] as string
                + B64_ENC[(value >> 6) & 0x3f] as string
                + B64_ENC[value & 0x3f] as string
                + B64_ENC[(type << 3) | 6] as string)
            currentSize += 5
        } else if (value < 0x1000000000000) {
            parts.push(B64_ENC[(value >> 42) & 0x3f] as string
                + B64_ENC[(value >> 36) & 0x3f] as string
                + B64_ENC[(value >> 30) & 0x3f] as string
                + B64_ENC[(value >> 24) & 0x3f] as string
                + B64_ENC[(value >> 18) & 0x3f] as string
                + B64_ENC[(value >> 12) & 0x3f] as string
                + B64_ENC[(value >> 6) & 0x3f] as string
                + B64_ENC[value & 0x3f] as string
                + B64_ENC[(type << 3) | 7] as string)
            currentSize += 9
        } else {
            throw new Error("TODO: larger integers")
        }
    }

    function writeSignedVarInt(type: number, value: number) {
        if (!Number.isInteger(value)) {
            throw new Error(`Value is not an integer: ${value}`)
        }
        if (value >= -2 && value < 2) {
            // Encode as 2s complement i2
            const int = value < 0 ? (value + 4) : value
            parts.push(B64_ENC[(type << 3) | int] as string)
            currentSize += 1
        } else if (value >= -0x20 && value < 0x20) {
            // Encode as 2s complement i6
            const int = value < 0 ? (value + 0x40) : value
            parts.push(B64_ENC[int] as string 
                + B64_ENC[(type << 3) | 4] as string)
            currentSize += 2
        } else if (value >= -0x800 && value < 0x800) {
            // Encode as 2s complement i12
            const int = value < 0 ? (value + 0x100) : value
            parts.push(B64_ENC[(int >> 6) & 0x3f] as string
                + B64_ENC[int & 0x3f] as string
                + B64_ENC[(type << 3) | 5] as string)
            currentSize += 3
        } else if (value >= -0x800000 && value < 0x800000) {
            // Encode as 2s complement i24
            const int = value < 0 ? (value + 0x1000000) : value
            parts.push(B64_ENC[(int >> 18) & 0x3f] as string
                + B64_ENC[(int >> 12) & 0x3f] as string
                + B64_ENC[(int >> 6) & 0x3f] as string
                + B64_ENC[int & 0x3f] as string
                + B64_ENC[(type << 3) | 6] as string)
            currentSize += 5
        } else if (value >= -0x800000000000 && value < 0x800000000000) {
            // Encode as 2s complement i48
            const int = value < 0 ? (value + 0x1000000000000) : value
            parts.push(B64_ENC[(int >> 42) & 0x3f] as string
                + B64_ENC[(int >> 36) & 0x3f] as string
                + B64_ENC[(int >> 30) & 0x3f] as string
                + B64_ENC[(int >> 24) & 0x3f] as string
                + B64_ENC[(int >> 18) & 0x3f] as string
                + B64_ENC[(int >> 12) & 0x3f] as string
                + B64_ENC[(int >> 6) & 0x3f] as string
                + B64_ENC[int & 0x3f] as string
                + B64_ENC[(type << 3) | 7] as string)
            currentSize += 9
        } else {
            throw new Error("TODO: integer too large (48-bit max)")
        }
    }

    // Returns the offset of the written value (or offset of reused value)
    function encodeAny(val: unknown): number {
        const key = makeKey(val, 2)
        const seenOffset = seen.get(key)
        if (seenOffset !== undefined) {
            const estimatedCost = costs.get(key) || Infinity
            // If the cost of encoding this value is more than the cost of a pointer, use a pointer
            const delta = currentSize - seenOffset
            const estimatedPtrCost = (delta < 28) ? 1 : (delta < 0x100) ? 2 : (delta < 0x10000) ? 3 : (delta < 0x100000000) ? 5 : 9
            if (estimatedCost > estimatedPtrCost) {
                return encodePtr(seenOffset)
            }
        }
        const start = currentSize
        if (val == null) {
            encodeRef(0)
        } else if (val === true) {
            encodeRef(1)
        } else if (val === false) {
            encodeRef(2)
        } else if (typeof val === 'number') {
            encodeNum(val)
        } else if (typeof val === 'string') {
            encodeStr(val)
        } else if (Array.isArray(val)) {
            encodeList(val)
        } else if (typeof val === 'object') {
            if (ArrayBuffer.isView(val)) {
                encodeBin(new Uint8Array(val.buffer, val.byteOffset, val.byteLength))
            } else if (val instanceof ArrayBuffer) {
                encodeBin(new Uint8Array(val))
            } else {
                encodeMap(val as Record<string, unknown>)
            }
        } else {
            throw new Error(`Unsupported value: ${val}`)
        }
        seen.set(key, currentSize)
        costs.set(key, currentSize - start)
        return currentSize
    }


    function encodeRef(index: number) {
        return writeUnsignedVarInt(REF, index)
    }

    function encodePtr(offset: number) {
        writeUnsignedVarInt(PTR, currentSize - offset)
        return offset
    }

    function encodeNum(num: number) {
        if (Number.isInteger(num)) {
            return writeSignedVarInt(NUM, num)
        }
        throw new Error(`TODO: support floats: ${num}`)
    }

    function encodeStr(str: string) {
        if (str.length >= 28) {
            // Attempt to split longer strings to look for reuse
            const parts = str.match(/[^a-z0-9]*[a-z0-9 _-]*/ig)?.filter(Boolean);
            if (parts && parts.length > 1) {
                const start = currentSize;

                for (let i = parts.length - 1; i >= 0; i--) {
                    encodeAny(parts[i]);
                }
                writeUnsignedVarInt(STR, parts.length);
                writeUnsignedVarInt(EXT, currentSize - start);
                return;
            }
        }
        const utf8 = binToB64(new TextEncoder().encode(str))
        // const utf8B64 = binToB64(utf8)
        parts.push(str)
        currentSize += utf8.length
        writeUnsignedVarInt(STR, utf8.length)
    }

    function encodeBin(bin: Uint8Array) {
        const b64 = binToB64(bin)
        parts.push(b64)
        currentSize += b64.length
        writeUnsignedVarInt(BIN, b64.length)
    }

    function writeList(list: unknown[]) {
        // const offsets = new Uint8Array(list.length)
        for (let i = list.length - 1; i >= 0; i--) {
            encodeAny(list[i])
        }
        // parts.push(new Uint8Array(offsets.buffer))
        // currentSize += offsets.byteLength
    }

    function encodeList(list: unknown[]) {
        const start = currentSize
        writeList(list)
        writeUnsignedVarInt(LST, currentSize - start)
    }

    function encodeMap(map: Record<string, unknown>) {
        const start = currentSize
        const entries = Object.entries(map).sort((a, b) => a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0))
        const keys = entries.map(e => e[0])
        const values = entries.map(e => e[1])
        writeList(values)
        // Encode keys as own sub-value so it can be deduplicated as a whole
        encodeAny(keys)
        writeUnsignedVarInt(MAP, currentSize - start)
    }
}


// Encode any uint8array as URL Safe base64 (without padding)
function binToB64(bin: Uint8Array): string {

    let result = ''
    let val = 0
    let valb = -6
    for (let i = 0; i < bin.length; i++) {
        val = (val << 8) | bin[i] as number
        valb += 8
        while (valb >= 0) {
            result += B64_ENC[(val >> valb) & 0x3f] as string
            valb -= 6
        }
    }
    if (valb > -6) {
        result += B64_ENC[((val << 8) >> (valb + 8)) & 0x3f] as string
    }
    return result
}
