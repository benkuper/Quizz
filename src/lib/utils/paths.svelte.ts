let cachedBasePath: string | null = null;

export function getAppBasePathFromScripts(options: { appMarker?: string } = {}): string {
	if (cachedBasePath !== null) return cachedBasePath;

	const appMarker = options.appMarker ?? '/_app/';

	if (typeof document === 'undefined' || typeof location === 'undefined') {
		cachedBasePath = '';
		return cachedBasePath;
	}

	try {
		const scripts = Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[];
		for (const s of scripts) {
			const raw = s.getAttribute('src');
			if (!raw) continue;
			const url = new URL(raw, location.href);
			const p = url.pathname;
			const idx = p.lastIndexOf(appMarker);
			if (idx >= 0) {
				cachedBasePath = p.slice(0, idx);
				return cachedBasePath;
			}
		}
	} catch {
		// ignore
	}

	cachedBasePath = '';
	return cachedBasePath;
}

export function resetCachedAppBasePathForTests() {
	cachedBasePath = null;
}

function isAbsoluteLikeUrl(src: string) {
	return (
		src.startsWith('http://') ||
		src.startsWith('https://') ||
		src.startsWith('data:') ||
		src.startsWith('blob:')
	);
}

// Resolve an asset URL in a way that works even when the app is deployed under an arbitrary subfolder.
//
// - Absolute URLs (http/https/data/blob) are returned unchanged.
// - Paths starting with `/` are prefixed with the inferred app base path.
// - Relative paths are resolved against `${basePath}/`.
export function resolveAppAssetUrl(src: string): string {
	const trimmed = src.trim();
	if (!trimmed) return '';
	if (isAbsoluteLikeUrl(trimmed)) return trimmed;

	if (typeof location === 'undefined') return trimmed;

	const basePath = getAppBasePathFromScripts();

	if (trimmed.startsWith('/')) return `${basePath}${trimmed}`;

	try {
		const base = new URL(`${basePath || ''}/`, location.origin);
		return new URL(trimmed, base).toString();
	} catch {
		return trimmed;
	}
}
