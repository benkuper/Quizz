<script lang="ts">
	import { base } from '$app/paths';
	import type PartySocket from 'partysocket';
	import { fade, fly } from 'svelte/transition';
	import PlayerQuestionRenderer from '$lib/components/quiz/player/PlayerQuestionRenderer.svelte';
	import QcmQuestion from '$lib/components/quiz/player/types/QcmQuestion.svelte';
	import { TEAM_DEFINITIONS } from '$lib/quiz/config';
	import { getTeamBadgeUrl } from '$lib/quiz/teamAssets';
	import type { BroadcastState, QuizQuestion } from '$lib/quiz/types';
	import { createQuizSocket } from '$lib/partykit/client.svelte';
	import { HAPTICS, vibrate, type VibrationPattern } from '$lib/config/haptics.svelte';
	import { createAudioPlayer } from '$lib/utils/audio.svelte';
	import { createScreenWakeLock } from '$lib/utils/wakeLock.svelte';
	import { getMedia } from '$lib/url.svelte';
	import { isPassiveQuestionType, isQcmLikeQuestionType } from '$lib/quiz/questionTypes';
	import { resolveAppAssetUrl } from '$lib/utils/paths.svelte';

	let socket: PartySocket | null = $state(null);
	let connected = $state(false);
	let gameState: any = $state(null);

	let joined = $state(false);
	let selectedTeamId: string | null = $state(null);
	let joiningTeamId: string | null = $state(null);
	let joinError = $state('');
	let missingBadgeIds = $state([] as string[]);

	let pingInterval: ReturnType<typeof setInterval> | null = null;

	// Haptics (phone vibration) — configurable via src/lib/config/haptics.svelte.ts
	let prevStatus: string | null = null;
	let prevQuestionId: string | null = null;

	// Keep the screen awake on phones/tablets (best-effort, browser support varies).
	const wakeLock = createScreenWakeLock();

	// Optional per-question intro sound (played on players' phones when the question appears).
	const introSoundPlayer = createAudioPlayer();
	let lastIntroSoundKey: string | null = null;
	let pendingIntroSound: { src: string; key: string } | null = null;
	let audioUnlocked = $state(false);

	function appPath(path: string) {
		const normalized = path.startsWith('/') ? path : `/${path}`;
		return typeof window === 'undefined'
			? `${base || '.'}${normalized}`
			: resolveAppAssetUrl(normalized);
	}

	function markAudioUnlocked() {
		if (audioUnlocked) return;
		audioUnlocked = true;
		void tryPlayPendingIntroSound();
		void wakeLock.request();
	}

	async function tryPlayPendingIntroSound() {
		if (!pendingIntroSound) return;
		const { src, key } = pendingIntroSound;
		const ok = await introSoundPlayer.play(getMedia(src));
		if (ok) {
			pendingIntroSound = null;
			lastIntroSoundKey = key;
		}
	}

	function requestIntroSoundPlay(src: string, key: string) {
		if (!src.trim()) return;
		if (lastIntroSoundKey === key) return;

		void introSoundPlayer.play(getMedia(src)).then((ok) => {
			if (ok) {
				pendingIntroSound = null;
				lastIntroSoundKey = key;
				return;
			}

			// Autoplay blocked (common after refresh) — remember and retry on next interaction.
			pendingIntroSound = { src, key };
		});
	}

	// Fullscreen (best-effort): supported on most Android/desktop browsers.
	let canFullscreen = $state(false);
	let isFullscreen = $state(false);

	// Answer state
	let answer: unknown = $state(null);
	let hasSubmitted: boolean = $state(false);
	let lastSubmittedTimeLeft: number | null = $state(null);

	// Passive rounds (media, karaoke) hide answer submission chrome.
	let contemplateMode = $derived(isPassiveQuestionType(gameState?.question?.type));
	type TeamLobbyEntry = {
		id: string;
		name: string;
		enabled: boolean;
		connected: boolean;
		score: number;
	};
	const selectedTeam = $derived.by(() => {
		if (selectedTeamId && gameState?.players?.[selectedTeamId]) {
			return gameState.players[selectedTeamId];
		}

		return TEAM_DEFINITIONS.find((team) => team.id === selectedTeamId) ?? null;
	});
	const enabledTeams = $derived.by<TeamLobbyEntry[]>(() => {
		if (gameState?.players) {
			return (Object.values(gameState.players) as any[])
				.filter((team: any) => team.enabled)
				.map(
					(team: any): TeamLobbyEntry => ({
						id: String(team.id ?? ''),
						name: String(team.name ?? ''),
						enabled: Boolean(team.enabled),
						connected: Boolean(team.connected),
						score: Number(team.score ?? 0)
					})
				);
		}

		return TEAM_DEFINITIONS.map((team): TeamLobbyEntry => ({
			...team,
			enabled: true,
			connected: false,
			score: 0
		}));
	});
	const availableTeams = $derived.by<TeamLobbyEntry[]>(() =>
		enabledTeams.filter((team) => !team.connected)
	);

	const myScore = $derived(
		(selectedTeamId && (gameState as BroadcastState | null)?.players?.[selectedTeamId]?.score) ?? 0
	);
	const myLastCorrect = $derived(
		(selectedTeamId && (gameState as BroadcastState | null)?.players?.[selectedTeamId]?.lastCorrect) ?? null
	);
	const myLastPoints = $derived(
		(selectedTeamId && (gameState as BroadcastState | null)?.players?.[selectedTeamId]?.lastPoints) ?? null
	);
	const q = $derived(
		((gameState as BroadcastState | null)?.question as QuizQuestion | undefined) ?? undefined
	);
	const qType = $derived(String(q?.type || ''));
	const qcmUsesPhoneShell = $derived.by(() => {
		if (!isQcmLikeQuestionType(qType)) return false;
		const options = (q as any)?.options;
		const count = Array.isArray(options) ? options.length : 0;
		return count > 0 && count <= 4;
	});

	const estimateMaxPoints = $derived.by(() => {
		if (qType !== 'estimate') return null;
		const raw = (q as any)?.estimate?.scoring?.maxPoints;
		const n = Number(raw);
		return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 10;
	});

	const fastFingersMaxPoints = $derived.by(() => {
		if (qType !== 'fastFingers') return null;
		const n = Number((q as any)?.fastFingers?.steps?.length ?? 0);
		return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
	});

	type ReviewFeedback = 'perfect' | 'partial' | 'wrong' | 'none';
	const reviewFeedback = $derived.by<ReviewFeedback>(() => {
		if (gameState?.status !== 'review') return 'none';
		if (myLastPoints === null || typeof myLastPoints !== 'number') {
			// fallback for question types that only set lastCorrect
			if (myLastCorrect === true) return 'perfect';
			if (myLastCorrect === false) return 'wrong';
			return 'none';
		}

		if (qType === 'estimate') {
			const maxPts = estimateMaxPoints ?? 10;
			if (myLastPoints >= maxPts && maxPts > 0) return 'perfect';
			if (myLastPoints > 0) return 'partial';
			return 'wrong';
		}

		if (qType === 'fastFingers') {
			const maxPts = fastFingersMaxPoints ?? 0;
			if (maxPts > 0 && myLastPoints >= maxPts) return 'perfect';
			if (myLastPoints > 0) return 'partial';
			return 'wrong';
		}

		// Default behavior for other types
		if (myLastCorrect === true) return 'perfect';
		if (myLastCorrect === false) return 'wrong';
		return 'none';
	});

	function getOrCreateClientId() {
		try {
			const stored = localStorage.getItem('quizz:clientId');
			if (stored) return stored;

			const created =
				typeof crypto !== 'undefined' && 'randomUUID' in crypto
					? crypto.randomUUID()
					: `${Date.now()}-${Math.random().toString(16).slice(2)}`;
			localStorage.setItem('quizz:clientId', created);
			return created;
		} catch {
			return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
		}
	}

	function loadSelectedTeam() {
		try {
			const stored = localStorage.getItem('quizz:teamId');
			if (stored) selectedTeamId = stored;
		} catch {
			// ignore
		}
	}

	function saveSelectedTeam(teamId: string) {
		try {
			localStorage.setItem('quizz:teamId', teamId);
		} catch {
			// ignore
		}
	}

	function clearSelectedTeam() {
		selectedTeamId = null;
		joiningTeamId = null;
		joined = false;
		try {
			localStorage.removeItem('quizz:teamId');
		} catch {
			// ignore
		}
	}

	function markBadgeMissing(teamId: string) {
		if (missingBadgeIds.includes(teamId)) return;
		missingBadgeIds = [...missingBadgeIds, teamId];
	}

	function teamBadgeUrl(teamId: string) {
		if (missingBadgeIds.includes(teamId)) return null;
		return getTeamBadgeUrl(teamId);
	}

	function resetAnswerUi() {
		answer = null;
		hasSubmitted = false;
		lastSubmittedTimeLeft = null;
	}

	function ensureJoined() {
		if (!socket || !connected) return;
		if (!selectedTeamId) return;
		getOrCreateClientId();
		socket.send(JSON.stringify({ type: 'join', teamId: selectedTeamId }));
	}

	function startPings() {
		stopPings();
		pingInterval = setInterval(() => {
			if (!socket || !connected) return;
			if (!selectedTeamId || !joined) return;
			socket.send(JSON.stringify({ type: 'ping' }));
		}, 5_000);
	}

	function stopPings() {
		if (pingInterval) {
			clearInterval(pingInterval);
			pingInterval = null;
		}
	}

	$effect(() => {
		loadSelectedTeam();

		// Allow auto-joining when `teamId` is provided in the URL (used by /allviews iframes)
		const params =
			typeof location !== 'undefined'
				? new URLSearchParams(location.search)
				: new URLSearchParams();
		const paramTeamId = params.get('teamId');
		if (paramTeamId) {
			selectedTeamId = paramTeamId;
			saveSelectedTeam(paramTeamId);
		}
		getOrCreateClientId();

		const s = createQuizSocket();
		socket = s;

		s.onopen = () => {
			connected = true;
			if (selectedTeamId) ensureJoined();
			startPings();
		};

		s.onclose = () => {
			connected = false;
			joined = false;
			joiningTeamId = null;
			stopPings();
		};

		s.onmessage = (evt) => {
			const msg = JSON.parse(evt.data);

			if (msg.type === 'hello') {
				return;
			}

			if (msg.type === 'join_ok') {
				joined = true;
				joiningTeamId = null;
				joinError = '';
				return;
			}

			if (msg.type === 'join_rejected') {
				joiningTeamId = null;
				joined = false;
				joinError =
					msg.reason === 'occupied'
						? 'This team is already connected on another device.'
						: msg.reason === 'disabled'
							? 'This team is currently disabled by the admin.'
							: 'This team is no longer available.';
				clearSelectedTeam();
				return;
			}

			if (msg.type === 'state') {
				const prevQid = gameState?.question?.id;
				gameState = msg.data as BroadcastState;
				const currentTeam = selectedTeamId ? gameState?.players?.[selectedTeamId] : null;
				const becamePresent = Boolean(currentTeam?.connected) && !joined;

				if (selectedTeamId && !currentTeam) {
					clearSelectedTeam();
					joinError = 'This team is no longer part of the game.';
				}

				if (selectedTeamId && currentTeam && !currentTeam.enabled) {
					clearSelectedTeam();
					joinError = 'This team was disabled by the admin.';
				}

				if (joined && selectedTeamId && currentTeam && !currentTeam.connected) {
					clearSelectedTeam();
					joinError = 'Team assignment reset. Please choose a team again.';
				}

				// If we just (re)joined while a question is already active, play the intro sound for
				// this question as well (useful after kicks / reconnects).
				if (becamePresent) {
					const status = String((msg.data as any)?.status ?? '');
					const qid =
						typeof (msg.data as any)?.question?.id === 'string'
							? (msg.data as any).question.id
							: '';
					const introSound =
						typeof (msg.data as any)?.question?.introSound === 'string'
							? String((msg.data as any).question.introSound)
							: '';
					const qIndex = Number((msg.data as any)?.questionIndex ?? -1);
					if (status === 'question' && introSound.trim() && qid) {
						requestIntroSoundPlay(introSound, `question:${qIndex}:${qid}`);
					}
				}

				// Reset input on new question
				if (gameState?.question?.id && prevQid && gameState.question.id !== prevQid) {
					resetAnswerUi();
				}

				// Also reset if we didn't have a previous question (e.g. lobby -> question)
				if (gameState?.status === 'question' && !prevQid && gameState?.question?.id) {
					resetAnswerUi();
				}
			}

			if (msg.type === 'answer_ack') {
				// Ack from server with the authoritative timer value
				hasSubmitted = true;
				if (typeof msg.timeLeft === 'number') lastSubmittedTimeLeft = msg.timeLeft;
			}

			if (msg.type === 'vibrate') {
				// Broadcast from the admin to buzz all players at once.
				console.log('Vibrate command received from server');
				vibrate(HAPTICS.adminBroadcast);
			}
		};

		const handleBeforeUnload = () => {
			try {
				socket?.close();
			} catch {
				// ignore
			}
		};

		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
			stopPings();
			s.close();
			socket = null;
		};
	});

	// Screen Wake Lock: start/stop automatically while this page is mounted.
	$effect(() => {
		const stop = wakeLock.startAuto();
		return () => stop();
	});

	// If the user is joined + connected, try to keep the screen awake.
	$effect(() => {
		if (!joined || !connected) return;
		void wakeLock.request();
	});

	// Vibrate on question start/end (player view)
	$effect(() => {
		const status = String(gameState?.status ?? '');
		const qid = typeof gameState?.question?.id === 'string' ? gameState.question.id : null;
		const introSound = typeof q?.introSound === 'string' ? q.introSound : '';
		const qIndex = Number((gameState as any)?.questionIndex ?? -1);
		const questionVibration = (q as any)?.vibration as VibrationPattern | undefined;
		const questionVibrationEnd = (q as any)?.vibrationEnd as VibrationPattern | undefined;

		// Question start: entering question OR switching to a new question id while in question.
		if (
			status === 'question' &&
			qid &&
			(prevStatus !== 'question' || (prevQuestionId && qid !== prevQuestionId))
		) {
			// Question start vibration is opt-in per-question.
			if (questionVibration !== undefined) {
				vibrate(questionVibration);
			}

			// Optional audio cue for the question.
			if (introSound.trim() && joined) {
				requestIntroSoundPlay(introSound, `question:${qIndex}:${qid}`);
			}
		}

		// Question end: leaving question.
		if (prevStatus === 'question' && status && status !== 'question') {
			// Question end vibration is also opt-in per-question.
			if (questionVibrationEnd !== undefined) {
				vibrate(questionVibrationEnd);
			}
			// Reset so restarting the game can play the same question's intro again.
			lastIntroSoundKey = null;
		}

		prevStatus = status || null;
		prevQuestionId = qid;
	});

	function joinGame(teamId: string) {
		selectedTeamId = teamId;
		joiningTeamId = teamId;
		joinError = '';
		saveSelectedTeam(teamId);
		ensureJoined();
	}

	function submitAnswer(payload: any) {
		if (!connected) return;
		if (!socket) return;
		socket.send(JSON.stringify({ type: 'submit_answer', answer: payload }));
	}

	function handleAnswerChange(next: unknown) {
		answer = next;
		if (gameState?.status === 'reading') return;
		if (!q) return;
		if (isPassiveQuestionType(qType)) return;
		if (qType === 'fastFingers' || qType === 'vrwhack') return;
		if (qType === 'estimate') {
			const n = Number(next);
			if (!Number.isFinite(n)) return;
			submitAnswer(n);
			return;
		}
		submitAnswer(next);
	}

	function autoSubmit(payload: unknown) {
		if (gameState?.status === 'reading') return;
		if (!q) return;
		if (qType === 'fastFingers') {
			submitAnswer(payload);
			return;
		}
		if (qType === 'vrwhack') {
			submitAnswer(payload);
			return;
		}
		// default: no-op for other types
	}

	$effect(() => {
		if (typeof document === 'undefined') return;
		const update = () => {
			canFullscreen =
				typeof document.documentElement?.requestFullscreen === 'function' &&
				typeof document.exitFullscreen === 'function';
			isFullscreen = Boolean(document.fullscreenElement);
		};
		update();
		document.addEventListener('fullscreenchange', update);
		return () => document.removeEventListener('fullscreenchange', update);
	});

	async function toggleFullscreen() {
		if (typeof document === 'undefined') return;
		if (!canFullscreen) return;
		try {
			if (document.fullscreenElement) {
				await document.exitFullscreen();
				return;
			}
			await document.documentElement.requestFullscreen({ navigationUI: 'hide' } as any);
		} catch {
			// ignore (browser denied / unsupported)
		}
	}

	// Kiosk-ish player mode: keep the page locked to the viewport and avoid browser scrolling/bounce.
	$effect(() => {
		if (typeof document === 'undefined') return;
		document.documentElement.classList.add('kiosk-player');
		document.body.classList.add('kiosk-player');

		// In a normal browser tab, we can't programmatically hide the address bar/menu.
		// Best-effort: request Fullscreen on the first user interaction (works on Android/desktop).
		const isStandalone =
			(typeof window !== 'undefined' &&
				window.matchMedia?.('(display-mode: standalone)').matches) ||
			(typeof navigator !== 'undefined' && (navigator as any).standalone === true);

		const canFullscreen =
			!isStandalone &&
			typeof document !== 'undefined' &&
			!document.fullscreenElement &&
			typeof document.documentElement?.requestFullscreen === 'function';

		return () => {
			document.documentElement.classList.remove('kiosk-player');
			document.body.classList.remove('kiosk-player');
		};
	});
