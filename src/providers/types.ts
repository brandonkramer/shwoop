export interface Provider {
	name: string;
	match: (source: string) => boolean;
	download: (source: string, dest: string) => Promise<void>;
}
