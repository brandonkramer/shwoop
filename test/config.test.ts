import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, access, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig, removeExcluded } from "../src/config.ts";

function writeConfig(dir: string, config: object) {
	return writeFile(join(dir, "shwoop.json"), JSON.stringify(config));
}

describe("loadConfig", () => {
	let tmp: string;

	beforeEach(async () => {
		tmp = await mkdtemp(join(tmpdir(), "shwoop-test-config-"));
	});

	afterEach(async () => {
		await rm(tmp, { recursive: true, force: true });
	});

	test("returns CLI vars when no shwoop.json exists", async () => {
		const result = await loadConfig(tmp, { NAME: "gravel" });
		expect(result.vars).toEqual({ NAME: "gravel" });
		expect(result.exclude).toEqual([]);
		expect(result.postShwoop).toBeNull();
	});

	// Structured format
	test("loads structured config with defaults", async () => {
		await writeConfig(tmp, { vars: { MOOD: "pensive", FONT: "comic-sans" } });
		const result = await loadConfig(tmp, {});
		expect(result.vars).toEqual({ MOOD: "pensive", FONT: "comic-sans" });
	});

	test("CLI args override structured defaults", async () => {
		await writeConfig(tmp, { vars: { MOOD: "pensive", FONT: "comic-sans" } });
		const result = await loadConfig(tmp, { FONT: "papyrus" });
		expect(result.vars).toEqual({ MOOD: "pensive", FONT: "papyrus" });
	});

	test("treats empty string as required", async () => {
		await writeConfig(tmp, { vars: { NAME: "", HABITAT: "warehouse" } });
		const result = await loadConfig(tmp, { NAME: "keith" });
		expect(result.vars).toEqual({ NAME: "keith", HABITAT: "warehouse" });
	});

	test("treats null as required", async () => {
		await writeConfig(tmp, { vars: { NAME: null, HABITAT: "warehouse" } });
		const result = await loadConfig(tmp, { NAME: "keith" });
		expect(result.vars).toEqual({ NAME: "keith", HABITAT: "warehouse" });
	});

	test("errors when required variable is missing", async () => {
		await writeConfig(tmp, { vars: { NAME: "" } });
		expect(loadConfig(tmp, {})).rejects.toThrow("Missing required variable: NAME");
	});

	// Choice variables
	test("accepts valid choice value", async () => {
		await writeConfig(tmp, { vars: { FONT: ["helvetica", "comic-sans", "papyrus"] } });
		const result = await loadConfig(tmp, { FONT: "comic-sans" });
		expect(result.vars.FONT).toBe("comic-sans");
	});

	test("uses first choice as default", async () => {
		await writeConfig(tmp, { vars: { FONT: ["helvetica", "comic-sans", "papyrus"] } });
		const result = await loadConfig(tmp, {});
		expect(result.vars.FONT).toBe("helvetica");
	});

	test("errors on invalid choice value", async () => {
		await writeConfig(tmp, { vars: { FONT: ["helvetica", "comic-sans"] } });
		expect(loadConfig(tmp, { FONT: "wingdings" })).rejects.toThrow("must be one of");
	});

	test("required choice with empty first element", async () => {
		await writeConfig(tmp, { vars: { DB: ["", "postgres", "sqlite", "a-spreadsheet"] } });
		expect(loadConfig(tmp, {})).rejects.toThrow("Missing required variable: DB");
	});

	test("required choice accepts valid value", async () => {
		await writeConfig(tmp, { vars: { DB: ["", "postgres", "sqlite", "a-spreadsheet"] } });
		const result = await loadConfig(tmp, { DB: "a-spreadsheet" });
		expect(result.vars.DB).toBe("a-spreadsheet");
	});

	test("required choice rejects empty string", async () => {
		await writeConfig(tmp, { vars: { DB: ["", "postgres", "sqlite"] } });
		expect(loadConfig(tmp, { DB: "" })).rejects.toThrow("must be one of");
	});

	// Pattern validation
	test("accepts value matching pattern", async () => {
		await writeConfig(tmp, { vars: { SLUG: { default: "", pattern: "^[a-z][a-z0-9-]*$" } } });
		const result = await loadConfig(tmp, { SLUG: "greg-2" });
		expect(result.vars.SLUG).toBe("greg-2");
	});

	test("errors on value not matching pattern", async () => {
		await writeConfig(tmp, { vars: { SLUG: { default: "", pattern: "^[a-z][a-z0-9-]*$" } } });
		expect(loadConfig(tmp, { SLUG: "No Thank You" })).rejects.toThrow("does not match pattern");
	});

	test("uses pattern default when CLI not provided", async () => {
		await writeConfig(tmp, { vars: { SLUG: { default: "plan-b", pattern: "^[a-z-]+$" } } });
		const result = await loadConfig(tmp, {});
		expect(result.vars.SLUG).toBe("plan-b");
	});

	test("errors when pattern var required and missing", async () => {
		await writeConfig(tmp, { vars: { SLUG: { default: "", pattern: "^[a-z]+$" } } });
		expect(loadConfig(tmp, {})).rejects.toThrow("Missing required variable: SLUG");
	});

	// Conditional file exclusion
	test("excludes files when variable not provided", async () => {
		await writeConfig(tmp, {
			vars: { NAME: "intern-project" },
			exclude: { DOCKER: ["Dockerfile", ".dockerignore"] },
		});
		const result = await loadConfig(tmp, { NAME: "intern-project" });
		expect(result.exclude).toEqual(["Dockerfile", ".dockerignore"]);
	});

	test("keeps files when variable is provided", async () => {
		await writeConfig(tmp, {
			vars: { NAME: "intern-project" },
			exclude: { DOCKER: ["Dockerfile"] },
		});
		const result = await loadConfig(tmp, { NAME: "intern-project", DOCKER: "true" });
		expect(result.exclude).toEqual([]);
	});

	test("excludes when variable is empty string", async () => {
		await writeConfig(tmp, {
			vars: {},
			exclude: { CI: [".github/"] },
		});
		const result = await loadConfig(tmp, { CI: "" });
		expect(result.exclude).toEqual([".github/"]);
	});

	test("excludes when variable is 'false'", async () => {
		await writeConfig(tmp, {
			vars: {},
			exclude: { CI: [".github/"] },
		});
		const result = await loadConfig(tmp, { CI: "false" });
		expect(result.exclude).toEqual([".github/"]);
	});

	// Post-scaffold hook
	test("returns postShwoop command", async () => {
		await writeConfig(tmp, { vars: {}, postShwoop: "echo 'all done, probably'" });
		const result = await loadConfig(tmp, {});
		expect(result.postShwoop).toBe("echo 'all done, probably'");
	});

	test("returns null when no postShwoop", async () => {
		await writeConfig(tmp, { vars: { NAME: "gerald" } });
		const result = await loadConfig(tmp, { NAME: "gerald" });
		expect(result.postShwoop).toBeNull();
	});

	// Config file cleanup
	test("removes shwoop.json from output", async () => {
		const configPath = join(tmp, "shwoop.json");
		await writeConfig(tmp, { vars: { HOST: "localhost" } });
		await loadConfig(tmp, {});
		expect(access(configPath)).rejects.toThrow();
	});

	// Legacy flat format
	test("supports legacy flat format", async () => {
		await writeConfig(tmp, { VILLAIN: "the-accountant", LAIR: "basement" });
		const result = await loadConfig(tmp, {});
		expect(result.vars).toEqual({ VILLAIN: "the-accountant", LAIR: "basement" });
	});

	test("CLI vars not in config are passed through", async () => {
		await writeConfig(tmp, { vars: { MOOD: "optimistic" } });
		const result = await loadConfig(tmp, { MOOD: "cautiously-optimistic", EXTRA: "napkins" });
		expect(result.vars).toEqual({ MOOD: "cautiously-optimistic", EXTRA: "napkins" });
	});
});

