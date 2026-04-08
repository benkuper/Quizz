import { browser } from '$app/environment';
import { base as configuredBase } from '$app/paths';

let cachedBasePath: string | null = null;

function normalizeBasePath(value: string): string {
	const trimmed = value.trim();
	if (!trimmed || trimmed === '/') return '';
	if (trimmed === '.' || trimmed === '..') return trimmed;
	return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function defaultBasePathForCurrentRender() {
	const normalizedConfiguredBase = normalizeBasePath(configuredBase);
	if (normalizedConfiguredBase) return normalizedConfiguredBase;
	return browser ? '' : '.';
}

function joinBasePath(basePath: string, target: string): string {
	const cleanTarget = target.replace(/^\/+/, '');
	const normalizedBase = normalizeBasePath(basePath);

	if (!cleanTarget) {
		if (!normalizedBase) return browser ? '/' : './';
		return normalizedBase === '.' || normalizedBase === '..' || normalizedBase.startsWith('../')
			? `${normalizedBase}/`
			: `${normalizedBase}/`;
	}

	if (!normalizedBase) {
		return browser ? `/${cleanTarget}` : `./${cleanTarget}`;
	}

	return `${normalizedBase}/${cleanTarget}`;
}

export function getAppBasePathFromScripts(options: { appMarker?: string } = {}): string {
	if (cachedBasePath !== null) return cachedBasePath;

	const appMarker = options.appMarker ?? '/_app/';

	if (typeof document === 'undefined' || typeof location === 'undefined') {
		cachedBasePath = defaultBasePathForCurrentRender();
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
				cachedBasePath = normalizeBasePath(p.slice(0, idx));
				return cachedBasePath;
			}
		}
	} catch {
		// ignore
	}

	cachedBasePath = defaultBasePathForCurrentRender();
	return cachedBasePath;
}

export function resetCachedAppBasePathForTests() {
	cachedBasePath = null;
}

export function getAppBasePath() {
	return getAppBasePathFromScripts();
}

export function getAppBaseUrl(): string {
	const basePath = getAppBasePath();
	if (typeof location === 'undefined') return basePath;

	try {
		return new URL(joinBasePath(basePath, ''), location.href).toString().replace(/\/$/, '');
	} catch {
		return location.origin;
	}
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
// - App-root paths are resolved from the runtime or prerendered app base.
// - Relative paths are also resolved from that app base rather than the current route folder.
export function resolveAppAssetUrl(src: string): string {
	const trimmed = src.trim();
	if (!trimmed) return '';
	if (isAbsoluteLikeUrl(trimmed)) return trimmed;

	return joinBasePath(getAppBasePath(), trimmed);
}

export function resolveAppAbsoluteUrl(src: string): string {
	const resolved = resolveAppAssetUrl(src);
	if (isAbsoluteLikeUrl(resolved) || typeof location === 'undefined') return resolved;

	try {
		return new URL(resolved, location.href).toString();
	} catch {
		return resolved;
	}
}
