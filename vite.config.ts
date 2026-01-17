import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

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
	const httpsDev = /^(1|true)$/i.test(process.env.VITE_HTTPS_DEV ?? '');

	return {
		plugins: [tailwindcss(), sveltekit(), ...(httpsDev ? [mkcert()] : [])],
		define: {
			__LOCAL_PARTY__: JSON.stringify(localparty)
		},
		server: httpsDev
			? {
				https: {},
				// sensors often need HTTPS and LAN access for phone testing
				host: '0.0.0.0',
				// When the page is served over https://, browsers require wss:// for websockets.
				// PartyKit dev is ws:// only, so we terminate TLS at Vite and proxy the WS upgrade.
				proxy: {
					'/parties': {
						target: 'ws://localhost:1999',
						ws: true,
						changeOrigin: true
					}
				}
			}
			: undefined
	};
});
