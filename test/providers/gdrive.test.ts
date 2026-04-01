import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { gdriveProvider } from "../../src/providers/gdrive.ts";
import { createTestTarball } from "../helpers/tarball.ts";

describe("gdriveProvider", () => {
	test("matches gdrive: prefix", () => {
		expect(gdriveProvider.match("gdrive:grandma_wifi_password")).toBe(true);
	});

	test("does not match other prefixes", () => {
		expect(gdriveProvider.match("gs:lost-and-found")).toBe(false);
		expect(gdriveProvider.match("https://drive.google.com")).toBe(false);
	});

	describe("download", () => {
		let server: ReturnType<typeof Bun.serve>;
		let tarball: string;
		let dest: string;
		let capturedUrls: string[];
		const originalFetch = globalThis.fetch;

		beforeAll(async () => {
			tarball = await createTestTarball();
			server = Bun.serve({
				port: 0,
				async fetch(req) {
					const url = new URL(req.url);
					if (url.pathname === "/uc") {
						const id = url.searchParams.get("id");
						if (id === "abc123") {
							return new Response(Bun.file(tarball), {
								headers: { "content-disposition": 'attachment; filename="receipts.tar.gz"' },
							});
						}
						if (id === "no-header") {
							return new Response(Bun.file(tarball));
						}
						if (id === "virus-scan") {
							// Simulates the Google Drive virus-scan interstitial HTML page
							return new Response("<html><body>Google Drive - Virus scan warning</body></html>", {
								headers: { "content-type": "text/html" },
							});
						}
					}
					return new Response("not found", { status: 404 });
				},
			});
		});

		afterAll(async () => {
			globalThis.fetch = originalFetch;
			await server.stop(true);
		});

		beforeEach(async () => {
			dest = join(await mkdtemp(join(tmpdir(), "shwoop-gdrive-dl-")), "out");
			capturedUrls = [];
			const interceptedFetch = (input: string | URL | Request, init?: RequestInit) => {
				const url =
					typeof input === "string"
						? input
						: input instanceof URL
							? input.toString()
							: (input as Request).url;
				if (url.includes("drive.google.com")) {
					capturedUrls.push(url);
					const parsed = new URL(url);
					const id = parsed.searchParams.get("id");
					return originalFetch(`http://localhost:${server.port}/uc?id=${id}`, init);
				}
				return originalFetch(input, init);
			};
			globalThis.fetch = interceptedFetch as any;
		});

		afterEach(async () => {
			globalThis.fetch = originalFetch;
			await rm(dest, { recursive: true, force: true });
		});

		test("constructs correct Google Drive download URL", async () => {
			await gdriveProvider.download("gdrive:abc123", dest);
			expect(capturedUrls).toHaveLength(1);
			expect(capturedUrls[0]).toBe("https://drive.google.com/uc?export=download&id=abc123");
		});

		test("extracts downloaded tarball", async () => {
			await gdriveProvider.download("gdrive:abc123", dest);
			const readme = await readFile(join(dest, "readme.txt"), "utf-8");
			expect(readme).toBe("this file was inside the tarball");
			const nested = await readFile(join(dest, "sub", "nested.txt"), "utf-8");
			expect(nested).toBe("still here");
		});

		test("falls back to download.tar.gz when no content-disposition", async () => {
			await gdriveProvider.download("gdrive:no-header", dest);
			const readme = await readFile(join(dest, "readme.txt"), "utf-8");
			expect(readme).toBe("this file was inside the tarball");
		});

		test("throws when response is HTML (virus-scan interstitial)", async () => {
			await expect(gdriveProvider.download("gdrive:virus-scan", dest)).rejects.toThrow(
				"virus scan",
			);
		});

		test("throws on bad file ID", async () => {
			await expect(gdriveProvider.download("gdrive:nonexistent", dest)).rejects.toThrow(
				"Google Drive download failed",
			);
		});

		test("throws on empty file ID", async () => {
			await expect(gdriveProvider.download("gdrive:", dest)).rejects.toThrow(
				"Missing Google Drive file ID",
			);
		});
	});
});
