import { makeKey } from './structural-key.ts';

const EXT = 0 // 000
const NUM = 1 // 001
const STR = 2 // 010
const BIN = 3 // 011 
const LST = 4 // 100
const MAP = 5 // 101
const PTR = 6 // 110
const REF = 7 // 111

// Encode arbitrary JSON serializable values into a compact binary format
// The format is written in reverse order with leaves and data first
// and headers and parents last.
//
// Variable length tagged integer encoding
//
//   ttt xxxxx (where xxxxx < 11100) 0 to 27 for unsigned and -14 to 13 for zigzag signed
//
//   xxxxxxxx 
//   ttt 11100 ( u8 / i8 ) 0 to 255 or -128 to 127 
//
//   xxxxxxxx xxxxxxxx 
//   ttt 11101 ( u16 /  i16 ) 64Ki or +- 32Ki
//
//   xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx
//   ttt 11110 ( u32 / i32 ) 4Mi or +- 2Mi
// 
//   xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx
//   xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx
//   ttt 11111 ( u64 / i64 ) 16Ei or += 8Ei
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

export function encode(value: unknown): Uint8Array {
    const parts: Uint8Array[] = []
    let currentSize = 0
    // Map from value to byte offset it was written on
    const seen = new Map<unknown, number>()
    // Map from value to estimated cost of encoding it
    const costs = new Map<unknown, number>()

    encodeAny(value)

    const result = new Uint8Array(currentSize)
    let offset = 0
    for (const part of parts) {
        result.set(part, offset)
        offset += part.length
    }
    return result

    function writeUnsignedVarInt(type: number, value: number) {
        if (!Number.isInteger(value) || value < 0) {
            throw new Error(`Value is not a positive integer: ${value}`)
        }
        if (value < 28) {
            const part = new Uint8Array(1)
            part[0] = (type << 5) | value
            parts.push(part)
            currentSize += part.length
        } else if (value < 0x100) {
            const part = new Uint8Array(2)
            part[0] = value
            part[1] = (type << 5) | 0x1c
            parts.push(part)
            currentSize += part.length
        } else if (value < 0x10000) {
            const part = new Uint8Array(3)
            const view = new DataView(part.buffer)
            view.setUint16(0, value, true)
            part[2] = (type << 5) | 0x1d
            parts.push(part)
            currentSize += part.length
        } else if (value < 0x100000000) {
            const part = new Uint8Array(5)
            const view = new DataView(part.buffer)
            view.setUint32(0, value, true)
            part[4] = (type << 5) | 0x1e
            parts.push(part)
            currentSize += part.length
        } else {
            const part = new Uint8Array(9)
            const view = new DataView(part.buffer)
            view.setBigUint64(0, BigInt(value), true)
            part[8] = (type << 5) | 0x1f
            parts.push(part)
            currentSize += part.length
        }
    }

    function writeSignedVarInt(type: number, value: number) {
        if (!Number.isInteger(value)) {
            throw new Error(`Value is not an integer: ${value}`)
        }
        if (value >= -14 && value < 14) {
            // zigzag encode small values in single byte
            const zigzag = (value << 1) ^ (value >> 31)
            const part = new Uint8Array(1)
            part[0] = (type << 5) | zigzag
            parts.push(part)
            currentSize += part.length
        } else if (value >= -0x80 && value < 0x80) {
            // Encode using normal signed integers
            const part = new Uint8Array(2)
            part[0] = value & 0xff
            part[1] = (type << 5) | 0x1c
            parts.push(part)
            currentSize += part.length
        } else if (value >= -0x8000 && value < 0x8000) {
            const part = new Uint8Array(3)
            const view = new DataView(part.buffer)
            view.setInt16(0, value, true)
            part[4] = (type << 5) | 0x1d
            parts.push(part)
            currentSize += part.length
        } else if (value >= -0x80000000 && value < 0x80000000) {
            const part = new Uint8Array(5)
            const view = new DataView(part.buffer)
            view.setInt32(0, value, true)
            part[4] = (type << 5) | 0x1e
            parts.push(part)
            currentSize += part.length
        } else {
            const part = new Uint8Array(9)
            const view = new DataView(part.buffer)
            view.setBigInt64(0, BigInt(value), true)
            part[8] = (type << 5) | 0x1f
            parts.push(part)
            currentSize += part.length
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
                encodeMap(val)
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
        const utf8 = new TextEncoder().encode(str)
        parts.push(utf8)
        currentSize += utf8.length
        writeUnsignedVarInt(STR, utf8.length)
    }

    function encodeBin(bin: Uint8Array) {
        parts.push(bin)
        currentSize += bin.length
        writeUnsignedVarInt(BIN, bin.length)
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