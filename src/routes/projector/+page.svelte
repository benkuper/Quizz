<script lang="ts">
	import { base } from '$app/paths';
	import type PartySocket from 'partysocket';
	import ProjectorScreen from '$lib/components/projector/ProjectorScreen.svelte';
	import FocusedOptionOverlay from '$lib/components/projector/FocusedOptionOverlay.svelte';
	import { toDataURL } from 'qrcode';
	import { createQuizSocket } from '$lib/partykit/client.svelte';
	import { onMount } from 'svelte';
	import { urlState } from '$lib/url.svelte';
	import SignContainer from '$lib/components/projector/SignContainer.svelte';
	import PlayerInfo from '$lib/components/projector/PlayerInfo.svelte';
	import { TEAM_DEFINITIONS } from '$lib/quiz/config';
	import {
		isBurgerQuestionType,
		isKaraokeQuestionType,
		isPassiveQuestionType
	} from '$lib/quiz/questionTypes';
	import { resolveAppAssetUrl } from '$lib/utils/paths.svelte';

	type FocusedOptionOverlayData = {
		label?: string;
		text: string;
		imageSrc: string;
	};

	let gameState: any = $state(null);
	let socket: PartySocket | null = $state(null);
	let lastAutoAdvanceQuestionId: string | null = $state(null);
	let joinQrDataUrl: string | null = $state(null);
	let screenOpacity = $state(1.0);
	let beamOpacity = $state(1.0);
	let focusedOptionOverlay = $state<FocusedOptionOverlayData | null>(null);

	function appPath(path: string) {
		const normalized = path.startsWith('/') ? path : `/${path}`;
		return typeof window === 'undefined'
			? `${base || '.'}${normalized}`
			: resolveAppAssetUrl(normalized);
	}

	const sortedPlayers = $derived.by(() =>
		gameState?.players
			? [...(Object.values(gameState.players) as any[])].filter((player: any) => player.enabled).sort(
					(a: any, b: any) => (b?.score ?? 0) - (a?.score ?? 0)
				)
			: []
	);

	const teamOrder = Object.fromEntries(TEAM_DEFINITIONS.map((team, index) => [team.id, index]));

	const playersList = $derived.by(() =>
		gameState?.players
			? [...(Object.values(gameState.players) as any[])].filter((player: any) => player.enabled).sort(
				(a: any, b: any) =>
					(teamOrder[String(a?.id ?? '')] ?? Number.MAX_SAFE_INTEGER) -
					(teamOrder[String(b?.id ?? '')] ?? Number.MAX_SAFE_INTEGER)
			)
			: []
	);
	const correctPlayers = $derived.by(() => playersList.filter((p: any) => p.lastCorrect === true));
	const wrongPlayers = $derived.by(() => playersList.filter((p: any) => p.lastCorrect === false));
	const showPlayers = $derived.by(() => {
		if (isPassiveQuestionType(gameState?.question?.type)) return false;
		return gameState?.status == 'reveal' || gameState?.status === 'question' || gameState?.status === 'review';
	});

	let sign1Text: string = $state('SNACKS');
	let sign2Text: string = $state('HOT DOGS');
	let sign3Text: string = $state('COLD DRINKS');

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

	$effect(() => {
		if (!gameState) return;
		const questionType = gameState.question?.type;
		switch (gameState.status) {
			case 'lobby':
				sign1Text = 'REJOINS';
				sign2Text = 'LE';
				sign3Text = 'QUIZ';
				break;
			case 'reading':
				if (gameState.question) {
					if (isKaraokeQuestionType(questionType)) {
						sign1Text = 'KARA';
						sign2Text = 'OKE';
						sign3Text = 'PRET';
						} else if (isBurgerQuestionType(questionType)) {
							sign1Text = 'BURGER';
							sign2Text = 'LIS';
							sign3Text = 'PRET';
					} else if (isPassiveQuestionType(questionType)) {
						sign1Text = 'INTER';
						sign2Text = 'MEDE';
						sign3Text = 'VIDEO';
					} else {
						sign1Text = 'QUESTION';
						sign2Text = `${gameState.actualQuestionIndex ?? ''}`;
						sign3Text = 'LECTURE';
					}
				}
				break;
			case 'question':
				if (gameState.question) {
					if (isKaraokeQuestionType(questionType)) {
						sign1Text = 'KARA';
						sign2Text = 'OKE';
						sign3Text = 'CHANT';
					} else if (isPassiveQuestionType(questionType)) {
						sign1Text = 'FILM';
						sign2Text = 'EN';
						sign3Text = 'COURS';
					} else {
						sign1Text = 'TEMPS';
						sign2Text = `${gameState.timer ?? ''}`;
						sign3Text = 'RESTANT';
					}
				}
				break;

			case 'reveal':
					if (isBurgerQuestionType(questionType) && gameState?.optionReveal?.revealPhase !== 'answers') {
						sign1Text = 'QUESTIONS';
						sign2Text = 'UNE';
						sign3Text = 'PAR UNE';
					} else {
						sign1Text = 'REPONSES';
						sign2Text = 'UNE';
						sign3Text = 'PAR UNE';
					}
				break;

			case 'review':
				{
					let best3Players = sortedPlayers.slice(0, 3);
					sign1Text = best3Players[0] ? `${best3Players[0].name.toUpperCase()}` : '---';
					sign2Text = best3Players[1] ? `${best3Players[1].name.toUpperCase()}` : '---';
					sign3Text = best3Players[2] ? `${best3Players[2].name.toUpperCase()}` : '---';
				}
				break;

			case 'finished':
				{
					let winner = sortedPlayers[0];
					sign1Text = 'GAGNANT';
					sign2Text = winner ? `${winner.name.toUpperCase()}` : '---';
					sign3Text = `POINTS: ${winner ? winner.score : '---'}`;
				}
				break;
			default:
				break;
		}
	});

	function isPassiveQuestion() {
		return isPassiveQuestionType(gameState?.question?.type);
	}

	function handlePassiveFinished() {
		if (!socket) return;
		if (!gameState || gameState.status !== 'question') return;
		if (!isPassiveQuestion()) return;
		const qid = String(gameState?.question?.id ?? '');
		if (!qid) return;
		if (lastAutoAdvanceQuestionId === qid) return;
		lastAutoAdvanceQuestionId = qid;
		socket.send(JSON.stringify({ type: 'passive_finished', questionId: qid }));
	}

	function handleFocusImageChange(payload: FocusedOptionOverlayData | null) {
		focusedOptionOverlay = payload;
	}
