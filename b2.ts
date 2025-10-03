export function encode(data: Record<string, unknown>): string {
  const lines: string[] = []
  const keys = Object.keys(data).sort()
  for (const key of keys) {
    const value = (data)[key]
    lines.push(`${JSON.stringify(key)}\n${JSON.stringify(value)}`)
  }
  return lines.join("\n")
}
