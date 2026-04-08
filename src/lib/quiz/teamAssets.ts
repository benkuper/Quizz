import { resolveAppAssetUrl } from '$lib/utils/paths.svelte';

export function getTeamBadgeUrl(teamId: string): string | null {
	const normalizedTeamId = String(teamId ?? '').trim();
	if (!normalizedTeamId) return null;
	return resolveAppAssetUrl(`/teams/${normalizedTeamId}.png`);
}

export function getTeamBadgeBackUrl(): string {
	return resolveAppAssetUrl('/badge_back.png');
}