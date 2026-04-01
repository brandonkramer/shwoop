import { readFile, writeFile, rename, readdir } from "node:fs/promises";
import { join } from "node:path";

import { Glob } from "bun";
import { Eta, EtaParseError, EtaRuntimeError } from "eta";

const eta = new Eta({
	tags: ["{{", "}}"],
	autoEscape: false,
	autoTrim: [false, false],
	varName: "it",
	cache: false,
	rmWhitespace: false,
});

function isBinary(buffer: Buffer): boolean {
	const check = buffer.subarray(0, 512);
	return check.includes(0);
}

export async function replaceVariables(dest: string, vars: Record<string, string>): Promise<void> {
	const entries = Object.entries(vars);
	if (entries.length === 0) return;

	// Replace in file contents
	const glob = new Glob("**/*");
	for await (const path of glob.scan({ cwd: dest, dot: true, onlyFiles: true })) {
		const fullPath = `${dest}/${path}`;
		const buffer = await readFile(fullPath);

		if (isBinary(buffer)) continue;

		const content = buffer.toString("utf-8");

		// Use Eta for templates with logic (conditionals, loops)
		// Fall back to plain replaceAll for simple {{KEY}} patterns
		let result: string;
		// Plain {{KEY}} replacement always runs first
		result = content;
		for (const [key, value] of entries) {
			const placeholder = `{{${key}}}`;
			if (result.includes(placeholder)) {
				result = result.replaceAll(placeholder, () => value);
			}
		}

		// Eta runs second for files that originally contained advanced syntax
		// Check original content, not result — prevents user values from triggering Eta
		if (hasEtaSyntax(content)) {
			try {
				result = eta.renderString(result, vars);
			} catch (err) {
				if (err instanceof EtaParseError || err instanceof EtaRuntimeError) {
					throw new Error(`Template error in ${path}: ${err.message}`, { cause: err });
				}
				throw err;
			}
		}

		if (result !== content) {
			await writeFile(fullPath, result);
		}
	}

	// Replace in file and directory names (deepest first to avoid path issues)
	await renameRecursive(dest, entries);
}

function hasEtaSyntax(content: string): boolean {
	// Detect Eta-specific syntax:
	// {{= expr }}     — interpolation
	// {{~ expr }}     — raw output
	// {{ if/for/...   — JS execution blocks
	// {{ } }}         — closing blocks
	// {{ it.X.        — data access chains
	return /\{\{(?:=|~|\s*(?:if|for|each|include|layout)\b|\s*\}|\s*it\.)/.test(content);
}

async function renameRecursive(dir: string, entries: [string, string][]): Promise<void> {
	const items = await readdir(dir, { withFileTypes: true });

	// Process subdirectories first (depth-first)
	for (const item of items) {
		if (item.isDirectory()) {
			await renameRecursive(join(dir, item.name), entries);
		}
	}

	// Rename files and directories in this level
	for (const item of items) {
		let newName = item.name;
		for (const [key, value] of entries) {
			const placeholder = `{{${key}}}`;
			if (newName.includes(placeholder)) {
				newName = newName.replaceAll(placeholder, () => value);
			}
		}
		if (newName !== item.name) {
			await rename(join(dir, item.name), join(dir, newName));
		}
	}
}
