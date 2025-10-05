import { makeKey } from "./structural-key.js";

export function* encoder(value: unknown): Generator<string, number> {
	let lineCount = 0;
	// Map from value to line it was written on
	const seen = new Map<unknown, number>();

	// Find unique strings by walking recursively and recording all full strings as well as string segments.
	const stringCounts: Record<string, number> = {};
	const schemaCounts: Record<string, number> = {};
	const schemaKeys = new Map<object, string>();
	countStrings(value);
	// console.log(stringCounts);

	return yield* encodeLine(value);

	function countStrings(val: unknown) {
		if (typeof val === "string") {
			const segments = getStringSegments(val);
			if (segments) {
				for (const segment of segments) {
					stringCounts[segment] = (stringCounts[segment] ?? 0) + 1;
				}
			} else {
				stringCounts[val] = (stringCounts[val] ?? 0) + 1;
			}
		} else if (Array.isArray(val)) {
			for (const i of val) {
				countStrings(i);
			}
		} else if (val && typeof val === "object") {
			const keys = Object.keys(val);
			const schemaKey = keys.join(",");
			schemaCounts[schemaKey] = (schemaCounts[schemaKey] ?? 0) + 1;
			schemaKeys.set(val, schemaKey);
			for (const k of keys) {
				stringCounts[k] = (stringCounts[k] ?? 0) + 1;
			}
			for (const [k, v] of Object.entries(val)) {
				countStrings(v);
			}
		}
	}

	function* encodeValue(
		val: unknown,
		key = makeKey(val),
	): Generator<string, unknown> {
		const cached = seen.get(key);
		if (cached !== undefined) {
			return cached;
		}
		// Inline some values to save space and simplify
		if (
			val === null ||
			val === true ||
			val === false ||
			(typeof val === "string" && stringCounts[val] <= 4)
		) {
			return val;
		}
		return yield* encodeLine(val, key);
	}

	function* encodeLine(
		val: unknown,
		key = makeKey(val),
	): Generator<string, number> {
		const cached = seen.get(key);
		if (cached !== undefined) {
			return cached;
		}
		let line = val;
		if (val && typeof val === "object") {
			if (Array.isArray(val)) {
				const values: unknown[] = [];
				for (const item of val) {
					values.push(yield* encodeValue(item));
				}
				line = values;
			} else if (schemaCounts[schemaKeys.get(val)!] > 1) {
				const schema = yield* encodeLine(Object.keys(val));
				const values = [];
				for (const v of Object.values(val)) {
					values.push(yield* encodeValue(v));
				}
				line = [-schema, ...values];
			} else {
				const entries: [string, unknown][] = [];
				for (const [k, v] of Object.entries(val)) {
					entries.push([k, yield* encodeValue(v)]);
				}
				line = Object.fromEntries(entries);
			}
		} else {
			if (typeof val === "string") {
				const segments = getStringSegments(val);
				if (segments) {
					const parts: unknown[] = [0];
					for (const segment of segments) {
						parts.push(yield* encodeValue(segment));
					}
					line = parts;
				}
			}
		}
		yield JSON.stringify(line);
		seen.set(key, ++lineCount);
		return lineCount;
	}
}

export function encode(value: unknown): string {
	return [...encoder(value)].join("\n");
}

export function getStringSegments(str: string): string[] | undefined {
	if (str.length > 20) {
		const segments = [...str.match(/[^a-z0-9]*[a-z0-9-]*/gi)].filter(Boolean);
		if (segments.length > 1) {
			// console.error(segments);
			return segments;
		}
	}
}
