import { downloadTemplate } from "giget";

import type { Provider } from "./types.ts";

const PREFIXES = ["gh:", "gl:", "bb:"];

export const gigetProvider: Provider = {
	name: "giget",
	match: (source) => PREFIXES.some((p) => source.startsWith(p)),
	download: async (source, dest) => {
		await downloadTemplate(source, { dir: dest, force: true });
	},
};
