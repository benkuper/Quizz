<script lang="ts">
	import { getTeamBadgeBackUrl, getTeamBadgeUrl } from '$lib/quiz/teamAssets';

	const EDGE_DEPTHS = ['0.18rem', '0.12rem', '0.06rem', '0rem', '-0.06rem', '-0.12rem', '-0.18rem'];
	const DEFAULT_RIBBON_PATH = 'M 270 1065 C 430 1020, 700 1230, 1030 1090';

	type Props = {
		teamId: string;
		teamName?: string;
		spinning?: boolean;
		spinMode?: 'none' | 'once' | 'infinite';
		renderMode?: 'full' | 'flat';
		spinDuration?: string;
		spinTurns?: number;
		spinKey?: string | number;
		dimmed?: boolean;
		ribbonText?: string;
		class?: string;
	};

	let {
		teamId,
		teamName = '',
		spinning = false,
		spinMode = 'none',
		renderMode = 'full',
		spinDuration = '18s',
		spinTurns = 3,
		spinKey = '',
		dimmed = false,
		ribbonText = '',
		class: className = ''
	}: Props = $props();

	let badgeMissing = $state(false);
	let oneShotCycle = $state(0);

	
	const frontUrl = $derived.by(() => getTeamBadgeUrl(String(teamId ?? '')));
	const backUrl = $derived.by(() => getTeamBadgeBackUrl());
	const ribbonPathId = $derived.by(
		() => `badge-ribbon-path-${String(teamId ?? '').replace(/[^a-zA-Z0-9_-]/g, '-')}-${oneShotCycle}`
	);
	const normalizedSpinMode = $derived.by(() => {
		if (spinMode !== 'none') return spinMode;
		return spinning ? 'infinite' : 'none';
	});
	const isInfiniteSpin = $derived(normalizedSpinMode === 'infinite');
	const isOneShotSpin = $derived(normalizedSpinMode === 'once');
	const isFlatRender = $derived(renderMode === 'flat');
	const spinTransform = $derived.by(() => `rotateY(${Math.max(1, Number(spinTurns) || 1) * 360}deg)`);
	const badgeSceneStyle = $derived.by(() => {
		const frontImage = frontUrl ? `--badge-front-image:url(${frontUrl});` : '--badge-front-image:none;';
		return `--badge-spin-duration:${spinDuration}; --badge-spin-transform:${spinTransform}; --badge-back-image:url(${backUrl}); ${frontImage}`;
	});
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
	const ribbonLabel = $derived.by(() => {
		const source = String(ribbonText ?? '').trim();
		return source || teamName;
	});
	const hasArtwork = $derived(Boolean(frontUrl) && !badgeMissing);

	$effect(() => {
		if (!isOneShotSpin) return;
		spinKey;
		oneShotCycle += 1;
	});
</script>

<div
	class={`badge-scene ${className}`.trim()}
	class:spinning={isInfiniteSpin}
	class:spinning-once={isOneShotSpin}
	class:dimmed
	style={badgeSceneStyle}
