import * as readline from "node:readline";

const rl = () => readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
	const iface = rl();
	return new Promise((resolve) => {
		iface.question(question, (answer) => {
			iface.close();
			resolve(answer.trim());
		});
	});
}

export function isTTY(): boolean {
	return process.stdin.isTTY === true;
}

export async function promptText(key: string): Promise<string> {
	while (true) {
		const value = await ask(`? ${key}: `);
		if (value) return value;
	}
}

export async function promptTextWithDefault(key: string, defaultVal: string): Promise<string> {
	const value = await ask(`? ${key} (${defaultVal}): `);
	return value || defaultVal;
}

export async function promptChoice(key: string, choices: string[]): Promise<string> {
	console.log(`? ${key}:`);
	for (let i = 0; i < choices.length; i++) {
		console.log(`  ${i + 1}) ${choices[i]}`);
	}
	while (true) {
		const input = await ask(`  Choose (1-${choices.length}): `);
		const idx = Number.parseInt(input, 10) - 1;
		if (idx >= 0 && idx < choices.length) return choices[idx]!;
		// Also accept the value directly
		if (choices.includes(input)) return input;
	}
}

export async function promptValidated(key: string, pattern: string): Promise<string> {
	const re = new RegExp(pattern);
	while (true) {
		const value = await ask(`? ${key} (pattern: ${pattern}): `);
		if (value && re.test(value)) return value;
		if (value) console.log(`  Does not match ${pattern}, try again.`);
	}
}
