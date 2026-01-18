<script lang="ts">
	import type PartySocket from 'partysocket';
	import ProjectorScreen from '$lib/components/projector/ProjectorScreen.svelte';
	import { toDataURL } from 'qrcode';
	import { createQuizSocket } from '$lib/partykit/client.svelte';
	import { onMount } from 'svelte';
	import { urlState } from '$lib/url.svelte';
	import SignContainer from '$lib/components/projector/SignContainer.svelte';

	let gameState: any = $state(null);
	let socket: PartySocket | null = $state(null);
	let lastAutoAdvanceQuestionId: string | null = $state(null);
	let joinQrDataUrl: string | null = $state(null);
	let screenOpacity = $state(1.0);
	let beamOpacity = $state(1.0);

	const sortedPlayers = $derived.by(() =>
		gameState?.players
			? [...(Object.values(gameState.players) as any[])].sort(
					(a: any, b: any) => (b?.score ?? 0) - (a?.score ?? 0)
				)
			: []
	);

	const playersList = $derived.by(() =>
		gameState?.players ? (Object.values(gameState.players) as any[]) : []
	);
	const correctPlayers = $derived.by(() => playersList.filter((p: any) => p.lastCorrect === true));
	const wrongPlayers = $derived.by(() => playersList.filter((p: any) => p.lastCorrect === false));

	let projectorScale = $state(1.0);

	function updateScale() {
		const scaleX = window.innerWidth / 1920;
		const scaleY = window.innerHeight / 1080;
		projectorScale = Math.min(scaleX, scaleY);
	}

	onMount(() => {
		updateScale();
		window.addEventListener('resize', updateScale);
		return () => {
			window.removeEventListener('resize', updateScale);
		};
	});

	$effect(() => {
		return;
		let rafId = 0;
		const start = performance.now();

		let baseBeamOpacity = 0.5;
		let baseScreenOpacity = 0.9;
		let noiseIntensity = 0.06;
		let noiseSpeed = 10.0;

		const tick = (now: number) => {
			const t = ((now - start) * noiseSpeed) / 1000;
			const n1 = Math.sin(t * 1.3) * 0.5 + Math.sin(t * 2.9 + 1.7) * 0.25;
			const n2 = Math.sin(t * 1.9 + 0.8) * 0.5 + Math.sin(t * 3.4 + 2.1) * 0.25;
			const noise1 = Math.min(1, Math.max(0, 0.5 + n1));
			const noise2 = Math.min(1, Math.max(0, 0.5 + n2));
			beamOpacity = baseBeamOpacity + ((noise1 + noise2) / 2) * noiseIntensity;
			screenOpacity = baseScreenOpacity + ((noise1 + noise2) / 2) * noiseIntensity;
			rafId = requestAnimationFrame(tick);
		};

		rafId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafId);
	});

	$effect(() => {
		if (!urlState.baseUrl) return;
		let cancelled = false;

		(async () => {
			const dataUrl = await toDataURL(urlState.baseUrl, {
				margin: 1,
				width: 320,
				errorCorrectionLevel: 'M'
			});
			if (!cancelled) joinQrDataUrl = dataUrl;
		})().catch(() => {
			if (!cancelled) joinQrDataUrl = null;
		});

		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		const s = createQuizSocket({ role: 'projector' });
		socket = s;

		s.onmessage = (evt) => {
			const msg = JSON.parse(evt.data);
			if (msg.type === 'state') gameState = msg.data;
		};

		return () => {
			s.close();
			socket = null;
		};
	});

	$effect(() => {
		const qid = String(gameState?.question?.id ?? '');
		if (!qid) return;
		// Reset per question so we can auto-advance once.
		if (lastAutoAdvanceQuestionId && lastAutoAdvanceQuestionId !== qid)
			lastAutoAdvanceQuestionId = null;
	});

	function isMediaQuestion() {
		return String(gameState?.question?.type ?? '') === 'media';
	}

	function handleMediaFinished() {
		if (!socket) return;
		if (!gameState || gameState.status !== 'question') return;
		if (!isMediaQuestion()) return;
		const qid = String(gameState?.question?.id ?? '');
		if (!qid) return;
		if (lastAutoAdvanceQuestionId === qid) return;
		lastAutoAdvanceQuestionId = qid;
		socket.send(JSON.stringify({ type: 'media_finished', questionId: qid }));
	}
</script>