>
	{#if hasArtwork}
		{#if isFlatRender}
			{#key `${teamId}:${oneShotCycle}`}
				<div class="badge-flat">
					<img src={frontUrl!} alt={teamName || teamId} class="badge-image badge-image-flat" onerror={() => (badgeMissing = true)} />
				</div>
			{/key}
		{:else}
			{#key `${teamId}:${oneShotCycle}`}
				<div class="badge-body" style="isolation:isolate;">
					{#each EDGE_DEPTHS as depth}
						<div class="badge-layer badge-edge" style={`transform: translateZ(${depth});`}></div>
					{/each}

					<div class="badge-layer badge-face badge-face-front">
						<img src={frontUrl!} alt={teamName || teamId} class="badge-image" onerror={() => (badgeMissing = true)} />
						<div class="badge-shine-container">
							<div class="badge-shine"></div>
						</div>
						<svg class="badge-ribbon" viewBox="0 0 1280 1280" aria-hidden="true">
							<defs>
								<path id={ribbonPathId} d={DEFAULT_RIBBON_PATH}></path>
							</defs>

							<text class="badge-ribbon-text" text-anchor="middle" textLength="700" lengthAdjust="spacingAndGlyphs">
								<textPath href={`#${ribbonPathId}`} startOffset="50%">{ribbonLabel}</textPath>
							</text>
						</svg>
					</div>

					<div class="badge-layer badge-face badge-face-back">
						<img src={backUrl} alt="" aria-hidden="true" class="badge-image" />
					</div>
				</div>
			{/key}
		{/if}
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

	.badge-flat {
		position: relative;
		width: 100%;
		height: 100%;
		border-radius: 999rem;
		overflow: hidden;
		background: radial-gradient(circle at 30% 25%, rgba(255, 255, 255, 0.22), rgba(15, 23, 42, 0.9));
		border: 0.12rem solid rgba(255, 255, 255, 0.16);
		box-shadow: 0 1.1rem 2.1rem rgba(0, 0, 0, 0.28);
	}

	.badge-scene.spinning .badge-body {
		animation: badge-spin var(--badge-spin-duration) linear infinite;
	}

	.badge-scene.spinning-once .badge-body {
		animation: badge-spin-once var(--badge-spin-duration) cubic-bezier(0.1, 1, 0.2, 1) 1 both;
	}

	.badge-scene.spinning .badge-flat {
		animation: badge-flat-spin var(--badge-spin-duration) linear infinite;
	}

	.badge-scene.spinning-once .badge-flat {
		animation: badge-flat-spin-once var(--badge-spin-duration) cubic-bezier(0.1, 1, 0.2, 1) 1 both;
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
		filter: drop-shadow(0 0.9rem 1.5rem rgba(0, 0, 0, 0.45));
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

	.badge-image-flat {
		object-fit: cover;
	}

	.badge-shine-container,
	.badge-ribbon {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.badge-shine-container {
		z-index: 2;
		transform: translateZ(0.06rem);
		pointer-events: none;
		overflow: hidden;
		-webkit-mask-image: var(--badge-front-image);
		mask-image: var(--badge-front-image);
		-webkit-mask-size: contain;
		mask-size: contain;
		-webkit-mask-position: center;
		mask-position: center;
		-webkit-mask-repeat: no-repeat;
		mask-repeat: no-repeat;
	}

	.badge-shine {
		position: absolute;
		top: -30%;
		left: -55%;
		width: 36%;
		height: 160%;
		transform: rotate(28deg);
		opacity: 0;
		border-radius: 999rem;
		background: linear-gradient(
			to right,
			rgba(255, 255, 255, 0) 0%,
			rgba(255, 255, 255, 0.18) 18%,
			rgba(255, 255, 255, 0.78) 50%,
			rgba(255, 255, 255, 0.18) 82%,
			rgba(255, 255, 255, 0) 100%
		);
		filter: blur(0.42rem);
		mix-blend-mode: screen;
		pointer-events: none;
	}

	.badge-scene.spinning .badge-shine {
		animation: badge-shine calc(var(--badge-spin-duration) * 0.55) ease-in-out infinite;
	}

	.badge-scene.spinning-once .badge-shine {
		animation: badge-shine-once var(--badge-spin-duration) linear 1 both;
	}

	.badge-ribbon {
		z-index: 3;
		pointer-events: none;
		overflow: visible;
	}

	.badge-ribbon-text {
		font-family: Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
		font-size: 6.75rem;
		font-weight: 700;
		letter-spacing: 0.62rem;
		text-transform: uppercase;
		fill: #fff7e8;
		paint-order: stroke fill;
		stroke: #9a2b39;
		stroke-width: 1.25rem;
		stroke-linejoin: round;
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

	@keyframes badge-spin-once {
		from {
			transform: rotateY(0deg);
		}

		to {
			transform: var(--badge-spin-transform);
		}
	}

	@keyframes badge-flat-spin {
		from {
			transform: rotate(0deg);
		}

		to {
			transform: rotate(360deg);
		}
	}

	@keyframes badge-flat-spin-once {
		0% {
			transform: rotate(0deg) scale(0.94);
		}

		20% {
			transform: rotate(120deg) scale(1);
		}

		100% {
			transform: rotate(1080deg) scale(1);
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

	@keyframes badge-shine-once {
		0% {
			left: -55%;
			opacity: 0;
		}

		10% {
			opacity: 0.15;
		}

		28% {
			opacity: 0.95;
		}

		72% {
			opacity: 0.95;
		}

		100% {
			left: 118%;
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.badge-scene.spinning .badge-body,
		.badge-scene.spinning .badge-shine,
		.badge-scene.spinning .badge-flat,
		.badge-scene.spinning-once .badge-body,
		.badge-scene.spinning-once .badge-flat,
		.badge-scene.spinning-once .badge-shine {
			animation: none;
		}
	}
</style>