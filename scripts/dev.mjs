import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function parseLocalpartyFlag(argv) {
	let enabled = false;
	const forwarded = [];

	for (const arg of argv) {
		if (arg === '--localparty') {
			enabled = true;
			continue;
		}

		if (arg.startsWith('--localparty=')) {
			const value = arg.slice('--localparty='.length);
			enabled = /^(1|true)$/i.test(value);
			continue;
		}

		forwarded.push(arg);
	}

	return { enabled, forwarded };
}

const { enabled: useLocalParty, forwarded } = parseLocalpartyFlag(process.argv.slice(2));

const env = { ...process.env };
if (useLocalParty) {
	// Vite only exposes env vars with the VITE_ prefix to browser code.
	env.VITE_USE_LOCAL_PARTYKIT = 'true';
	// eslint-disable-next-line no-console
	console.log('[dev] --localparty enabled -> VITE_USE_LOCAL_PARTYKIT=true');
}

// Run `vite` via PATH (npm scripts include node_modules/.bin). Using `shell: true`
// avoids Windows EINVAL issues when invoking shim executables.
const child = spawn('vite', ['dev', '--host', '0.0.0.0', ...forwarded], {
	cwd: root,
	env,
	stdio: 'inherit',
	shell: true
});

child.on('exit', (code, signal) => {
	process.exitCode = code ?? (signal ? 1 : 0);
});
