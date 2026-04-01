import { AwsClient } from "aws4fetch";

export async function hasCommand(name: string): Promise<boolean> {
	const proc = Bun.spawn(["which", name], { stdout: "pipe", stderr: "pipe" });
	return (await proc.exited) === 0;
}

export async function downloadWithAwsClient(
	url: string,
	localPath: string,
	opts?: { service?: string; region?: string },
): Promise<void> {
	const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
	const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
	if (!accessKeyId || !secretAccessKey) {
		throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables required");
	}

	const client = new AwsClient({
		accessKeyId,
		secretAccessKey,
		sessionToken: process.env.AWS_SESSION_TOKEN,
		service: opts?.service,
		region: opts?.region,
	});

	const res = await client.fetch(url);
	if (!res.ok) {
		throw new Error(`S3 download failed: ${res.status} ${res.statusText}`);
	}

	await Bun.write(localPath, res);
}
