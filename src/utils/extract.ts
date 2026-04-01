import { mkdir } from "node:fs/promises";

export async function extractTarball(
	tarball: string,
	dest: string,
	opts?: { stripComponents?: number },
): Promise<void> {
	await mkdir(dest, { recursive: true });
	const args = ["tar", "-xf", tarball, "-C", dest];
	if (opts?.stripComponents) {
		args.push(`--strip-components=${opts.stripComponents}`);
	}
	const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`tar extraction failed: ${stderr}`);
	}
}

export async function extractZip(zip: string, dest: string): Promise<void> {
	await mkdir(dest, { recursive: true });
	const proc = Bun.spawn(["unzip", "-o", zip, "-d", dest], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`unzip extraction failed: ${stderr}`);
	}
}

export async function extractArchive(file: string, dest: string): Promise<void> {
	if (file.endsWith(".zip")) {
		await extractZip(file, dest);
	} else {
		await extractTarball(file, dest);
	}
}
