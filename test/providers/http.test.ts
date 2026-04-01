import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { httpProvider } from "../../src/providers/http.ts";
import { createTestTarball, createLargeTarball } from "../helpers/tarball.ts";

describe("httpProvider", () => {
	test("matches https:// URLs", () => {
		expect(httpProvider.match("https://example.com/disputed-invoice.tar.gz")).toBe(true);
	});

	test("matches http:// URLs", () => {
		expect(httpProvider.match("http://example.com/sourdough-starter.tar.gz")).toBe(true);
	});

	test("does not match prefixed sources", () => {
		expect(httpProvider.match("gh:jeff/cold-soup")).toBe(false);
		expect(httpProvider.match("s3:receipts-2019")).toBe(false);
	});

	describe("download", () => {
		let server: ReturnType<typeof Bun.serve>;
		let tarball: string;
		let dest: string;

		let largeTarball: string;

		beforeAll(async () => {
			tarball = await createTestTarball();
			largeTarball = await createLargeTarball();
			server = Bun.serve({
				port: 0,
				async fetch(req) {
					const url = new URL(req.url);
					if (url.pathname === "/template.tar.gz") {
						return new Response(Bun.file(tarball));
					}
					if (url.pathname === "/large.tar.gz") {
						return new Response(Bun.file(largeTarball));
					}
					if (url.pathname === "/redirect") {
						return Response.redirect(`http://localhost:${server!.port}/template.tar.gz`, 302);
					}
					return new Response("not found", { status: 404 });
				},
			});
		});

		afterAll(() => {
			server.stop(true);
		});

		beforeEach(async () => {
			dest = join(await mkdtemp(join(tmpdir(), "shwoop-http-dl-")), "out");
		});

		afterEach(async () => {
			await rm(dest, { recursive: true, force: true });
		});

		test("downloads and extracts a tarball", async () => {
			await httpProvider.download(`http://localhost:${server.port}/template.tar.gz`, dest);
			const readme = await readFile(join(dest, "readme.txt"), "utf-8");
			expect(readme).toBe("this file was inside the tarball");
			const nested = await readFile(join(dest, "sub", "nested.txt"), "utf-8");
			expect(nested).toBe("still here");
		});

		test("follows redirects", async () => {
			await httpProvider.download(`http://localhost:${server.port}/redirect`, dest);
			const readme = await readFile(join(dest, "readme.txt"), "utf-8");
			expect(readme).toBe("this file was inside the tarball");
		});

		test("handles large response bodies", async () => {
			await httpProvider.download(`http://localhost:${server.port}/large.tar.gz`, dest);
			const marker = await readFile(join(dest, "marker.txt"), "utf-8");
			expect(marker).toBe("large tarball marker");
			// Verify the padding file was extracted and is roughly the right size
			const padding = await stat(join(dest, "padding.bin"));
			expect(padding.size).toBeGreaterThan(1_000_000);
		});

		test("throws on 404", async () => {
			expect(
				httpProvider.download(`http://localhost:${server.port}/nothing-here.tar.gz`, dest),
			).rejects.toThrow("HTTP download failed");
		});
	});
});
