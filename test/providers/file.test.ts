import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fileProvider } from "../../src/providers/file.ts";

describe("fileProvider", () => {
	let src: string;
	let dest: string;

	beforeEach(async () => {
		src = await mkdtemp(join(tmpdir(), "shwoop-test-file-src-"));
		dest = join(await mkdtemp(join(tmpdir(), "shwoop-test-file-dest-")), "out");
	});

	afterEach(async () => {
		await rm(src, { recursive: true, force: true });
		await rm(dest, { recursive: true, force: true });
	});

	test("matches file: prefix", () => {
		expect(fileProvider.match("file:./shed")).toBe(true);
		expect(fileProvider.match("file:/absolute")).toBe(true);
		expect(fileProvider.match("gh:jeff/cold-soup")).toBe(false);
	});

	test("copies directory contents to dest", async () => {
		await writeFile(join(src, "hello.txt"), "world");
		await mkdir(join(src, "sub"), { recursive: true });
		await writeFile(join(src, "sub", "nested.txt"), "deep");

		await fileProvider.download(`file:${src}`, dest);

		const hello = await readFile(join(dest, "hello.txt"), "utf-8");
		expect(hello).toBe("world");

		const nested = await readFile(join(dest, "sub", "nested.txt"), "utf-8");
		expect(nested).toBe("deep");
	});

	test("throws when source path does not exist", async () => {
		await expect(
			fileProvider.download("file:/tmp/shwoop-does-not-exist-ever", dest),
		).rejects.toThrow();
	});
});
