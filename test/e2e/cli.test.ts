import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FIXTURES = join(import.meta.dir, "..", "fixtures", "sample");
const FIXTURES_CONFIG = join(import.meta.dir, "..", "fixtures", "sample-config");
const CLI = join(import.meta.dir, "..", "..", "src", "index.ts");

function run(args: string[]) {
	return Bun.spawn(["bun", "run", CLI, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
}

describe("CLI e2e", () => {
	let dest: string;

	beforeEach(async () => {
		dest = join(await mkdtemp(join(tmpdir(), "shwoop-e2e-")), "out");
	});

	afterEach(async () => {
		await rm(dest, { recursive: true, force: true });
	});

	test("file: provider + variable replacement", async () => {
		const proc = run([
			`file:${FIXTURES}`,
			dest,
			"NAME=Gazpacho",
			"AUTHOR=The Temps",
			"PATH=/opt/questionable",
		]);
		expect(await proc.exited).toBe(0);

		const readme = await readFile(join(dest, "readme.md"), "utf-8");
		expect(readme).toContain("# Gazpacho");
		expect(readme).toContain("Created by The Temps.");

		const config = await readFile(join(dest, "config.json"), "utf-8");
		const parsed = JSON.parse(config);
		expect(parsed.name).toBe("Gazpacho");
		expect(parsed.path).toBe("/opt/questionable");
	});

	test("download only — no variables, no config", async () => {
		const proc = run([`file:${FIXTURES}`, dest]);
		expect(await proc.exited).toBe(0);

		const readme = await readFile(join(dest, "readme.md"), "utf-8");
		expect(readme).toContain("{{NAME}}");
	});

	test("shwoop.json defaults are applied", async () => {
		const proc = run([`file:${FIXTURES_CONFIG}`, dest, "NAME=gerald"]);
		expect(await proc.exited).toBe(0);

		const app = await readFile(join(dest, "app.txt"), "utf-8");
		expect(app).toContain("name: gerald");
		expect(app).toContain("host: localhost");
		expect(app).toContain("port: 3000");
	});

	test("CLI args override shwoop.json defaults", async () => {
		const proc = run([`file:${FIXTURES_CONFIG}`, dest, "NAME=gerald", "PORT=1337"]);
		expect(await proc.exited).toBe(0);

		const app = await readFile(join(dest, "app.txt"), "utf-8");
		expect(app).toContain("port: 1337");
		expect(app).toContain("host: localhost");
	});

	test("shwoop.json is removed from output", async () => {
		const proc = run([`file:${FIXTURES_CONFIG}`, dest, "NAME=gerald"]);
		expect(await proc.exited).toBe(0);

		expect(access(join(dest, "shwoop.json"))).rejects.toThrow();
	});

	test("errors when required variable from shwoop.json is missing", async () => {
		const proc = run([`file:${FIXTURES_CONFIG}`, dest]);
		expect(await proc.exited).toBe(1);

		const stderr = await new Response(proc.stderr).text();
		expect(stderr).toContain("Missing required variable: NAME");
	});

	test("prints help with --help", async () => {
		const proc = run(["--help"]);
		expect(await proc.exited).toBe(0);

		const stdout = await new Response(proc.stdout).text();
		expect(stdout).toContain("shwoop");
		expect(stdout).toContain("Usage:");
	});

	test("exits with error on missing args", async () => {
		const proc = run([]);
		expect(await proc.exited).toBe(1);
	});

	test("exits with error on invalid variable format", async () => {
		const proc = run([`file:${FIXTURES}`, dest, "BADVAR"]);
		expect(await proc.exited).toBe(1);
	});
});
