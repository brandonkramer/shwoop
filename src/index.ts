#!/usr/bin/env bun
import { loadConfig, removeExcluded } from "./config.ts";
import { replaceVariables } from "./replace.ts";
import { resolveProvider } from "./resolve.ts";

function parseArgs(argv: string[]): {
	source: string;
	dest: string;
	vars: Record<string, string>;
} {
	const args = argv.slice(2);

	if (args.length < 2 || args.includes("--help") || args.includes("-h")) {
		console.log(`shwoop - Download templates from anywhere + replace {{KEY}} variables

Usage: npx shwoop <source> <dest> [KEY=value ...]

Sources:
  gh:user/repo/subdir     GitHub
  gl:user/repo/subdir     GitLab
  bb:user/repo/subdir     Bitbucket
  npm:@scope/package      npm registry
  s3:bucket/path          AWS S3
  r2:bucket/path          Cloudflare R2 (set R2_ENDPOINT)
  gs:bucket/path          Google Cloud Storage
  gdrive:<file-id>        Google Drive (public)
  https://url.tar.gz      Any URL (tarball/zip)
  file:./local/path       Local filesystem

If a shwoop.json defines required variables and none are passed,
you'll be prompted interactively (TTY only, silent in CI/pipes).

Examples:
  npx shwoop gh:user/repo/templates/app ./my-app NAME=cool-app
  npx shwoop file:./templates/skill ~/.claude/skills/log VAULT=/path
  npx shwoop s3:my-bucket/template.tar.gz ./out ENV=prod`);
		process.exit(args.includes("--help") || args.includes("-h") ? 0 : 1);
	}

	const [source, dest, ...rest] = args;
	const vars: Record<string, string> = {};

	for (const arg of rest) {
		const eq = arg.indexOf("=");
		if (eq === -1) {
			console.error(`Invalid variable: ${arg} (expected KEY=value)`);
			process.exit(1);
		}
		vars[arg.slice(0, eq)] = arg.slice(eq + 1);
	}

	return { source: source!, dest: dest!, vars };
}

async function main(): Promise<void> {
	const { source, dest, vars } = parseArgs(process.argv);

	const provider = resolveProvider(source);
	console.log(`Downloading from ${provider.name}...`);
	await provider.download(source, dest);

	const config = await loadConfig(dest, vars);

	if (config.exclude.length > 0) {
		await removeExcluded(dest, config.exclude);
	}

	if (Object.keys(config.vars).length > 0) {
		console.log(`Replacing ${Object.keys(config.vars).length} variable(s)...`);
		await replaceVariables(dest, config.vars);
	}

	if (config.postScaffold) {
		console.log(`Running: ${config.postScaffold}`);
		const proc = Bun.spawn(["sh", "-c", config.postScaffold], {
			cwd: dest,
			stdout: "inherit",
			stderr: "inherit",
		});
		const code = await proc.exited;
		if (code !== 0) {
			throw new Error(`postScaffold command failed with exit code ${code}`);
		}
	}

	console.log(`Done → ${dest}`);
}

main().catch((err) => {
	console.error(err.message);
	process.exit(1);
});
