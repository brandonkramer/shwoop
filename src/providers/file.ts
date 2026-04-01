import { cp } from "node:fs/promises";

import type { Provider } from "./types.ts";

export const fileProvider: Provider = {
	name: "file",
	match: (source) => source.startsWith("file:"),
	download: async (source, dest) => {
		const path = source.slice("file:".length);
		await cp(path, dest, { recursive: true });
	},
};
