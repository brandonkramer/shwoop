import { fileProvider } from "./providers/file.ts";
import { gcsProvider } from "./providers/gcs.ts";
import { gdriveProvider } from "./providers/gdrive.ts";
import { gigetProvider } from "./providers/giget.ts";
import { httpProvider } from "./providers/http.ts";
import { npmProvider } from "./providers/npm.ts";
import { s3Provider } from "./providers/s3.ts";
import type { Provider } from "./providers/types.ts";

const providers: Provider[] = [
	gigetProvider,
	fileProvider,
	npmProvider,
	s3Provider,
	gcsProvider,
	gdriveProvider,
	httpProvider, // must be last -- matches any http(s) URL
];

export function resolveProvider(source: string): Provider {
	const provider = providers.find((p) => p.match(source));
	if (!provider) {
		throw new Error(
			`No provider found for source: ${source}\n` +
				"Supported prefixes: gh: gl: bb: npm: s3: r2: gs: gdrive: http:// https:// file:",
		);
	}
	return provider;
}
