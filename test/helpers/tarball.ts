import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Creates a .tar.gz containing a couple test files.
 * Returns the path to the tarball.
 */
export async function createTestTarball(): Promise<string> {
	const src = await mkdtemp(join(tmpdir(), "shwoop-tarball-src-"));
	await writeFile(join(src, "readme.txt"), "this file was inside the tarball");
	await mkdir(join(src, "sub"), { recursive: true });
	await writeFile(join(src, "sub", "nested.txt"), "still here");

	const tarball = join(src, "archive.tar.gz");
	const proc = Bun.spawn(["tar", "-czf", tarball, "-C", src, "readme.txt", "sub"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const exit = await proc.exited;
	if (exit !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`failed to create test tarball: ${stderr}`);
	}
	return tarball;
}

/**
 * Creates a .tar.gz large enough to trigger Bun.write streaming issues (~2MB).
 * Contains a marker file and a padding file filled with random bytes.
 */
export async function createLargeTarball(): Promise<string> {
	const src = await mkdtemp(join(tmpdir(), "shwoop-large-src-"));
	await writeFile(join(src, "marker.txt"), "large tarball marker");
	// 2MB of random data — enough to expose streaming write bugs
	const padding = Buffer.alloc(2 * 1024 * 1024, 0x42);
	await writeFile(join(src, "padding.bin"), padding);

	const tarball = join(src, "large.tar.gz");
	const proc = Bun.spawn(["tar", "-czf", tarball, "-C", src, "marker.txt", "padding.bin"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const exit = await proc.exited;
	if (exit !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`failed to create large test tarball: ${stderr}`);
	}
	return tarball;
}

/**
 * Creates a .tar.gz that mimics `npm pack` output (files inside a `package/` dir).
 * Returns the path to the tarball and its filename.
 */
export async function createNpmTarball(): Promise<{ path: string; filename: string }> {
	const src = await mkdtemp(join(tmpdir(), "shwoop-npm-src-"));
	const pkg = join(src, "package");
	await mkdir(pkg, { recursive: true });
	await writeFile(join(pkg, "index.js"), "module.exports = 'placeholder'");
	await writeFile(join(pkg, "readme.txt"), "npm package contents");

	const filename = "disputed-toast-1.0.0.tgz";
	const tarball = join(src, filename);
	const proc = Bun.spawn(["tar", "-czf", tarball, "-C", src, "package"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const exit = await proc.exited;
	if (exit !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`failed to create npm test tarball: ${stderr}`);
	}
	return { path: tarball, filename };
}
