<script lang="ts">
	import { base } from '$app/paths';
	import { TEAM_DEFINITIONS } from '$lib/quiz/config';
	import { resolveAppAssetUrl } from '$lib/utils/paths.svelte';

	function appPath(path: string) {
		const normalized = path.startsWith('/') ? path : `/${path}`;
		return typeof window === 'undefined'
			? `${base || '.'}${normalized}`
			: resolveAppAssetUrl(normalized);
	}

	function getTeamSrc(teamId: string) {
		const params = new URLSearchParams({ teamId });
		return `${appPath('/')}?${params.toString()}`;
	}
</script>

<main class="allviews">
	<div class="left">
		<iframe
			title="Projector View"
			class="panel-iframe"
			src={appPath('/projector')}
			width="1920"
			height="1080"
		></iframe>
	</div>

	<div class="right">
		<div class="top">
			<iframe title="Admin View" class="panel-iframe" src={appPath('/admin')}></iframe>
		</div>

		<div class="bottom">
			{#each TEAM_DEFINITIONS as team}
				<div class="phone-frame">
					<div class="phone-header">{team.name}</div>
					<div class="device-wrap">
						<iframe
							title={team.name}
							class="phone-iframe"
							src={getTeamSrc(team.id)}
							width="1080"
							height="1920"
						></iframe>
					</div>
				</div>
			{/each}
		</div>
	</div>
</main>

<style>
	:global(body) {
		margin: 0;
	}
	.allviews {
		background-color: #222222;
		display: flex;
		flex-direction: row;
		height: 100vh;
		gap: 12px;
		padding: 12px;
		box-sizing: border-box;
		overflow: hidden;
	}

	.left {
		flex-grow: 1;
		width: 100%;
		height: 100%;
		display: flex;
	}

	.right {
		display: flex;
		flex-direction: column;
		flex: 0 0 min(42vw, 52rem);
		min-width: 0;
	}

	.top {
		display: flex;
		gap: 12px;
		flex: 1;
		min-height: 0;
	}
	.bottom {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
		flex: 1;
		min-height: 0;
	}

	.phone-frame {
		position: relative;
		border-radius: 20px;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		padding-top: 1rem;
		/* padding: 48px 18px 18px; */
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2);
		box-sizing: border-box;
		min-height: 0;
		background-color: #000000;
		background-repeat: no-repeat;
		background-position: center;
		background-size: contain;
		overflow: hidden;
	}
	.phone-header {
		position: absolute;
		font-size: 0.6em;
		top: 12px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(17, 24, 39, 0.95);
		color: white;
		padding: 0.15rem 0.6rem;
		border-radius: 12px;
		z-index: 2;
	}
	.device-wrap {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		min-height: 0;
	}

	.phone-iframe {
		width: 151.5151515%;
		height: 151.5151515%;
		transform: scale(0.66);
		transform-origin: center;
		border: 0;
		border-radius: 12px;
		background: transparent;
		display: block;
	}
	.panel-iframe {
		width: 100%;
		flex: 1;
		border: 0;
		border-radius: 8px;
		background: transparent;
		display: block;
	}
</style>
