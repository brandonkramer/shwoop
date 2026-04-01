import { describe, expect, test, beforeAll, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { s3Provider } from "../../src/providers/s3.ts";
import * as s3Fetch from "../../src/utils/s3-fetch.ts";
import { createTestTarball } from "../helpers/tarball.ts";

const realSpawn = Bun.spawn.bind(Bun);

describe("s3Provider", () => {
	test("matches s3: prefix", () => {
		expect(s3Provider.match("s3:receipts-2019/templates")).toBe(true);
	});

	test("matches r2: prefix", () => {
		expect(s3Provider.match("r2:divorce-lawyers/assets")).toBe(true);
	});

	test("does not match other prefixes", () => {
		expect(s3Provider.match("gh:jeff/cold-soup")).toBe(false);
		expect(s3Provider.match("gs:lost-and-found/misc")).toBe(false);
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
			dest = join(await mkdtemp(join(tmpdir(), "shwoop-s3-dl-")), "out");
			capturedArgs = [];
			spy = spyOn(Bun, "spawn").mockImplementation(((args: string[], opts?: any) => {
				if (Array.isArray(args) && args[0] === "which" && args[1] === "aws") {
					return realSpawn(["true"], { stdout: "pipe", stderr: "pipe" });
				}
				if (Array.isArray(args) && args[0] === "aws") {
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

		test("calls aws s3 cp with correct URI", async () => {
			await s3Provider.download("s3:receipts-2019/template.tar.gz", dest);
			expect(capturedArgs).toHaveLength(1);
			expect(capturedArgs[0]!.slice(0, 4)).toEqual([
				"aws",
				"s3",
				"cp",
				"s3://receipts-2019/template.tar.gz",
			]);
		});

		test("extracts downloaded tarball", async () => {
			await s3Provider.download("s3:receipts-2019/template.tar.gz", dest);
			const readme = await readFile(join(dest, "readme.txt"), "utf-8");
			expect(readme).toBe("this file was inside the tarball");
			const nested = await readFile(join(dest, "sub", "nested.txt"), "utf-8");
			expect(nested).toBe("still here");
		});

		test("passes --endpoint-url for r2:", async () => {
			process.env.R2_ENDPOINT = "https://fake.r2.cloudflarestorage.com";
			try {
				await s3Provider.download("r2:divorce-lawyers/template.tar.gz", dest);
				expect(capturedArgs).toHaveLength(1);
				const args = capturedArgs[0]!;
				expect(args).toContain("--endpoint-url");
				expect(args).toContain("https://fake.r2.cloudflarestorage.com");
			} finally {
				delete process.env.R2_ENDPOINT;
			}
		});

		test("throws without R2_ENDPOINT for r2:", async () => {
			spy.mockRestore();
			delete process.env.R2_ENDPOINT;
			await expect(s3Provider.download("r2:bucket/file.tar.gz", dest)).rejects.toThrow(
				"R2_ENDPOINT",
			);
		});

		test("throws when aws CLI fails", async () => {
			spy.mockRestore();
			spy = spyOn(Bun, "spawn").mockImplementation(((args: string[], opts?: any) => {
				if (Array.isArray(args) && args[0] === "which" && args[1] === "aws") {
					return realSpawn(["true"], { stdout: "pipe", stderr: "pipe" });
				}
				if (Array.isArray(args) && args[0] === "aws") {
					return realSpawn(["sh", "-c", "echo 'access denied' >&2; exit 1"], {
						stdout: "pipe",
						stderr: "pipe",
					});
				}
				return realSpawn(args, opts);
			}) as any);
			await expect(s3Provider.download("s3:forbidden/secrets.tar.gz", dest)).rejects.toThrow(
				"aws s3 cp failed",
			);
		});

		test("throws when source has no key path", async () => {
			await expect(s3Provider.download("s3:just-a-bucket", dest)).rejects.toThrow(
				"must include a key path",
			);
		});
	});

	describe("aws4fetch fallback", () => {
		let tarball: string;
		let dest: string;
		let spawnSpy: ReturnType<typeof spyOn>;
		let fetchSpy: ReturnType<typeof spyOn>;

		beforeAll(async () => {
			tarball = await createTestTarball();
		});

		beforeEach(async () => {
			dest = join(await mkdtemp(join(tmpdir(), "shwoop-s3-fetch-")), "out");
			// Make `which aws` fail so the fallback path is taken
			spawnSpy = spyOn(Bun, "spawn").mockImplementation(((args: string[], opts?: any) => {
				if (Array.isArray(args) && args[0] === "which") {
					return realSpawn(["false"], { stdout: "pipe", stderr: "pipe" });
				}
				return realSpawn(args, opts);
			}) as any);
		});

		afterEach(async () => {
			spawnSpy.mockRestore();
			fetchSpy?.mockRestore();
			delete process.env.AWS_ACCESS_KEY_ID;
			delete process.env.AWS_SECRET_ACCESS_KEY;
			await rm(dest, { recursive: true, force: true });
		});

		test("falls back to aws4fetch when CLI is missing and env vars are set", async () => {
			process.env.AWS_ACCESS_KEY_ID = "test-key";
			process.env.AWS_SECRET_ACCESS_KEY = "test-secret";
			let capturedUrl = "";
			fetchSpy = spyOn(s3Fetch, "downloadWithAwsClient").mockImplementation(
				async (url: string, localPath: string) => {
					capturedUrl = url;
					await Bun.write(localPath, Bun.file(tarball));
				},
			);
			await s3Provider.download("s3:my-bucket/templates/starter.tar.gz", dest);
			expect(capturedUrl).toBe("https://my-bucket.s3.amazonaws.com/templates/starter.tar.gz");
			const readme = await readFile(join(dest, "readme.txt"), "utf-8");
			expect(readme).toBe("this file was inside the tarball");
		});

		test("passes R2 endpoint to aws4fetch", async () => {
			process.env.AWS_ACCESS_KEY_ID = "test-key";
			process.env.AWS_SECRET_ACCESS_KEY = "test-secret";
			process.env.R2_ENDPOINT = "https://acct.r2.cloudflarestorage.com";
			let capturedUrl = "";
			let capturedOpts: any;
			fetchSpy = spyOn(s3Fetch, "downloadWithAwsClient").mockImplementation(
				async (url: string, localPath: string, opts?: any) => {
					capturedUrl = url;
					capturedOpts = opts;
					await Bun.write(localPath, Bun.file(tarball));
				},
			);
			try {
				await s3Provider.download("r2:my-bucket/template.tar.gz", dest);
				expect(capturedUrl).toBe("https://acct.r2.cloudflarestorage.com/my-bucket/template.tar.gz");
				expect(capturedOpts).toEqual({ service: "s3", region: "auto" });
			} finally {
				delete process.env.R2_ENDPOINT;
			}
		});

		test("strips trailing slash from R2_ENDPOINT", async () => {
			process.env.AWS_ACCESS_KEY_ID = "test-key";
			process.env.AWS_SECRET_ACCESS_KEY = "test-secret";
			process.env.R2_ENDPOINT = "https://acct.r2.cloudflarestorage.com/";
			let capturedUrl = "";
			fetchSpy = spyOn(s3Fetch, "downloadWithAwsClient").mockImplementation(
				async (url: string, localPath: string) => {
					capturedUrl = url;
					await Bun.write(localPath, Bun.file(tarball));
				},
			);
			try {
				await s3Provider.download("r2:bucket/file.tar.gz", dest);
				expect(capturedUrl).not.toContain("//bucket");
				expect(capturedUrl).toBe("https://acct.r2.cloudflarestorage.com/bucket/file.tar.gz");
			} finally {
				delete process.env.R2_ENDPOINT;
			}
		});

		test("throws when no CLI and no env vars", async () => {
			delete process.env.AWS_ACCESS_KEY_ID;
			delete process.env.AWS_SECRET_ACCESS_KEY;
			await expect(s3Provider.download("s3:bucket/file.tar.gz", dest)).rejects.toThrow(
				"aws CLI not found",
			);
		});
	});
});
