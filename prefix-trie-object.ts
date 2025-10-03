export type PrefixTrieObject =
  { [key: string]: PrefixTrieObject } & // prefix nodes (path can be empty string)
  { '/'?: PrefixTrieChild } // leaf nodes

type PrefixTrieChild = Record<string, unknown>

export function makeTrie(files: Record<string, PrefixTrieChild>): PrefixTrieObject {
  const trie: PrefixTrieObject = {}
  for (const [path, leaf] of Object.entries(files)) {
    let current = trie
    for (const [, part] of path.matchAll(/\/([^/]*)/g) || []) {
      if (!part) continue
      if (!current[part]) {
        const child: PrefixTrieObject = {}
        current[part] = child
      }
      current = current[part]
    }
    current['/'] = leaf
  }
  return trie
}