</script>

<main class="projector" style="--scale:{projectorScale};">
	<img
		class="full"
		src={appPath('/projector/drivein.png')}
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
			onFocusImageChange={handleFocusImageChange}
			onPassiveFinished={handlePassiveFinished}
		/>
	</div>

	<div class="status-bar" class:is-hidden={!showPlayers}>
		<!-- <div class="status-left">
			<span class="status-dot" class:live={!!socket}></span>
		</div> -->
		<div class="players">
			<!-- {#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] as _} -->
			<!-- &nbsp; -->
			{#each playersList as player}
				<PlayerInfo {player} gameStatus={gameState?.status} />
			{/each}
			<!-- {/each} -->
		</div>
		<!-- <div class="status-right">
			{#if gameState?.players}
				Players: {Object.keys(gameState.players).length}
			{/if}
		</div> -->
	</div>
	<img class="erics" src={appPath('/projector/erics.png')} alt="" aria-hidden="true" />
	<img class="sign" src={appPath('/projector/sign.png')} alt="" aria-hidden="true" />
	<img class="fleche" src={appPath('/projector/fleche.png')} alt="" aria-hidden="true" />

	<SignContainer text={sign1Text} variant="yellow" x={51} y={-58.5} size={1.3} flicker={5}
	></SignContainer>
	<SignContainer text={sign2Text} variant="red" x={51} y={-51} size={1} flicker={6}></SignContainer>
	<SignContainer text={sign3Text} variant="blue" x={51} y={-43.8} size={0.9} flicker={7}
	></SignContainer>
	<img
		class="beam full"
		src={appPath('/projector/beam.png')}
		style="--beam-opacity:{beamOpacity};"
		alt=""
		aria-hidden="true"
	/>

	{#if focusedOptionOverlay}
		<FocusedOptionOverlay
			label={focusedOptionOverlay.label}
			text={focusedOptionOverlay.text}
			imageSrc={focusedOptionOverlay.imageSrc}
		/>
	{/if}
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
		overflow: hidden;
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
			opacity: 0.1;
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
			opacity: 0.4;
		}
		95% {
			opacity: 0.1;
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
		bottom: 0;
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		background: rgba(203, 203, 203, 0.138);
		backdrop-filter: blur(0.4rem);
		font-size: 3rem;
		transition: bottom 240ms ease-in-out, opacity 240ms ease-in-out;
		pointer-events: none;
		opacity: 1;
	}

	
	.status-bar.is-hidden{
		opacity: 0;
		bottom: -10rem;
	}

	.status-bar .players {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
		flex-grow: 1;
		justify-content: center;
		height: 100%;
		padding: 0.5rem;
		pointer-events: none;
	}

</style>
