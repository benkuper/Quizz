import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

function hasCliFlag(flag: string): boolean {
	const argv = process.argv ?? [];
	return argv.some((a) => a === flag || a.startsWith(`${flag}=`));
}

function readBooleanFlag(flag: string): boolean {
	const argv = process.argv ?? [];
	const exact = argv.includes(flag);
	if (exact) return true;

	const withValue = argv.find((a) => a.startsWith(`${flag}=`));
	if (!withValue) return false;
	const value = withValue.slice(`${flag}=`.length);
	return /^(1|true)$/i.test(value);
}

export default defineConfig(() => {
	// Allows: `npm run dev -- --localparty` or `npm run dev -- --localparty=true`
	// We intentionally do this in Vite config (Node context), not in browser code.
	const localparty = hasCliFlag('--localparty') ? readBooleanFlag('--localparty') : false;

	return {
		plugins: [tailwindcss(), sveltekit()],
		define: {
			__LOCAL_PARTY__: JSON.stringify(localparty)
		}
	};
});
