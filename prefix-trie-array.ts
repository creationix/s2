// Array based prefix trie
export type PrefixTrieArray = [Record<string, unknown>, ...(string | PrefixTrieArray)[]] | [...(string | PrefixTrieArray)[]]
export type PrefixTrieChild = Record<string, unknown>

// Build an array based prefix trie from a flat map of paths to leaf nodes
// Each node is an array of alternating strings (path parts) and child nodes (arrays or leaf nodes)
// The first entry in a node can also be a leaf for nodes that are also leaves
export function makeTrie(files: Record<string, PrefixTrieChild>): PrefixTrieArray {
  const trie: PrefixTrieArray = []
  for (const [path, leaf] of Object.entries(files)) {
    let current: PrefixTrieArray = trie
    let lastParent: PrefixTrieArray | null = null
    let lastKey: string | null = null
    for (const [, part] of path.matchAll(/\/([^/]*)/g) || []) {
      if (!part) continue
      if (!Array.isArray(current)) {
        console.log({ current, part })
        throw new Error('Invalid prefix trie structure')
      }
      const index = current.indexOf(part)
      lastParent = current
      lastKey = part
      if (index === -1) {
        // If the segment key doesn't exist yet, add it to the array with a new empty node
        const child: PrefixTrieArray = []
        current.push(part, child)
        current = child
      } else {
        let next: string | undefined | PrefixTrieArray | PrefixTrieChild = current[index + 1]
        if (!next || typeof next === 'string') {
          console.log({ current, index, next, part })
          throw new Error('Invalid prefix trie structure, string must be followed by object')
        }
        // If the value after the key is a leaf, convert it to a node with the leaf as first entry
        if (!Array.isArray(next)) {
          next = [next] as PrefixTrieArray
          current[index + 1] = next
        }
        current = next
      }
    }
    if (lastParent && lastKey && current.length === 0) {
      // If the current node is empty, we can just add the leaf here
      lastParent[lastParent.indexOf(lastKey) + 1] = leaf
    } else {
      // Otherwise we need to add the leaf as the first entry in the current node
      // The typesystem doesn't like unshift on a union type, so we need lie about the type
      current.unshift(leaf as unknown as string)
    }
  }
  return trie
}
