<script lang="ts">
	import type PartySocket from 'partysocket';
	import { fade, fly } from 'svelte/transition';
	import PlayerQuestionRenderer from '$lib/components/quiz/player/PlayerQuestionRenderer.svelte';
	import type { BroadcastState, QuizQuestion } from '$lib/quiz/types';
	import { createQuizSocket } from '$lib/partykit/client.svelte';
	import { HAPTICS, vibrate, type VibrationPattern } from '$lib/config/haptics.svelte';
	import { createAudioPlayer } from '$lib/utils/audio.svelte';
	import { createScreenWakeLock } from '$lib/utils/wakeLock.svelte';

	let socket: PartySocket | null = $state(null);
	let connected = $state(false);
	let connId: string | null = $state(null);
	let playerId: string | null = $state(null);
	let gameState: any = $state(null);

	let joined = $state(false);
	let username = $state('');
	let hasEverJoined = $state(false);
	let lastAutoRejoinAt = 0;

	let pingInterval: ReturnType<typeof setInterval> | null = null;

	// Haptics (phone vibration) — configurable via src/lib/config/haptics.svelte.ts
	let prevStatus: string | null = null;
	let prevQuestionId: string | null = null;
	let lastVibrationAt = 0;

	// Keep the screen awake on phones/tablets (best-effort, browser support varies).
	const wakeLock = createScreenWakeLock();

	// Optional per-question intro sound (played on players' phones when the question appears).
	const introSoundPlayer = createAudioPlayer();
	let lastIntroSoundKey: string | null = null;
	let pendingIntroSound: { src: string; key: string } | null = null;
	let audioUnlocked = $state(false);

	function markAudioUnlocked() {
		if (audioUnlocked) return;
		audioUnlocked = true;
		void tryPlayPendingIntroSound();
		void wakeLock.request();
	}

	async function tryPlayPendingIntroSound() {
		if (!pendingIntroSound) return;
		const { src, key } = pendingIntroSound;
		const ok = await introSoundPlayer.play(src);
		if (ok) {
			pendingIntroSound = null;
			lastIntroSoundKey = key;
		}
	}

	function requestIntroSoundPlay(src: string, key: string) {
		if (!src.trim()) return;
		if (lastIntroSoundKey === key) return;

		void introSoundPlayer.play(src).then((ok) => {
			if (ok) {
				pendingIntroSound = null;
				lastIntroSoundKey = key;
				return;
			}

			// Autoplay blocked (common after refresh) — remember and retry on next interaction.
			pendingIntroSound = { src, key };
		});
	}

	function handleInteraction() {
		markAudioUnlocked();
		// Standard buzz (200ms)
		vibrate(200);
	}

	function handleDoublePulse() {
		markAudioUnlocked();
		// Vibrate 100ms, wait 50ms, vibrate 100ms
		vibrate([100, 50, 100]);
	}
	// Fullscreen (best-effort): supported on most Android/desktop browsers.
	let canFullscreen = $state(false);
	let isFullscreen = $state(false);

	// Answer state
	let answer: unknown = $state(null);
	let hasSubmitted: boolean = $state(false);
	let lastSubmittedTimeLeft: number | null = $state(null);
	let lastSubmittedAt: number | null = $state(null);

	// if question is media, we enter "contemplate" mode (no UI)
	let contemplateMode = $derived(gameState?.question?.type === 'media');

	const hapticsAvailable = $derived.by(() => {
		return typeof navigator !== 'undefined' && typeof (navigator as any).vibrate === 'function';
	});
	const hapticsStatusLabel = $derived.by(() => {
		if (!hapticsAvailable) return '';
		return HAPTICS.enabled ? 'Vibration on' : 'Vibration off';
	});

	const myScore = $derived(
		(playerId && (gameState as BroadcastState | null)?.players?.[playerId]?.score) ?? 0
	);
	const myLastCorrect = $derived(
		(playerId && (gameState as BroadcastState | null)?.players?.[playerId]?.lastCorrect) ?? null
	);
	const myLastPoints = $derived(
		(playerId && (gameState as BroadcastState | null)?.players?.[playerId]?.lastPoints) ?? null
	);
	const q = $derived(
		((gameState as BroadcastState | null)?.question as QuizQuestion | undefined) ?? undefined
	);
	const qType = $derived(String(q?.type || ''));

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

	function getOrCreatePlayerId() {
		try {
			const stored = localStorage.getItem('quizz:playerId');
			if (stored) return stored;

			const created =
				typeof crypto !== 'undefined' && 'randomUUID' in crypto
					? crypto.randomUUID()
					: `${Date.now()}-${Math.random().toString(16).slice(2)}`;
			localStorage.setItem('quizz:playerId', created);
			return created;
		} catch {
			return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
		}
	}

	function loadName() {
		try {
			const stored = localStorage.getItem('quizz:name');
			if (stored) username = stored;
		} catch {
			// ignore
		}
	}

	function saveName() {
		try {
			localStorage.setItem('quizz:name', username);
		} catch {
			// ignore
		}
	}

	function resetAnswerUi() {
		answer = null;
		hasSubmitted = false;
		lastSubmittedTimeLeft = null;
		lastSubmittedAt = null;
	}

	function ensureJoined() {
		if (!socket || !connected) return;
		if (!username.trim()) return;
		if (!playerId) playerId = getOrCreatePlayerId();
		socket.send(JSON.stringify({ type: 'join', playerId, name: username.trim() }));
		hasEverJoined = true;
	}

	function startPings() {
		stopPings();
		pingInterval = setInterval(() => {
			if (!socket || !connected) return;
			// only ping once the user is (or tries to be) joined
			if (!playerId) return;
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
		loadName();

		// Allow auto-joining when `playerId` and/or `name` are provided in the URL (used by /allviews iframes)
		const params =
			typeof location !== 'undefined'
				? new URLSearchParams(location.search)
				: new URLSearchParams();
		const paramPid = params.get('playerId');
		const paramName = params.get('name');
		if (paramName) username = paramName;
		if (paramPid) {
			playerId = paramPid;
		} else {
			playerId = getOrCreatePlayerId();
		}

		const s = createQuizSocket();
		socket = s;

		s.onopen = () => {
			connected = true;
			// If URL supplied playerId/name, try to auto-join. Otherwise, join only when user picks a name.
			if (paramPid || username.trim()) ensureJoined();
			startPings();
		};

		s.onclose = () => {
			connected = false;
			connId = null;
			joined = false;
			stopPings();
		};

		s.onmessage = (evt) => {
			const msg = JSON.parse(evt.data);

			if (msg.type === 'hello') {
				connId = msg.id;
				return;
			}

			if (msg.type === 'state') {
				const prevQid = gameState?.question?.id;
				gameState = msg.data as BroadcastState;

				// Consider us joined only if the server state actually contains our playerId.
				const presentNow = Boolean(playerId && gameState?.players?.[playerId]);
				const becamePresent = presentNow && !joined;
				joined = presentNow;
				if (presentNow) hasEverJoined = true;

				// If we just (re)joined while a question is already active, play the intro sound for
				// this question as well (useful after kicks / reconnects).
				if (becamePresent) {
					const status = String((msg.data as any)?.status ?? '');
					const qid = typeof (msg.data as any)?.question?.id === 'string' ? (msg.data as any).question.id : '';
					const introSound =
						typeof (msg.data as any)?.question?.introSound === 'string'
							? String((msg.data as any).question.introSound)
							: '';
					const qIndex = Number((msg.data as any)?.questionIndex ?? -1);
					if (status === 'question' && introSound.trim() && qid) {
						requestIntroSoundPlay(introSound, `question:${qIndex}:${qid}`);
					}
				}

				// If the admin removed us while we stayed connected, automatically re-join
				// using the stored name (so the user doesn't have to retype it).
				if (!presentNow && hasEverJoined && connected && socket && username.trim()) {
					const now = Date.now();
					if (now - lastAutoRejoinAt > 1_500) {
						lastAutoRejoinAt = now;
						ensureJoined();
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
				if (typeof msg.submittedAt === 'number') lastSubmittedAt = msg.submittedAt;
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

	function joinGame() {
		if (!username.trim()) return;
		saveName();
		ensureJoined();
		joined = true;
	}

	function submitAnswer(payload: any) {
		if (!connected) return;
		if (!socket) return;
		socket.send(JSON.stringify({ type: 'submit_answer', answer: payload }));
	}

	function submitCurrent() {
		if (!q) return;
		if (qType === 'media') return;
		if (qType === 'estimate') {
			const n = Number(answer);
			if (!Number.isFinite(n)) return;
			submitAnswer(n);
			return;
		}
		submitAnswer(answer);
	}

	function autoSubmit(payload: unknown) {
		if (!q) return;
		if (qType === 'fastFingers') {
			submitAnswer(payload);
			return;
		}
		// default: no-op for other types
	}

	function canSubmit() {
		if (!q) return false;
		if (qType === 'media') return false;
		if (qType === 'estimate') return String(answer ?? '').trim().length > 0;
		if (qType === 'fastFingers') return false;
		if (Array.isArray(answer)) return answer.length > 0;
		return Boolean(answer);
	}

	function submitLabel() {
		return hasSubmitted ? 'Update submission' : 'Submit';
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
		<header class="mb-4 flex items-center justify-between">
			<div>
				<div class="text-xs text-slate-400">Quizz</div>
				<h1 class="text-lg font-semibold">Player</h1>
				{#if hapticsAvailable}
					<div class="mt-1 inline-flex items-center gap-2 text-[0.7rem] text-slate-400" ontouchstart={handleInteraction}>
						<span
							class={HAPTICS.enabled
								? 'h-2 w-2 rounded-full bg-emerald-400'
								: 'h-2 w-2 rounded-full bg-slate-500'}
							title={hapticsStatusLabel}
						></span>
						<span>{hapticsStatusLabel}</span>
					</div>
				{/if}
			</div>
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
				<div class="text-right">
					<div class="text-xs text-slate-400">{connected ? 'Online' : 'Offline'}</div>
					<div class="text-sm font-semibold">{myScore} pts</div>
				</div>
			</div>
		</header>

		<div class="kiosk-scroll min-h-0 flex-1 overflow-y-auto">
			{#if !connected}
				<div class="rounded-2xl bg-slate-900 p-5 text-center text-slate-200">Connecting…</div>
			{:else if !gameState}
				<div class="rounded-2xl bg-slate-900 p-5 text-center text-slate-200">Loading…</div>
			{:else if !joined}
				<section class="rounded-2xl bg-slate-900 p-5" in:fade>
					<h2 class="text-xl font-semibold">Join the game</h2>
					<p class="mt-1 text-sm text-slate-300">Pick a nickname (max 12 chars).</p>
					<form
						class="mt-4 space-y-3"
						onsubmit={(e) => {
							e.preventDefault();
							joinGame();
						}}
					>
						<input
							class="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-50 outline-none focus:border-indigo-400"
							placeholder="Nickname"
							maxlength="12"
							bind:value={username}
							required
						/>
						<button
							class="w-full rounded-xl bg-indigo-500 px-4 py-3 font-semibold text-white active:scale-[0.99] disabled:opacity-60"
							type="submit"
							disabled={!username.trim()}
						>
							Join
						</button>
					</form>
				</section>
			{:else if gameState.status === 'lobby'}
				<section class="rounded-2xl bg-slate-900 p-5 text-center" in:fade>
					<div class="text-3xl">⏳</div>
					<h2 class="mt-2 text-xl font-semibold">Ready, {username}!</h2>
					<p class="mt-1 text-sm text-slate-300">Waiting for the host to start.</p>
					<div class="mt-4 rounded-xl bg-slate-950 px-4 py-3 text-sm text-slate-200">
						{Object.keys(gameState.players || {}).length} player(s) connected
					</div>
				</section>
			{:else if gameState.status === 'question'}
				<section class="space-y-4" in:fly={{ y: 14, duration: 200 }}>
					<div class="rounded-2xl bg-slate-900 p-4">
						<div class="flex items-center justify-between">
							<div class="text-xs text-slate-400">
								Question {gameState.actualQuestionIndex} / {gameState.totalActualQuestions}
							</div>
							{#if qType !== 'media'}
								<div class="text-sm font-bold" class:text-red-400={gameState.timer < 5}>
									{gameState.timer}s
								</div>
							{/if}
						</div>
						<div class="mt-3 text-lg leading-snug font-semibold">{q?.question}</div>
					</div>

					{#key q?.id}
						<PlayerQuestionRenderer
							question={q}
							value={answer}
							onChange={(v) => (answer = v)}
							onAutoSubmit={autoSubmit}
						/>
					{/key}

					{#if qType !== 'fastFingers' && qType !== 'media'}
						<button
							class="w-full rounded-2xl bg-indigo-500 px-4 py-4 text-base font-bold text-white active:scale-[0.99] disabled:opacity-60"
							disabled={!canSubmit()}
							onclick={submitCurrent}
						>
							{submitLabel()}
						</button>
					{/if}

					{#if !contemplateMode}
						<div class="rounded-2xl bg-slate-900 p-4 text-center text-sm text-slate-300">
							{#if hasSubmitted}
								Submitted{#if lastSubmittedTimeLeft !== null}
									at {lastSubmittedTimeLeft}s left{/if}. You can still update until time runs out.
							{:else}
								Not submitted yet.
							{/if}
						</div>
					{/if}
				</section>
			{:else if gameState.status === 'review'}
				<section
					class="rounded-2xl p-5 text-center"
					class:bg-emerald-900={reviewFeedback === 'perfect'}
					class:bg-amber-900={reviewFeedback === 'partial'}
					class:bg-rose-900={reviewFeedback === 'wrong'}
					class:bg-slate-900={reviewFeedback === 'none'}
					in:fade
				>
					{#if reviewFeedback === 'perfect'}
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

					{#if myLastPoints !== null}
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
