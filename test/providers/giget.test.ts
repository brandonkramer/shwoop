import { describe, expect, test } from "bun:test";

import { gigetProvider } from "../../src/providers/giget.ts";

describe("gigetProvider", () => {
	test("matches gh: prefix", () => {
		expect(gigetProvider.match("gh:jeff/cold-soup")).toBe(true);
	});

	test("matches gl: prefix", () => {
		expect(gigetProvider.match("gl:dept-of-birds/registry")).toBe(true);
	});

	test("matches bb: prefix", () => {
		expect(gigetProvider.match("bb:municipal/lamp-database")).toBe(true);
	});

	test("does not match other prefixes", () => {
		expect(gigetProvider.match("npm:@disputed/toast")).toBe(false);
		expect(gigetProvider.match("s3:receipts-2019")).toBe(false);
		expect(gigetProvider.match("https://example.com")).toBe(false);
	});
});
