<script lang="ts">
	import { getTeamBadgeBackUrl, getTeamBadgeUrl } from '$lib/quiz/teamAssets';

	const EDGE_DEPTHS = ['0.18rem', '0.12rem', '0.06rem', '0rem', '-0.06rem', '-0.12rem', '-0.18rem'];

	type Props = {
		teamId: string;
		teamName?: string;
		spinning?: boolean;
		spinDuration?: string;
		dimmed?: boolean;
		class?: string;
	};

	let {
		teamId,
		teamName = '',
		spinning = false,
		spinDuration = '18s',
		dimmed = false,
		class: className = ''
	}: Props = $props();

	let badgeMissing = $state(false);

	const frontUrl = $derived.by(() => getTeamBadgeUrl(String(teamId ?? '')));
	const backUrl = $derived.by(() => getTeamBadgeBackUrl());
	const fallbackLabel = $derived.by(() => {
		const source = String(teamName ?? '').trim();
		if (!source) return '?';
		return source
			.replace(/^team\s+/i, '')
			.split(/[\s_]+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('');
	});
	const hasArtwork = $derived(Boolean(frontUrl) && !badgeMissing);
</script>

<div
	class={`badge-scene ${className}`.trim()}
	class:spinning
	class:dimmed
	style={`--badge-spin-duration:${spinDuration}; --badge-back-image:url(${backUrl});`}
>
	{#if hasArtwork}
		<div class="badge-body">
			{#each EDGE_DEPTHS as depth}
				<div class="badge-layer badge-edge" style={`transform: translateZ(${depth});`}></div>
			{/each}

			<div class="badge-layer badge-face badge-face-front">
				<img src={frontUrl!} alt={teamName || teamId} class="badge-image" onerror={() => (badgeMissing = true)} />
				<div class="badge-shine"></div>
			</div>

			<div class="badge-layer badge-face badge-face-back">
				<img src={backUrl} alt="" aria-hidden="true" class="badge-image" />
			</div>
		</div>
	{:else}
		<div class="badge-fallback">{fallbackLabel}</div>
	{/if}
</div>

<style>
	.badge-scene {
		position: relative;
		width: 100%;
		height: 100%;
		perspective: 60rem;
		transform-style: preserve-3d;
		filter: drop-shadow(0 0.8rem 1.2rem rgba(0, 0, 0, 0.35));
		transition: filter 0.25s ease, opacity 0.25s ease;
	}

	.badge-scene.dimmed {
		opacity: 0.6;
		filter: grayscale(1) drop-shadow(0 0.8rem 1.2rem rgba(0, 0, 0, 0.2));
	}

	.badge-body {
		position: relative;
		width: 100%;
		height: 100%;
		transform-style: preserve-3d;
	}

	.badge-scene.spinning .badge-body {
		animation: badge-spin var(--badge-spin-duration) linear infinite;
	}

	.badge-layer {
		position: absolute;
		inset: 0;
		border-radius: 999rem;
		backface-visibility: hidden;
	}

	.badge-edge {
		background-image: var(--badge-back-image);
		background-position: center;
		background-repeat: no-repeat;
		background-size: contain;
		filter: brightness(0.55) saturate(0.88);
	}

	.badge-face {
		overflow: hidden;
	}

	.badge-face-front {
		transform: translateZ(0.24rem);
	}

	.badge-face-back {
		transform: rotateY(180deg) translateZ(0.24rem);
	}

	.badge-image {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
		user-select: none;
		-webkit-user-drag: none;
	}

	.badge-shine {
		position: absolute;
		top: -20%;
		left: -40%;
		width: 36%;
		height: 140%;
		transform: rotate(24deg);
		opacity: 0;
		background: linear-gradient(
			to right,
			rgba(255, 255, 255, 0) 0%,
			rgba(255, 255, 255, 0.16) 20%,
			rgba(255, 255, 255, 0.68) 50%,
			rgba(255, 255, 255, 0.16) 80%,
			rgba(255, 255, 255, 0) 100%
		);
		filter: blur(0.3rem);
		mix-blend-mode: screen;
		pointer-events: none;
	}

	.badge-scene.spinning .badge-shine {
		animation: badge-shine calc(var(--badge-spin-duration) * 0.55) ease-in-out infinite;
	}

	.badge-fallback {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		border-radius: 999rem;
		background: radial-gradient(circle at 30% 25%, rgba(255, 255, 255, 0.18), rgba(15, 23, 42, 0.96));
		border: 0.08rem solid rgba(255, 255, 255, 0.12);
		font-size: clamp(0.7rem, 1.5vw, 1.2rem);
		font-weight: 800;
		letter-spacing: 0.12em;
		color: white;
	}

	@keyframes badge-spin {
		from {
			transform: rotateY(0deg);
		}

		to {
			transform: rotateY(360deg);
		}
	}

	@keyframes badge-shine {
		0%,
		100% {
			left: -40%;
			opacity: 0;
		}

		18% {
			opacity: 0.12;
		}

		45%,
		60% {
			left: 102%;
			opacity: 0.82;
		}

		80% {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.badge-scene.spinning .badge-body,
		.badge-scene.spinning .badge-shine {
			animation: none;
		}
	}
</style>