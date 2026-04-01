import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { extractArchive } from "../utils/extract.ts";
import { downloadWithAwsClient, hasCommand } from "../utils/s3-fetch.ts";
import type { Provider } from "./types.ts";

async function downloadViaCli(uri: string, localPath: string): Promise<void> {
	const proc = Bun.spawn(["gcloud", "storage", "cp", uri, localPath], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`gcloud storage cp failed: ${stderr}`);
	}
}

async function downloadViaFetch(bucket: string, key: string, localPath: string): Promise<void> {
	const url = `https://storage.googleapis.com/${bucket}/${key}`;
	await downloadWithAwsClient(url, localPath, { service: "s3", region: "auto" });
}

export const gcsProvider: Provider = {
	name: "gcs",
	match: (source) => source.startsWith("gs:"),
	download: async (source, dest) => {
		const path = source.slice("gs:".length);
		const slashIdx = path.indexOf("/");
		const bucket = slashIdx === -1 ? path : path.slice(0, slashIdx);
		const key = slashIdx === -1 ? "" : path.slice(slashIdx + 1);
		const uri = `gs://${path}`;

		if (!key) {
			throw new Error(`gs: source must include a key path (got "${source}")`);
		}

		const tmp = await mkdtemp(join(tmpdir(), "shwoop-gcs-"));
		const localPath = join(tmp, basename(uri));

		try {
			if (await hasCommand("gcloud")) {
				await downloadViaCli(uri, localPath);
			} else if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
				await downloadViaFetch(bucket, key, localPath);
			} else {
				throw new Error(
					"gcloud CLI not found and no AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY set.\n" +
						"Install gcloud CLI or set GCS HMAC credentials as AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY.",
				);
			}

			await extractArchive(localPath, dest);
		} finally {
			await rm(tmp, { recursive: true, force: true });
		}
	},
};