</script>

<main
	class="h-dvh overflow-hidden bg-slate-950 text-slate-50"
	class:bg-emerald-950={reviewFeedback === 'perfect'}
	class:bg-amber-950={reviewFeedback === 'partial'}
	class:bg-rose-950={reviewFeedback === 'wrong'}
	onpointerdown={markAudioUnlocked}
>
	<div class="mx-auto flex h-full max-w-md flex-col px-4 py-4">
		<header class="mb-4 flex items-center justify-end">
			<div class="flex items-center gap-3">
				{#if canFullscreen}
					<button
						class="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-100 active:scale-[0.99]"
						aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
						onclick={toggleFullscreen}
					>
						{isFullscreen ? 'Exit' : 'Fullscreen'}
					</button>
				{/if}
				<div class="text-right text-sm">
					{#if selectedTeam}
						<div class="font-semibold">{selectedTeam.name}</div>
					{/if}
					<div class="font-semibold">{myScore} pts</div>
				</div>
			</div>
		</header>

		<div class="kiosk-scroll min-h-0 flex-1 overflow-y-auto">
			{#if !connected}
				<div class="rounded-2xl bg-slate-900 p-5 text-center text-slate-200">Connecting…</div>
			{:else if !gameState}
				<div class="rounded-2xl bg-slate-900 p-5 text-center text-slate-200">Loading…</div>
			{:else if !joined}
				<section class="rounded-[2rem] border border-slate-800 bg-slate-900/95 p-5 shadow-2xl shadow-slate-950/40" in:fade>
					<div class="space-y-1 text-center">
						<h2 class="text-[1.4rem] font-semibold tracking-[0.02em]">Choose your team</h2>
						<p class="text-sm text-slate-300">Only teams enabled by the admin and not already connected can join.</p>
					</div>

					{#if joinError}
						<p class="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
							{joinError}
						</p>
					{/if}

					{#if availableTeams.length > 0}
						<div class="mt-5 grid gap-3">
							{#each availableTeams as team (team.id)}
								<button
									type="button"
									class="flex items-center gap-4 rounded-[1.5rem] border border-slate-800 bg-slate-950/80 px-4 py-4 text-left transition hover:border-indigo-400/50 hover:bg-slate-900 disabled:cursor-wait disabled:opacity-60"
									disabled={Boolean(joiningTeamId)}
									onclick={() => joinGame(String(team.id))}
								>
									<div class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[1.25rem] border border-slate-800 bg-slate-900">
										{#if teamBadgeUrl(String(team.id))}
											<img
												src={teamBadgeUrl(String(team.id))!}
												alt={String(team.name)}
												class="h-full w-full object-cover"
												onerror={() => markBadgeMissing(String(team.id))}
											/>
										{:else}
											<div class="text-lg font-black uppercase tracking-[0.18em] text-slate-200">
												{String(team.name)
													.split(/\s+/)
													.slice(0, 2)
													.map((part) => part[0]?.toUpperCase() ?? '')
													.join('')}
											</div>
										{/if}
									</div>

									<div class="min-w-0 flex-1">
										<div class="text-[1.05rem] font-semibold text-slate-50">{team.name}</div>
										<div class="mt-1 text-sm text-slate-400">Current score: {team.score ?? 0} pts</div>
									</div>

									<div class="rounded-full bg-indigo-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-200">
										{joiningTeamId === team.id ? 'Joining' : 'Select'}
									</div>
								</button>
							{/each}
						</div>
					{:else}
						<div class="mt-5 rounded-[1.5rem] border border-slate-800 bg-slate-950/80 px-4 py-5 text-center text-sm text-slate-300">
							No enabled team is currently available. Wait for the admin to enable one or for a connected team to disconnect.
						</div>
					{/if}
				</section>
			{:else if gameState.status === 'lobby'}
				<section class="rounded-2xl bg-slate-900 p-5 text-center" in:fade>
					<div class="text-3xl">⏳</div>
					<h2 class="mt-2 text-xl font-semibold">Ready, {selectedTeam?.name}!</h2>
					<p class="mt-1 text-sm text-slate-300">Waiting for the host to start.</p>
					<div class="mt-4 rounded-xl bg-slate-950 px-4 py-3 text-sm text-slate-200">
						{enabledTeams.length} team(s) playing · {enabledTeams.filter((team: any) => team.connected).length} connected
					</div>
				</section>
			{:else if gameState.status == 'question' || gameState.status === 'reading'}
				{#if qcmUsesPhoneShell}
					<section class="mx-auto w-full max-w-[25rem]" in:fly={{ y: 14, duration: 200 }}>
						<div
							class="relative aspect-[434/776] overflow-hidden rounded-[2.5rem] shadow-[0_2rem_4rem_rgba(0,0,0,0.55)]"
						>
							<img
								src={appPath('/phone_bg.png')}
								alt=""
								class="pointer-events-none absolute inset-0 h-full w-full object-cover select-none"
								draggable="false"
							/>

							<div class="absolute top-[4.5%] right-[6%]">
								{#if gameState.status === 'reading'}
									<div
										class="animate-pulse rounded-full bg-slate-950/72 px-3 py-1 text-[0.68rem] font-black tracking-[0.22em] text-indigo-300 backdrop-blur-sm"
									>
										Reading
									</div>
								{:else}
									<div
										class="rounded-full bg-slate-950/72 px-3 py-1 text-sm font-black text-slate-100 backdrop-blur-sm"
										class:text-red-300={gameState.timer < 5}
									>
										{gameState.timer}s
									</div>
								{/if}
							</div>

							{#key q?.id}
								<QcmQuestion
									question={q as any}
									value={answer as any}
									onChange={handleAnswerChange}
									embeddedInPhoneShell
								/>
							{/key}

							{#if !contemplateMode}
								<div
									class="absolute inset-x-[8%] bottom-[4%] rounded-[1.1rem] bg-slate-950/62 px-4 py-2.5 text-center text-[0.8rem] text-slate-200 backdrop-blur-sm"
								>
									{#if hasSubmitted}
										Last action submitted{#if lastSubmittedTimeLeft !== null}
											at {lastSubmittedTimeLeft}s left{/if}.
									{:else}
										Not submitted yet.
									{/if}
								</div>
							{/if}
						</div>
					</section>
				{:else}
					<section class="space-y-4" in:fly={{ y: 14, duration: 200 }}>
						{#if !isPassiveQuestionType(qType)}
							<div class="flex justify-end">
								{#if gameState.status === 'reading'}
									<div
										class="animate-pulse rounded-full bg-slate-900/90 px-3 py-1 text-xs font-bold text-indigo-300 backdrop-blur-sm"
									>
										READING
									</div>
								{:else}
									<div
										class="rounded-full bg-slate-900/90 px-3 py-1 text-sm font-bold text-slate-100 backdrop-blur-sm"
										class:text-red-300={gameState.timer < 5}
									>
										{gameState.timer}s
									</div>
								{/if}
							</div>
						{/if}

						{#key q?.id}
							<PlayerQuestionRenderer
								status={gameState.status}
								question={q}
								karaokeSync={{
									serverNow: gameState.serverNow ?? null,
									questionStartedAt: gameState.questionStartedAt ?? null
								}}
								value={answer}
								onChange={handleAnswerChange}
								onAutoSubmit={autoSubmit}
							/>
						{/key}

						{#if !contemplateMode}
							<div class="rounded-2xl bg-slate-900 p-4 text-center text-sm text-slate-300">
								{#if hasSubmitted}
									Last action submitted{#if lastSubmittedTimeLeft !== null}
										at {lastSubmittedTimeLeft}s left{/if}.
								{:else}
									Not submitted yet.
								{/if}
							</div>
						{/if}
					</section>
				{/if}
			{:else if gameState.status === 'reveal' || gameState.status === 'review'}
				<section
					class="rounded-2xl p-5 text-center"
					class:bg-emerald-900={gameState.status === 'review' && reviewFeedback === 'perfect'}
					class:bg-amber-900={gameState.status === 'review' && reviewFeedback === 'partial'}
					class:bg-rose-900={gameState.status === 'review' && reviewFeedback === 'wrong'}
					class:bg-slate-900={gameState.status === 'reveal' || reviewFeedback === 'none'}
					in:fade
				>
					{#if gameState.status === 'reveal'}
						<div class="text-4xl">🎞️</div>
						<h2 class="mt-2 text-2xl font-extrabold">Answer reveal</h2>
						<p class="mt-1 text-sm text-slate-300">Look at the projector while the options are shown one by one.</p>
					{:else if reviewFeedback === 'perfect'}
						<div class="text-4xl">✅</div>
						<h2 class="mt-2 text-2xl font-extrabold">Perfect</h2>
						<p class="mt-1 text-sm text-emerald-100">Max points!</p>
					{:else if reviewFeedback === 'partial'}
						<div class="text-4xl">🟨</div>
						<h2 class="mt-2 text-2xl font-extrabold">Good… but not that good</h2>
						<p class="mt-1 text-sm text-amber-100">Close! You still scored.</p>
					{:else if reviewFeedback === 'wrong'}
						<div class="text-4xl">❌</div>
						<h2 class="mt-2 text-2xl font-extrabold">Bad answer</h2>
						<p class="mt-1 text-sm text-rose-100">Better luck next question.</p>
					{:else}
						<div class="text-4xl">⏱️</div>
						<h2 class="mt-2 text-2xl font-extrabold">Round finished</h2>
						<p class="mt-1 text-sm text-slate-300">Look at the projector for the answer.</p>
					{/if}

					{#if gameState.status === 'review' && myLastPoints !== null}
						<div class="mt-4 text-sm text-slate-100">
							Points this round:
							<span class="font-semibold">{myLastPoints}</span>
							{#if qType === 'estimate' && estimateMaxPoints !== null}
								<span class="text-slate-200"> / {estimateMaxPoints}</span>
							{/if}
							{#if qType === 'fastFingers' && fastFingersMaxPoints !== null && fastFingersMaxPoints > 0}
								<span class="text-slate-200"> / {fastFingersMaxPoints}</span>
							{/if}
						</div>
					{/if}
					<div class="mt-3 rounded-xl bg-slate-950/60 px-4 py-3 text-sm text-slate-50">
						Total score: <span class="font-semibold">{myScore}</span>
					</div>
				</section>
			{:else if gameState.status === 'finished'}
				<section class="rounded-2xl bg-slate-900 p-5 text-center" in:fade>
					<div class="text-3xl">🏁</div>
					<h2 class="mt-2 text-xl font-semibold">Game over</h2>
					<p class="mt-1 text-sm text-slate-300">Thanks for playing.</p>
					<div class="mt-4 rounded-xl bg-slate-950 px-4 py-3 text-sm text-slate-200">
						Final score: <span class="font-semibold">{myScore}</span>
					</div>
				</section>
			{/if}
		</div>
	</div>
</main>
