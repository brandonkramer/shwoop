import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractTarball } from "../utils/extract.ts";
import type { Provider } from "./types.ts";

/** Matches valid npm package names: scoped (@scope/name) or unscoped (name), with optional version/tag */
const NPM_PKG_RE = /^(@[a-z0-9\-~][a-z0-9\-._~]*\/)?[a-z0-9\-~][a-z0-9\-._~]*(@.+)?$/;

export const npmProvider: Provider = {
	name: "npm",
	match: (source) => source.startsWith("npm:"),
	download: async (source, dest) => {
		const pkg = source.slice("npm:".length);
		if (!NPM_PKG_RE.test(pkg)) {
			throw new Error(`Invalid npm package specifier: ${pkg}`);
		}

		const tmp = await mkdtemp(join(tmpdir(), "shwoop-npm-"));

		try {
			const proc = Bun.spawn(["npm", "pack", pkg, "--pack-destination", tmp], {
				stdout: "pipe",
				stderr: "pipe",
			});
			const stdout = await new Response(proc.stdout).text();
			const exitCode = await proc.exited;
			if (exitCode !== 0) {
				const stderr = await new Response(proc.stderr).text();
				throw new Error(`npm pack failed: ${stderr}`);
			}

			// npm pack may emit warnings before the filename; use the last non-empty line
			const lines = stdout.trim().split("\n");
			const filename = lines[lines.length - 1]!.trim();
			const tarball = join(tmp, filename);
			await extractTarball(tarball, dest, { stripComponents: 1 });
		} finally {
			await rm(tmp, { recursive: true, force: true });
		}
	},
};
