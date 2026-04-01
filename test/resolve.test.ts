import { describe, expect, test } from "bun:test";

import { resolveProvider } from "../src/resolve.ts";

describe("resolveProvider", () => {
	test("resolves gh: to giget", () => {
		expect(resolveProvider("gh:jeff/cold-soup").name).toBe("giget");
	});

	test("resolves gl: to giget", () => {
		expect(resolveProvider("gl:dept-of-birds/registry").name).toBe("giget");
	});

	test("resolves bb: to giget", () => {
		expect(resolveProvider("bb:municipal/lamp-database").name).toBe("giget");
	});

	test("resolves file: to file", () => {
		expect(resolveProvider("file:./shed").name).toBe("file");
	});

	test("resolves npm: to npm", () => {
		expect(resolveProvider("npm:@disputed/toast").name).toBe("npm");
	});

	test("resolves s3: to s3", () => {
		expect(resolveProvider("s3:receipts-2019/templates").name).toBe("s3");
	});

	test("resolves r2: to s3", () => {
		expect(resolveProvider("r2:divorce-lawyers/assets").name).toBe("s3");
	});

	test("resolves gs: to gcs", () => {
		expect(resolveProvider("gs:lost-and-found/misc").name).toBe("gcs");
	});

	test("resolves gdrive: to gdrive", () => {
		expect(resolveProvider("gdrive:grandma_wifi_password").name).toBe("gdrive");
	});

	test("resolves https:// to http", () => {
		expect(resolveProvider("https://example.com/disputed-invoice.tar.gz").name).toBe("http");
	});

	test("resolves http:// to http", () => {
		expect(resolveProvider("http://example.com/sourdough-starter.tar.gz").name).toBe("http");
	});

	test("throws on unknown source", () => {
		expect(() => resolveProvider("ftp:the-audacity")).toThrow("No provider found");
	});
});
