<script lang="ts">
	import { fade, fly, scale } from 'svelte/transition';
	import TeamBadge from '$lib/components/shared/TeamBadge.svelte';

	type Props = {
		teamId: string;
		teamName: string;
		title?: string;
		subtitle?: string;
		spinMode?: 'once' | 'infinite';
		spinKey?: string;
	};

	let { teamId, teamName, title = 'Bonne reponse', subtitle = '', spinMode = 'once', spinKey = '' }: Props = $props();
</script>

<div class="badge-overlay" in:fade={{ duration: 180 }} out:fade={{ duration: 220 }}>
	<div class="badge-overlay__halo" aria-hidden="true"></div>
	<div class="badge-overlay__card" in:fly={{ y: 20, duration: 280 }} out:fly={{ y: -24, duration: 220 }}>
		<div class="badge-overlay__badge" in:scale={{ start: 0.78, duration: 320 }} out:scale={{ start: 0.88, duration: 180 }}>
			<TeamBadge teamId={teamId} teamName={teamName} spinMode={spinMode} renderMode="flat" spinKey={spinKey} spinDuration="4.2s" spinTurns={3} class="badge-overlay__team-badge" />
		</div>
		<div class="badge-overlay__copy">
			<p class="badge-overlay__title">{title}</p>
			<p class="badge-overlay__name">{teamName}</p>
			{#if subtitle}
				<p class="badge-overlay__subtitle">{subtitle}</p>
			{/if}
		</div>
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
		gap: 1.5rem;
		padding: 2.2rem 2.8rem;
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

	.badge-overlay__copy {
		display: grid;
		justify-items: center;
		gap: 0.35rem;
		text-align: center;
		color: white;
	}

	.badge-overlay__title {
		margin: 0;
		font-size: 1rem;
		font-weight: 800;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: rgba(191, 219, 254, 0.9);
	}

	.badge-overlay__name {
		margin: 0;
		font-size: clamp(2rem, 3.6vw, 3.5rem);
		font-weight: 900;
		line-height: 1;
	}

	.badge-overlay__subtitle {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: rgba(226, 232, 240, 0.9);
	}

	@media (prefers-reduced-motion: reduce) {
		.badge-overlay,
		.badge-overlay * {
			transition: none !important;
		}
	}
</style>