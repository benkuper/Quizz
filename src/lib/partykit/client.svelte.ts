import PartySocket from 'partysocket';

export type QuizRole = 'player' | 'admin' | 'projector';

export const DEFAULT_QUIZ_ROOM = 'quiz-room-1';

const LOCAL_PARTYKIT_PORT = 1999;
const DEFAULT_REMOTE_PARTYKIT_HOST = 'quizz-party.benkuper.partykit.dev';

const USE_LOCAL_PARTYKIT = (() => {
	// Prefer explicit VITE flag when present (exposed to client by Vite)
	const envVal = (import.meta as any).env?.VITE_USE_LOCAL_PARTYKIT as string | undefined;
	if (typeof envVal === 'string') {
		console.log(`VITE_USE_LOCAL_PARTYKIT is set to "${envVal}", using that value`);
		return /^(1|true)$/i.test(envVal);
	}

	// For dev convenience: `npm run dev -- --localparty` is read in Vite config
	// and exposed to the browser as a compile-time constant.
	return typeof __LOCAL_PARTY__ === 'boolean' ? __LOCAL_PARTY__ : false;
})();

function normalizePartykitHost(input: string): string {
	const raw = input.trim();
	if (!raw) return raw;

	// Prefer URL parsing when a scheme is provided.
	try {
		const url = new URL(raw);
		return url.host;
	} catch {
		// ignore
	}

	// Accept host:port (or host) and also tolerate accidentally passing a scheme.
	return raw
		.replace(/^wss?:\/\//i, '')
		.replace(/^https?:\/\//i, '')
		.replace(/\s+/g, '')
		.replace(/\/.*$/, '');
}

export function resolvePartykitHost(): string {
	const override = (import.meta as any).env?.VITE_PARTYKIT_HOST as string | undefined;
	if (typeof override === 'string' && override.trim()) {
		return normalizePartykitHost(override);
	}

	// In dev, connect to the local PartyKit dev server on the same machine / LAN IP.
	if (import.meta.env.DEV && typeof location !== 'undefined' && location.hostname && USE_LOCAL_PARTYKIT) {
		// If the page is served over https://, browsers require wss:// for websockets.
		// PartyKit dev itself is ws://, so we connect to the Vite dev server and let it proxy.
		if (location.protocol === 'https:' && location.host) {
			return location.host;
		}
		return `${location.hostname}:${LOCAL_PARTYKIT_PORT}`;
	}

	// In prod (static site), default to the hosted PartyKit deployment.
	return DEFAULT_REMOTE_PARTYKIT_HOST;
}

export function createQuizSocket(options: { role?: QuizRole; room?: string } = {}): PartySocket {
	const role = options.role ?? 'player';
	const room = options.room ?? DEFAULT_QUIZ_ROOM;
	const query = role === 'player' ? undefined : { role };
	const protocol =
		typeof location !== 'undefined' && location.protocol === 'https:' ? ('wss' as const) : ('ws' as const);

	return new PartySocket({
		host: resolvePartykitHost(),
		protocol,
		room,
		...(query ? { query } : {})
	});
}

