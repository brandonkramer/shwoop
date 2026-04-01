import { describe, expect, test, beforeAll, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { npmProvider } from "../../src/providers/npm.ts";
import { createNpmTarball } from "../helpers/tarball.ts";

const realSpawn = Bun.spawn.bind(Bun);

describe("npmProvider", () => {
	describe("match", () => {
		test("matches scoped package", () => {
			expect(npmProvider.match("npm:@disputed/toast")).toBe(true);
		});

		test("matches unscoped package", () => {
			expect(npmProvider.match("npm:left-pad")).toBe(true);
		});

		test("does not match other prefixes", () => {
			expect(npmProvider.match("gh:jeff/cold-soup")).toBe(false);
			expect(npmProvider.match("s3:receipts-2019")).toBe(false);
			expect(npmProvider.match("file:./local")).toBe(false);
		});
	});

	describe("download", () => {
		let npmTarball: string;
		let npmFilename: string;
		let dest: string;
		let spy: ReturnType<typeof spyOn>;
		let capturedArgs: string[][];

		beforeAll(async () => {
			const result = await createNpmTarball();
			npmTarball = result.path;
			npmFilename = result.filename;
		});

		beforeEach(async () => {
			dest = join(await mkdtemp(join(tmpdir(), "shwoop-npm-dl-")), "out");
			capturedArgs = [];
			spy = spyOn(Bun, "spawn").mockImplementation(((args: string[], opts?: any) => {
				if (Array.isArray(args) && args[0] === "npm" && args[1] === "pack") {
					capturedArgs.push([...args]);
					const destIdx = args.indexOf("--pack-destination");
					const packDest = destIdx >= 0 ? args[destIdx + 1] : ".";
					const destPath = join(packDest!, npmFilename);
					return realSpawn(
						["sh", "-c", `cp "${npmTarball}" "${destPath}" && echo "${npmFilename}"`],
						{ stdout: "pipe", stderr: "pipe" },
					);
				}
				return realSpawn(args, opts);
			}) as any);
		});

		afterEach(async () => {
			spy.mockRestore();
			await rm(dest, { recursive: true, force: true });
		});

		test("calls npm pack with correct package name", async () => {
			await npmProvider.download("npm:@disputed/toast", dest);
			expect(capturedArgs).toHaveLength(1);
			const args = capturedArgs[0]!;
			expect(args.slice(0, 3)).toEqual(["npm", "pack", "@disputed/toast"]);
			expect(args).toContain("--pack-destination");
		});

		test("passes version specifier through to npm pack", async () => {
			await npmProvider.download("npm:left-pad@1.1.3", dest);
			expect(capturedArgs).toHaveLength(1);
			expect(capturedArgs[0]![2]).toBe("left-pad@1.1.3");
		});

		test("passes scoped package with version through", async () => {
			await npmProvider.download("npm:@disputed/toast@2.0.0-rc.1", dest);
			expect(capturedArgs[0]![2]).toBe("@disputed/toast@2.0.0-rc.1");
		});

		test("passes dist-tag specifier through", async () => {
			await npmProvider.download("npm:left-pad@latest", dest);
			expect(capturedArgs[0]![2]).toBe("left-pad@latest");
		});

		test("extracts with strip-components (no package/ prefix in output)", async () => {
			await npmProvider.download("npm:@disputed/toast", dest);
			const readme = await readFile(join(dest, "readme.txt"), "utf-8");
			expect(readme).toBe("npm package contents");
			const index = await readFile(join(dest, "index.js"), "utf-8");
			expect(index).toBe("module.exports = 'placeholder'");
		});

		test("handles npm warnings in stdout before filename", async () => {
			spy.mockRestore();
			spy = spyOn(Bun, "spawn").mockImplementation(((args: string[], opts?: any) => {
				if (Array.isArray(args) && args[0] === "npm" && args[1] === "pack") {
					capturedArgs.push([...args]);
					const destIdx = args.indexOf("--pack-destination");
					const packDest = destIdx >= 0 ? args[destIdx + 1] : ".";
					const destPath = join(packDest!, npmFilename);
					return realSpawn(
						[
							"sh",
							"-c",
							`cp "${npmTarball}" "${destPath}" && echo "npm warn deprecated something@1.0.0" && echo "${npmFilename}"`,
						],
						{ stdout: "pipe", stderr: "pipe" },
					);
				}
				return realSpawn(args, opts);
			}) as any);

			await npmProvider.download("npm:@disputed/toast", dest);
			const readme = await readFile(join(dest, "readme.txt"), "utf-8");
			expect(readme).toBe("npm package contents");
		});

		test("cleans up tmp directory after success", async () => {
			const fsPromises = await import("node:fs/promises");
			const realMkdtemp = fsPromises.mkdtemp.bind(fsPromises);
			let tmpDir: string | undefined;
			const mkdtempSpy = spyOn(fsPromises, "mkdtemp").mockImplementation(async (prefix: string) => {
				tmpDir = await realMkdtemp(prefix);
				return tmpDir;
			});

			try {
				await npmProvider.download("npm:@disputed/toast", dest);
				expect(tmpDir).toBeDefined();
				expect(stat(tmpDir!)).rejects.toThrow();
			} finally {
				mkdtempSpy.mockRestore();
			}
		});

		test("throws when npm pack fails", async () => {
			spy.mockRestore();
			spy = spyOn(Bun, "spawn").mockImplementation(((args: string[], opts?: any) => {
				if (Array.isArray(args) && args[0] === "npm" && args[1] === "pack") {
					return realSpawn(["sh", "-c", "echo 'E404 not found' >&2; exit 1"], {
						stdout: "pipe",
						stderr: "pipe",
					});
				}
				return realSpawn(args, opts);
			}) as any);
			await expect(npmProvider.download("npm:@nonexistent/ghost-package", dest)).rejects.toThrow(
				"npm pack failed",
			);
		});

		test("rejects invalid package specifier", async () => {
			await expect(npmProvider.download("npm:../etc/passwd", dest)).rejects.toThrow(
				"Invalid npm package specifier",
			);
		});

		test("rejects empty package name", async () => {
			await expect(npmProvider.download("npm:", dest)).rejects.toThrow(
				"Invalid npm package specifier",
			);
		});
	});
});
