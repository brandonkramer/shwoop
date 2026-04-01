import { describe, expect, test, beforeAll, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { gcsProvider } from "../../src/providers/gcs.ts";
import { createTestTarball } from "../helpers/tarball.ts";

const realSpawn = Bun.spawn.bind(Bun);

describe("gcsProvider", () => {
	test("matches gs: prefix", () => {
		expect(gcsProvider.match("gs:lost-and-found/misc")).toBe(true);
	});

	test("does not match other prefixes", () => {
		expect(gcsProvider.match("s3:receipts-2019/templates")).toBe(false);
		expect(gcsProvider.match("gh:jeff/cold-soup")).toBe(false);
	});

	describe("download", () => {
		let tarball: string;
		let dest: string;
		let spy: ReturnType<typeof spyOn>;
		let capturedArgs: string[][];

		beforeAll(async () => {
			tarball = await createTestTarball();
		});

		beforeEach(async () => {
			dest = join(await mkdtemp(join(tmpdir(), "shwoop-gcs-dl-")), "out");
			capturedArgs = [];
			spy = spyOn(Bun, "spawn").mockImplementation(((args: string[], opts?: any) => {
				if (Array.isArray(args) && args[0] === "which" && args[1] === "gcloud") {
					return realSpawn(["true"], { stdout: "pipe", stderr: "pipe" });
				}
				if (Array.isArray(args) && args[0] === "gcloud") {
					capturedArgs.push([...args]);
					const localPath = args[4]!;
					return realSpawn(["cp", tarball, localPath], { stdout: "pipe", stderr: "pipe" });
				}
				return realSpawn(args, opts);
			}) as any);
		});

		afterEach(async () => {
			spy.mockRestore();
			await rm(dest, { recursive: true, force: true });
		});

		test("calls gcloud storage cp with correct URI", async () => {
			await gcsProvider.download("gs:lost-and-found/template.tar.gz", dest);
			expect(capturedArgs).toHaveLength(1);
			expect(capturedArgs[0]!.slice(0, 4)).toEqual([
				"gcloud",
				"storage",
				"cp",
				"gs://lost-and-found/template.tar.gz",
			]);
		});

		test("extracts downloaded tarball", async () => {
			await gcsProvider.download("gs:lost-and-found/template.tar.gz", dest);
			const readme = await readFile(join(dest, "readme.txt"), "utf-8");
			expect(readme).toBe("this file was inside the tarball");
			const nested = await readFile(join(dest, "sub", "nested.txt"), "utf-8");
			expect(nested).toBe("still here");
		});

		test("throws when gcloud CLI fails", async () => {
			spy.mockRestore();
			spy = spyOn(Bun, "spawn").mockImplementation(((args: string[], opts?: any) => {
				if (Array.isArray(args) && args[0] === "which" && args[1] === "gcloud") {
					return realSpawn(["true"], { stdout: "pipe", stderr: "pipe" });
				}
				if (Array.isArray(args) && args[0] === "gcloud") {
					return realSpawn(["sh", "-c", "echo 'not authenticated' >&2; exit 1"], {
						stdout: "pipe",
						stderr: "pipe",
					});
				}
				return realSpawn(args, opts);
			}) as any);
			await expect(gcsProvider.download("gs:locked-bucket/nope.tar.gz", dest)).rejects.toThrow(
				"gcloud storage cp failed",
			);
		});
	});
});
