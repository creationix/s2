import { encode, encoder } from "./d2.ts"

import * as data from "./combined.obj-trie.json" 

for (const line of encoder(data)) {
  console.log(line)
}