<main class="projector" style="--scale:{projectorScale};">
	<img
		class="full"
		src="{urlState.basePath}/projector/drivein.png"
		style="--screen-opacity:{screenOpacity};"
		alt=""
		aria-hidden="true"
	/>
	<div class="frame">
		<ProjectorScreen
			{gameState}
			joinUrl={urlState.baseUrl}
			{joinQrDataUrl}
			{correctPlayers}
			{wrongPlayers}
			{sortedPlayers}
			onMediaFinished={handleMediaFinished}
		/>
	</div>

	<div class="status-bar">
		<div class="status-left">
			<span class="status-dot" class:live={!!socket}></span>
			<span class="status-text">
				{#if !gameState}
					Connecting…
				{:else}
					Status: {gameState.status}
				{/if}
			</span>
		</div>
		{#if String(gameState?.question?.type ?? '') !== 'media' && gameState?.status === 'question'}
			<div class="timer" class:urgent={gameState?.timer < 5}>{gameState?.timer}</div>
		{/if}
		<div class="status-right">
			{#if gameState?.players}
				Players: {Object.keys(gameState.players).length}
			{/if}
		</div>
	</div>
	<img class="erics" src="{urlState.basePath}/projector/erics.png " alt="" aria-hidden="true" />
	<img class="sign" src="{urlState.basePath}/projector/sign.png" alt="" aria-hidden="true" />
	<img class="fleche" src="{urlState.basePath}/projector/fleche.png" alt="" aria-hidden="true" />

	<SignContainer text="SNACKS" variant="yellow" x={51} y={-59.5} size={1.3}></SignContainer>
	<SignContainer text="HOT Dogs" variant="red" x={51} y={-52} size={1}></SignContainer>
	<SignContainer text="Cold drinks" variant="blue" x={51} y={-44.8} size={.9}></SignContainer>
	<img
		class="beam full"
		src="{urlState.basePath}/projector/beam.png"
		style="--beam-opacity:{beamOpacity};"
		alt=""
		aria-hidden="true"
	/>
</main>

<style>
	.projector {
		font-family: 'Redrock', Inter, sans-serif !important;

		position: absolute;
		width: 1920px;
		height: 1080px;
		top: 0;
		left: 0;
		transform-origin: top left;
		transform: scale(var(--scale));
	}

	img.full {
		position: absolute;
		width: 100%;
		height: 100%;
	}

	.frame {
		position: absolute;
		left: 517px;
		top: 158px;
		width: 908px;
		height: 464px;
		opacity: var(--screen-opacity);
		filter: grayscale(0.3);
	}

	.beam {
		opacity: var(--beam-opacity);
	}

	img.erics {
		position: absolute;
		top: 305px;
		left: 50px;
		opacity: 0;
		animation: erics-pulse 6s ease-in-out infinite;
		will-change: opacity;
	}

	@keyframes erics-pulse {
		0% {
			opacity: 0;
		}
		25% {
			opacity: 0;
		}
		50% {
			opacity: 0.2;
		}
		80% {
			opacity: 0.3;
		}
		83% {
			opacity: 0.2;
		}
		86% {
			opacity: 0.3;
		}
		89% {
			opacity: 0.2;
		}
		92% {
			opacity: 0.1;
		}
		95% {
			opacity: 0;
		}
		100% {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		img.erics {
			opacity: 1;
		}
	}

	img.sign {
		position: absolute;
		top: 457px;
		left: 108px;
		animation: sign-blink 10s step-end infinite;

		will-change: opacity;
	}

	@keyframes sign-blink {
		0%,
		80%,
		90% {
			opacity: 0;
		}
		75%,
		85% {
			opacity: 0.8;
		}
	}

	img.fleche {
		position: absolute;
		top: 532px;
		left: 136px;

		-webkit-mask-image: linear-gradient(
			90deg,
			transparent 0%,
			rgba(0, 0, 0, 1),
			rgba(0, 0, 0, 1),
			transparent 100%
		);
		mask-image: linear-gradient(
			90deg,
			transparent 0%,
			rgba(0, 0, 0, 0.6),
			rgba(0, 0, 0, 0.6),
			transparent 100%
		);
		-webkit-mask-size: 20% 100%;
		mask-size: 20% 100%;
		-webkit-mask-position: 0% 0%;
		mask-position: 0% 0%;

		animation: fleche-opacity-wipe 1s linear infinite;
		will-change: mask-position;
	}

	@keyframes fleche-opacity-wipe {
		0% {
			-webkit-mask-position: 0% 0%;
			mask-position: 0% 0%;
		}
		100% {
			-webkit-mask-position: 100% 0%;
			mask-position: 25% 0%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		img.fleche {
			animation: none;
			-webkit-mask-image: none;
			mask-image: none;
			opacity: 1;
		}
	}

	.status-bar {
		position: absolute;
		left: 6%;
		right: 6%;
		bottom: 4%;
		height: 4rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		padding: 0.8rem 1.4rem;
		border-radius: 999px;
		background: rgba(203, 203, 203, 0.138);
		backdrop-filter: blur(0.4rem);
		font-size: 3rem;
	}

	.status-left {
		display: flex;
		align-items: center;
		gap: 0.8rem;
	}
	.status-dot {
		width: 0.8rem;
		height: 0.8rem;
		border-radius: 50%;
		background: #9ca3af;
		box-shadow: 0 0 0.8rem rgba(156, 163, 175, 0.8);
	}
	.status-dot.live {
		background: #22c55e;
		box-shadow: 0 0 1rem rgba(34, 197, 94, 0.9);
	}
	.status-right {
		font-weight: 700;
	}

	.timer {
		font-size: 4rem;
		font-weight: bold;
		margin-bottom: 1rem;
		color: #4f46e5;
	}
	.timer.urgent {
		color: #ef4444;
		animation: pulse 1s infinite;
	}

	
</style>
