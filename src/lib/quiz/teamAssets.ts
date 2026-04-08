const badgeModules = import.meta.glob('../assets/badges/*.png', {
	eager: true,
	import: 'default'
}) as Record<string, string>;

export const TEAM_BADGE_URLS = Object.fromEntries(
	Object.entries(badgeModules).map(([path, url]) => {
		const filename = path.split('/').pop() ?? '';
		const teamId = filename.replace(/\.png$/i, '');
		return [teamId, url];
	})
) as Record<string, string>;

export function getTeamBadgeUrl(teamId: string): string | null {
	return TEAM_BADGE_URLS[teamId] ?? null;
}