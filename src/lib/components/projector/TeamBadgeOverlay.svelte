<script lang="ts">
	import { fade, fly, scale } from 'svelte/transition';
	import TeamBadge from '$lib/components/shared/TeamBadge.svelte';

	type Props = {
		teamId: string;
		teamName: string;
		subtitle?: string;
		spinMode?: 'once' | 'infinite';
		spinKey?: string;
	};

	let { teamId, teamName, subtitle = '', spinMode = 'once', spinKey = '' }: Props = $props();
</script>

<div class="badge-overlay" in:fade={{ duration: 180 }} out:fade={{ duration: 220 }}>
	<div class="badge-overlay__halo" aria-hidden="true"></div>
	<div class="badge-overlay__card" in:fly={{ y: 20, duration: 280 }} out:fly={{ y: -24, duration: 220 }}>
		<div class="badge-overlay__badge" in:scale={{ start: 0.78, duration: 320 }} out:scale={{ start: 0.88, duration: 180 }}>
			<TeamBadge teamId={teamId} teamName={teamName} spinMode={spinMode} renderMode="flat" spinKey={spinKey} spinDuration="4.2s" spinTurns={3} class="badge-overlay__team-badge" />
		</div>
		{#if subtitle}
			<p class="badge-overlay__score">{subtitle}</p>
		{/if}
	</div>
</div>

<style>
	.badge-overlay {
		position: absolute;
		inset: 0;
		z-index: 12;
		display: grid;
		place-items: center;
		pointer-events: none;
	}

	.badge-overlay__halo {
		position: absolute;
		width: min(42rem, 70vw);
		height: min(42rem, 70vw);
		border-radius: 999rem;
		background: radial-gradient(circle, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0.06) 32%, rgba(255, 255, 255, 0) 70%);
		filter: blur(1rem);
	}

	.badge-overlay__card {
		position: relative;
		display: grid;
		justify-items: center;
		gap: 1rem;
		padding: 2rem 2.4rem;
		border-radius: 2.2rem;
		background: linear-gradient(180deg, rgba(15, 23, 42, 0.84), rgba(2, 6, 23, 0.94));
		border: 0.1rem solid rgba(255, 255, 255, 0.14);
		box-shadow: 0 1.4rem 3rem rgba(0, 0, 0, 0.28);
		contain: layout paint;
	}

	.badge-overlay__badge {
		width: min(16rem, 32vw);
		height: min(16rem, 32vw);
	}

	.badge-overlay__score {
		margin: 0;
		padding: 0.55rem 1rem;
		border-radius: 999rem;
		background: rgba(15, 23, 42, 0.65);
		border: 0.08rem solid rgba(255, 255, 255, 0.16);
		font-size: 1.2rem;
		font-weight: 800;
		letter-spacing: 0.04em;
		color: rgba(241, 245, 249, 0.96);
	}

	@media (prefers-reduced-motion: reduce) {
		.badge-overlay,
		.badge-overlay * {
			transition: none !important;
		}
	}
</style>