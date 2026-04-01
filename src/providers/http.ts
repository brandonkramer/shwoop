import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { extractArchive } from "../utils/extract.ts";
import type { Provider } from "./types.ts";

export const httpProvider: Provider = {
	name: "http",
	match: (source) => source.startsWith("https://") || source.startsWith("http://"),
	download: async (source, dest) => {
		const tmp = await mkdtemp(join(tmpdir(), "shwoop-http-"));

		try {
			const res = await fetch(source, { redirect: "follow" });
			if (!res.ok) {
				throw new Error(`HTTP download failed: ${res.status} ${res.statusText}`);
			}

			const url = new URL(source);
			const filename = basename(url.pathname) || "download.tar.gz";
			const localPath = join(tmp, filename);

			await Bun.write(localPath, await res.arrayBuffer());
			await extractArchive(localPath, dest);
		} finally {
			await rm(tmp, { recursive: true, force: true });
		}
	},
};
