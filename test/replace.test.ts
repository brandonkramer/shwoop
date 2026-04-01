import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, readFile, mkdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { replaceVariables } from "../src/replace.ts";

describe("replaceVariables", () => {
	let tmp: string;

	beforeEach(async () => {
		tmp = await mkdtemp(join(tmpdir(), "shwoop-test-replace-"));
	});

	afterEach(async () => {
		await rm(tmp, { recursive: true, force: true });
	});

	test("replaces {{KEY}} in file content", async () => {
		await writeFile(join(tmp, "file.txt"), "Hello {{NAME}}, welcome to {{PLACE}}.");
		await replaceVariables(tmp, { NAME: "Gerald", PLACE: "a Wendy's parking lot" });
		const result = await readFile(join(tmp, "file.txt"), "utf-8");
		expect(result).toBe("Hello Gerald, welcome to a Wendy's parking lot.");
	});

	test("replaces multiple occurrences of same key", async () => {
		await writeFile(join(tmp, "file.txt"), "{{X}} and {{X}} again");
		await replaceVariables(tmp, { X: "reportedly" });
		const result = await readFile(join(tmp, "file.txt"), "utf-8");
		expect(result).toBe("reportedly and reportedly again");
	});

	test("leaves files unchanged when no variables match", async () => {
		const original = "a walrus cannot operate a forklift";
		await writeFile(join(tmp, "file.txt"), original);
		await replaceVariables(tmp, { NAME: "irrelevant" });
		const result = await readFile(join(tmp, "file.txt"), "utf-8");
		expect(result).toBe(original);
	});

	test("handles empty vars gracefully", async () => {
		const original = "{{NAME}} stays";
		await writeFile(join(tmp, "file.txt"), original);
		await replaceVariables(tmp, {});
		const result = await readFile(join(tmp, "file.txt"), "utf-8");
		expect(result).toBe(original);
	});

	test("skips binary files", async () => {
		const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]);
		await writeFile(join(tmp, "image.png"), binary);
		await replaceVariables(tmp, { NAME: "test" });
		const result = await readFile(join(tmp, "image.png"));
		expect(result).toEqual(binary);
	});

	test("processes files in subdirectories", async () => {
		await mkdir(join(tmp, "sub"), { recursive: true });
		await writeFile(join(tmp, "sub", "deep.txt"), "deep {{VAL}}");
		await replaceVariables(tmp, { VAL: "fried existential dread" });
		const result = await readFile(join(tmp, "sub", "deep.txt"), "utf-8");
		expect(result).toBe("deep fried existential dread");
	});

	test("handles dotfiles", async () => {
		await writeFile(join(tmp, ".env"), "KEY={{SECRET}}");
		await replaceVariables(tmp, { SECRET: "pickles-on-pizza" });
		const result = await readFile(join(tmp, ".env"), "utf-8");
		expect(result).toBe("KEY=pickles-on-pizza");
	});

	test("handles dollar sign tokens in replacement values", async () => {
		await writeFile(join(tmp, "file.txt"), "msg: {{MSG}}");
		await replaceVariables(tmp, { MSG: "price is $& and $50" });
		const result = await readFile(join(tmp, "file.txt"), "utf-8");
		expect(result).toBe("msg: price is $& and $50");
	});

	test("handles Eta conditionals", async () => {
		await writeFile(
			join(tmp, "file.txt"),
			"{{ if(it.DOCKER) { }}FROM node\n{{ } }}app: {{= it.NAME }}",
		);
		await replaceVariables(tmp, { DOCKER: "true", NAME: "my-app" });
		const result = await readFile(join(tmp, "file.txt"), "utf-8");
		expect(result).toContain("FROM node");
		expect(result).toContain("app: my-app");
	});

	test("Eta conditional excludes block when falsy", async () => {
		await writeFile(join(tmp, "file.txt"), "start\n{{ if(it.CI) { }}ci: true\n{{ } }}end");
		await replaceVariables(tmp, { CI: "" });
		const result = await readFile(join(tmp, "file.txt"), "utf-8");
		expect(result).not.toContain("ci: true");
		expect(result).toContain("start");
		expect(result).toContain("end");
	});

	test("handles Eta loops", async () => {
		await writeFile(
			join(tmp, "file.txt"),
			'{{ it.ITEMS.split(",").forEach(function(item) { }}  - {{= item }}\n{{ }) }}',
		);
		await replaceVariables(tmp, { ITEMS: "one,two,three" });
		const result = await readFile(join(tmp, "file.txt"), "utf-8");
		expect(result).toContain("- one");
		expect(result).toContain("- two");
		expect(result).toContain("- three");
	});

	test("Eta passes special chars through (autoEscape: false)", async () => {
		await writeFile(join(tmp, "file.txt"), "{{= it.VAL }}");
		await replaceVariables(tmp, { VAL: "<b>&</b>" });
		const result = await readFile(join(tmp, "file.txt"), "utf-8");
		expect(result).toBe("<b>&</b>");
	});

	test("Eta handles null and undefined values", async () => {
		await writeFile(join(tmp, "file.txt"), "{{= it.X }} {{= it.Y }}");
		await replaceVariables(tmp, { X: "ok" } as any);
		const result = await readFile(join(tmp, "file.txt"), "utf-8");
		expect(result).toContain("ok");
		expect(result).toContain("undefined");
	});

	test("Eta ternary inline expression", async () => {
		await writeFile(
			join(tmp, "file.txt"),
			'{{= it.ENV === "prod" ? "production" : "development" }}',
		);
		await replaceVariables(tmp, { ENV: "prod" });
		const result = await readFile(join(tmp, "file.txt"), "utf-8");
		expect(result).toBe("production");
	});

	test("Eta template error produces helpful message", async () => {
		await writeFile(join(tmp, "file.txt"), "{{= it.X");
		expect(replaceVariables(tmp, { X: "test" })).rejects.toThrow("Template error");
	});

	test("mixed {{KEY}} and Eta syntax in same file", async () => {
		await writeFile(
			join(tmp, "file.txt"),
			"app: {{NAME}}\n{{ if(it.DOCKER) { }}FROM node\n{{ } }}port: {{PORT}}",
		);
		await replaceVariables(tmp, { NAME: "my-app", DOCKER: "true", PORT: "3000" });
		const result = await readFile(join(tmp, "file.txt"), "utf-8");
		expect(result).toContain("app: my-app");
		expect(result).toContain("FROM node");
		expect(result).toContain("port: 3000");
	});

	test("plain {{KEY}} still works without Eta syntax", async () => {
		await writeFile(join(tmp, "file.txt"), "Hello {{NAME}}!");
		await replaceVariables(tmp, { NAME: "world" });
		const result = await readFile(join(tmp, "file.txt"), "utf-8");
		expect(result).toBe("Hello world!");
	});

	test("renames files with {{KEY}} in name", async () => {
		await writeFile(join(tmp, "{{NAME}}.txt"), "content");
		await replaceVariables(tmp, { NAME: "plan-b" });
		const result = await readFile(join(tmp, "plan-b.txt"), "utf-8");
		expect(result).toBe("content");
		expect(access(join(tmp, "{{NAME}}.txt"))).rejects.toThrow();
	});

	test("renames directories with {{KEY}} in name", async () => {
		await mkdir(join(tmp, "{{NAME}}"), { recursive: true });
		await writeFile(join(tmp, "{{NAME}}", "file.txt"), "classified");
		await replaceVariables(tmp, { NAME: "the-incident" });
		const result = await readFile(join(tmp, "the-incident", "file.txt"), "utf-8");
		expect(result).toBe("classified");
		expect(access(join(tmp, "{{NAME}}"))).rejects.toThrow();
	});

	test("renames nested dirs and files together", async () => {
		await mkdir(join(tmp, "{{PKG}}"), { recursive: true });
		await writeFile(join(tmp, "{{PKG}}", "{{PKG}}.config.ts"), "name = '{{PKG}}'");
		await replaceVariables(tmp, { PKG: "oops" });
		const result = await readFile(join(tmp, "oops", "oops.config.ts"), "utf-8");
		expect(result).toBe("name = 'oops'");
	});

	test("variable value containing Eta syntax does not trigger Eta on simple template", async () => {
		await writeFile(join(tmp, "file.txt"), "app: {{NAME}}");
		await replaceVariables(tmp, { NAME: "{{= process.exit(1) }}" });
		const result = await readFile(join(tmp, "file.txt"), "utf-8");
		expect(result).toBe("app: {{= process.exit(1) }}");
	});

	test("handles $ special patterns in filename renames", async () => {
		await writeFile(join(tmp, "{{NAME}}.txt"), "content");
		await replaceVariables(tmp, { NAME: "price-$&-tag" });
		const result = await readFile(join(tmp, "price-$&-tag.txt"), "utf-8");
		expect(result).toBe("content");
	});
});
