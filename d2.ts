import { makeKey } from './structural-key.js';

export function * encoder(value: unknown): Generator<string> {
  let lineCount = 0
  // Map from value to line it was written on
  const seen = new Map<unknown, number>()

  yield* walk(value)

  function *walk(val: unknown): Generator<string,number> {
    const key = makeKey(val)
    const cached = seen.get(key)
    if (cached !== undefined) {
      return cached
    }
    let line:string
    if (val && typeof val === 'object') {
      if (Array.isArray(val)) {
        const parts = []
        for (const item of val) {
          parts.push(yield* walk(item))
        }
        line = `[${parts.join(',')}]`
      } else {
        const schema = yield* walk(Object.keys(val))
        const values = []
        for (const v of Object.values(val)) {
          values.push(yield* walk(v))
        }
        line = JSON.stringify([-schema, ...values])
      }
    } else {
      if (typeof val === 'string' && val.length >= 32) {
        const parts = [...val.match(/[^a-z0-9]*[a-z0-9 _-]*/gi)].filter(Boolean)
        if (parts.length > 1) {
          return yield* walk([0,...parts])
        }
      }

      line = JSON.stringify(val)
    }
    yield line
    seen.set(key, ++lineCount)
    return lineCount
  }

}

export function encode(value:unknown): string {
  const lines: string[] = []
  for (const line of encoder(value)) {
    lines.push(line)
  }
  return lines.join('\n')
}