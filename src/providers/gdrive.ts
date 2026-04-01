import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractArchive } from "../utils/extract.ts";
import type { Provider } from "./types.ts";

function toDirectUrl(source: string): string {
	const id = source.slice("gdrive:".length);
	return `https://drive.google.com/uc?export=download&id=${id}`;
}

export const gdriveProvider: Provider = {
	name: "gdrive",
	match: (source) => source.startsWith("gdrive:"),
	download: async (source, dest) => {
		const id = source.slice("gdrive:".length);
		if (!id) {
			throw new Error("Missing Google Drive file ID: expected gdrive:<file-id>");
		}
		const url = toDirectUrl(source);
		const tmp = await mkdtemp(join(tmpdir(), "shwoop-gdrive-"));

		try {
			const res = await fetch(url, { redirect: "follow" });
			if (!res.ok) {
				throw new Error(`Google Drive download failed: ${res.status} ${res.statusText}`);
			}

			const contentType = res.headers.get("content-type") ?? "";
			if (contentType.startsWith("text/html")) {
				throw new Error(
					"Google Drive returned an HTML page instead of a file — this usually means the file " +
						"requires a virus scan confirmation or is not publicly shared",
				);
			}

			const contentDisposition = res.headers.get("content-disposition");
			const filename =
				contentDisposition?.match(/filename="?([^";\s]+)"?/)?.[1] ?? "download.tar.gz";
			const localPath = join(tmp, filename);

			await Bun.write(localPath, await res.arrayBuffer());
			await extractArchive(localPath, dest);
		} finally {
			await rm(tmp, { recursive: true, force: true });
		}
	},
};
