import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { extractArchive } from "../utils/extract.ts";
import { downloadWithAwsClient, hasCommand } from "../utils/s3-fetch.ts";
import type { Provider } from "./types.ts";

async function downloadViaCli(uri: string, localPath: string, endpoint?: string): Promise<void> {
	const args = ["aws", "s3", "cp", uri, localPath];
	if (endpoint) {
		args.push("--endpoint-url", endpoint);
	}
	const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`aws s3 cp failed: ${stderr}`);
	}
}

async function downloadViaFetch(
	bucket: string,
	key: string,
	localPath: string,
	endpoint?: string,
): Promise<void> {
	const url = endpoint
		? `${endpoint}/${bucket}/${key}`
		: `https://${bucket}.s3.amazonaws.com/${key}`;
	const opts = endpoint ? { service: "s3", region: "auto" } : undefined;
	await downloadWithAwsClient(url, localPath, opts);
}

export const s3Provider: Provider = {
	name: "s3",
	match: (source) => source.startsWith("s3:") || source.startsWith("r2:"),
	download: async (source, dest) => {
		const isR2 = source.startsWith("r2:");
		const path = source.slice(3);
		const slashIdx = path.indexOf("/");
		const bucket = slashIdx === -1 ? path : path.slice(0, slashIdx);
		const key = slashIdx === -1 ? "" : path.slice(slashIdx + 1);
		const uri = `s3://${path}`;

		if (!key) {
			throw new Error(`s3: source must include a key path (got "${source}")`);
		}

		const endpoint = isR2 ? process.env.R2_ENDPOINT?.replace(/\/+$/, "") : undefined;
		if (isR2 && !endpoint) {
			throw new Error("R2_ENDPOINT environment variable required for r2: sources");
		}

		const tmp = await mkdtemp(join(tmpdir(), "shwoop-s3-"));
		const localPath = join(tmp, basename(uri));

		try {
			if (await hasCommand("aws")) {
				await downloadViaCli(uri, localPath, endpoint);
			} else if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
				await downloadViaFetch(bucket, key, localPath, endpoint);
			} else {
				throw new Error("aws CLI not found and no AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY set.");
			}

			await extractArchive(localPath, dest);
		} finally {
			await rm(tmp, { recursive: true, force: true });
		}
	},
};
