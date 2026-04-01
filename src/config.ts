import { readFile, unlink, rm } from "node:fs/promises";
import { join } from "node:path";

import { Glob } from "bun";

import {
	isTTY,
	promptText,
	promptTextWithDefault,
	promptChoice,
	promptValidated,
} from "./prompt.ts";

const CONFIG_FILE = "shwoop.json";

type VarDef = string | null | string[] | { default: string; pattern: string };

interface RawConfig {
	vars?: Record<string, VarDef>;
	exclude?: Record<string, string[]>;
	postShwoop?: string;
	// Legacy flat format: top-level keys are vars
	[key: string]: unknown;
}

export interface Config {
	vars: Record<string, string>;
	exclude: string[];
	postShwoop: string | null;
}

function isStructured(raw: RawConfig): boolean {
	return "vars" in raw && typeof raw.vars === "object" && raw.vars !== null;
}

async function parseVarDefs(
	defs: Record<string, VarDef>,
	cliVars: Record<string, string>,
): Promise<Record<string, string>> {
	const merged: Record<string, string> = {};
	const errors: string[] = [];
	const interactive = isTTY();

	for (const [key, def] of Object.entries(defs)) {
		const cliVal = cliVars[key];

		if (Array.isArray(def)) {
			const choices = def as string[];
			const isRequired = choices[0] === "";
			const validChoices = isRequired ? choices.slice(1) : choices;
			if (cliVal !== undefined) {
				if (!validChoices.includes(cliVal)) {
					errors.push(`${key} must be one of: ${validChoices.join(", ")} (got "${cliVal}")`);
					continue;
				}
				merged[key] = cliVal;
			} else if (isRequired) {
				if (interactive) {
					merged[key] = await promptChoice(key, choices.slice(1));
				} else {
					errors.push(
						`Missing required variable: ${key} (choose from: ${choices.slice(1).join(", ")})`,
					);
				}
			} else {
				if (interactive) {
					merged[key] = await promptChoice(key, choices);
				} else {
					merged[key] = choices[0]!;
				}
			}
		} else if (typeof def === "object" && def !== null && "pattern" in def) {
			const val = cliVal ?? def.default;
			if (!val) {
				if (interactive) {
					merged[key] = await promptValidated(key, def.pattern);
				} else {
					errors.push(`Missing required variable: ${key}`);
				}
				continue;
			}
			if (!new RegExp(def.pattern).test(val)) {
				errors.push(`${key} does not match pattern ${def.pattern} (got "${val}")`);
				continue;
			}
			merged[key] = val;
		} else if (def === "" || def === null) {
			if (cliVal === undefined) {
				if (interactive) {
					merged[key] = await promptText(key);
				} else {
					errors.push(`Missing required variable: ${key}`);
				}
			} else {
				merged[key] = cliVal;
			}
		} else {
			if (cliVal !== undefined) {
				merged[key] = cliVal;
			} else if (interactive) {
				merged[key] = await promptTextWithDefault(key, def as string);
			} else {
				merged[key] = def as string;
			}
		}
	}

	if (errors.length > 0) {
		throw new Error(errors.join("\n"));
	}

	// Add CLI vars not defined in config
	for (const [key, value] of Object.entries(cliVars)) {
		if (!(key in merged)) {
			merged[key] = value;
		}
	}

	return merged;
}

function resolveExcludes(
	excludeMap: Record<string, string[]>,
	vars: Record<string, string>,
): string[] {
	const toExclude: string[] = [];
	for (const [varName, paths] of Object.entries(excludeMap)) {
		if (!(varName in vars) || vars[varName] === "" || vars[varName] === "false") {
			toExclude.push(...paths);
		}
	}
	return toExclude;
}

export async function removeExcluded(dest: string, patterns: string[]): Promise<void> {
	if (patterns.length === 0) return;

	for (const pattern of patterns) {
		const glob = new Glob(pattern);
		for await (const path of glob.scan({ cwd: dest, dot: true })) {
			await rm(join(dest, path), { recursive: true, force: true });
		}
	}
}

export async function loadConfig(dest: string, cliVars: Record<string, string>): Promise<Config> {
	const configPath = join(dest, CONFIG_FILE);

	let raw: RawConfig;
	try {
		const content = await readFile(configPath, "utf-8");
		raw = JSON.parse(content);
	} catch {
		return { vars: cliVars, exclude: [], postShwoop: null };
	}

	let vars: Record<string, string>;
	let exclude: string[] = [];
	let postShwoop: string | null = null;

	if (isStructured(raw)) {
		vars = await parseVarDefs(raw.vars as Record<string, VarDef>, cliVars);
		if (raw.exclude) {
			exclude = resolveExcludes(raw.exclude, vars);
		}
		postShwoop = (raw.postShwoop as string) ?? null;
	} else {
		// Legacy flat format
		const legacyDefs: Record<string, VarDef> = {};
		for (const [key, value] of Object.entries(raw)) {
			legacyDefs[key] = value as VarDef;
		}
		vars = await parseVarDefs(legacyDefs, cliVars);
	}

	await unlink(configPath);

	return { vars, exclude, postShwoop };
}