describe("removeExcluded", () => {
	let tmp: string;

	beforeEach(async () => {
		tmp = await mkdtemp(join(tmpdir(), "shwoop-test-exclude-"));
	});

	afterEach(async () => {
		await rm(tmp, { recursive: true, force: true });
	});

	test("removes files matching patterns", async () => {
		await writeFile(join(tmp, "Dockerfile"), "FROM node");
		await writeFile(join(tmp, "app.txt"), "contents under pressure");
		await removeExcluded(tmp, ["Dockerfile"]);
		expect(access(join(tmp, "Dockerfile"))).rejects.toThrow();
		await access(join(tmp, "app.txt")); // should not throw
	});

	test("removes directories matching patterns", async () => {
		await mkdir(join(tmp, ".github"), { recursive: true });
		await writeFile(join(tmp, ".github", "ci.yml"), "on: push");
		await writeFile(join(tmp, "app.txt"), "nothing suspicious here");
		await removeExcluded(tmp, [".github/**"]);
		await access(join(tmp, "app.txt")); // should not throw
	});

	test("does nothing with empty patterns", async () => {
		await writeFile(join(tmp, "app.txt"), "this file intentionally left alone");
		await removeExcluded(tmp, []);
		await access(join(tmp, "app.txt")); // should not throw
	});
});
