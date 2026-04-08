import { browser } from '$app/environment';
import {
	getAppBasePath,
	getAppBaseUrl,
	resolveAppAbsoluteUrl,
	resolveAppAssetUrl
} from '$lib/utils/paths.svelte';

export const urlState = $state({
	basePath: getAppBasePath(),
	baseUrl: '',
	mediaPath: resolveAppAssetUrl('/media')
});

$effect.root(() => {
	$effect(() => {
		if (!browser) return;

		urlState.basePath = getAppBasePath();
		urlState.baseUrl = getAppBaseUrl();
		urlState.mediaPath = resolveAppAbsoluteUrl('/media');
	});
	return () => {};
});

export function getMedia(path: string) {
	const trimmed = path.trim();
	if (!trimmed) return '';
	return resolveAppAssetUrl(trimmed.startsWith('/') ? trimmed : `/media/${trimmed}`);
}
