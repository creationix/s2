import { encode, encoder } from "./d2.ts";

const data = await Bun.file("./combined.obj-trie.json").json();

for (const line of encoder(data)) {
	console.log(line);
}
