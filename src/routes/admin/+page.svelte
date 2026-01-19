<script lang="ts">
	import type PartySocket from 'partysocket';
	import { createQuizSocket } from '$lib/partykit/client.svelte';

	// socket must be non-reactive to avoid re-triggering $effect when assigned
	let socket: PartySocket | null = null;
	let gameState = $state(null as any);
	let questions: Array<{
		index: number;
		questionIndex?: number | null;
		mediaIndex?: number | null;
		id?: string;
		question?: string;
		type?: string;
		time?: number;
	}> = $state([]);
	let connected = $state(false);

	$effect(() => {
		const s = createQuizSocket({ role: 'admin' });
		socket = s;

		s.onopen = () => {
			connected = true;
			s.send(JSON.stringify({ type: 'admin_get_questions' }));
		};
		s.onclose = () => (connected = false);
		s.onmessage = (evt) => {
			const msg = JSON.parse(evt.data);
			if (msg.type === 'state') {
				gameState = msg.data;
			}
			if (msg.type === 'admin_questions') {
				questions = Array.isArray(msg.data) ? msg.data : [];
			}
		};

		return () => {
			s.close();
			socket = null;
		};
	});

	function startGame() {
		socket?.send(JSON.stringify({ type: 'admin_start' }));
	}

	function nextQuestion() {
		socket?.send(JSON.stringify({ type: 'admin_next' }));
	}

	function finishRoundNow() {
		socket?.send(JSON.stringify({ type: 'admin_finish_round' }));
	}

	function resetGameToLobby() {
		console.log("Resetting game to lobby");
		if (!confirm('Reset the game and go back to the lobby? Scores will be reset.')) return;
		socket?.send(JSON.stringify({ type: 'admin_reset' }));
	}

	function vibrateAll() {
		socket?.send(JSON.stringify({ type: 'admin_vibrate' }));
	}

	function removeOfflinePlayers() {
		socket?.send(JSON.stringify({ type: 'admin_remove_offline' }));
	}

	function removeAllPlayers() {
		if (!confirm('Remove ALL players? This cannot be undone.')) return;
		socket?.send(JSON.stringify({ type: 'admin_remove_all' }));
	}

	function removePlayer(id: string) {
		if (!confirm(`Remove player ${id}?`)) return;
		socket?.send(JSON.stringify({ type: 'admin_remove_player', playerId: id }));
	}

	function clearLocalStorage() {
		if (!confirm('Clear local storage and reload? This will reset your identity.')) return;
		localStorage.clear();
		sessionStorage.clear();
		location.reload();
	}

	function jumpToQuestion(index: number) {
		socket?.send(JSON.stringify({ type: 'admin_jump', index }));
	}

	function lastSeenLabel(ts: any) {
		const n = Number(ts);
		if (!Number.isFinite(n) || n <= 0) return '';
		const sec = Math.max(0, Math.round((Date.now() - n) / 1000));
		if (sec < 5) return 'just now';
		if (sec < 60) return `${sec}s ago`;
		const min = Math.round(sec / 60);
		return `${min}m ago`;
	}

	const status = $derived(String(gameState?.status ?? ''));
	const statusPill = $derived.by(() => {
		switch (status) {
			case 'lobby':
				return 'bg-slate-500/15 text-slate-200 ring-slate-400/20';
			case 'question':
				return 'bg-indigo-500/15 text-indigo-100 ring-indigo-400/20';
			case 'review':
				return 'bg-amber-500/15 text-amber-100 ring-amber-400/20';
			case 'finished':
				return 'bg-emerald-500/15 text-emerald-100 ring-emerald-400/20';
			default:
				return 'bg-white/5 text-slate-200 ring-white/10';
		}
	});

	const connectedDot = $derived(connected ? 'bg-emerald-400' : 'bg-rose-400');

	const currentQuestionLine = $derived.by(() => {
		const q = gameState?.question;
		if (!q) return '—';
		const text = Array.isArray(q.question) ? q.question.join(' ') : String(q.question ?? '');
		const type = String(q.type ?? '');
		const timer = type === 'media' ? '—' : `${gameState?.timer ?? 0}s`;
		return `${text} · ${type}${type ? '' : '—'} · ${timer}`;
	});

	const btnBase =
		'inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40';
	const btnPrimary = `${btnBase} bg-indigo-500/15 text-indigo-100 ring-indigo-400/20 hover:bg-indigo-500/20`;
	const btnDanger = `${btnBase} bg-rose-500/15 text-rose-100 ring-rose-400/20 hover:bg-rose-500/20`;
	const btnNeutral = `${btnBase} bg-white/5 text-slate-100 ring-white/10 hover:bg-white/10`;
</script>

<div class="min-h-screen w-full">
	<header
		class="sticky top-0 z-10 border-b border-white/10 bg-black/30 px-4 py-3 backdrop-blur"
	>
		<div class="flex items-center justify-between gap-3">
			<div class="flex min-w-0 items-center gap-2">
				<span
					class={`h-2.5 w-2.5 shrink-0 rounded-full ${connectedDot}`}
					title={connected ? 'Online' : 'Offline'}
				></span>
				<h1 class="truncate text-sm font-semibold tracking-wide text-slate-100">Admin</h1>
				<span
					class={`inline-flex items-center rounded-md px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ring-1 ring-inset ${statusPill}`}
				>
					{status || '—'}
				</span>
			</div>

			<div class="flex items-center gap-2">
				{#if gameState?.status === 'lobby'}
					<button class={btnPrimary} onclick={startGame} title="Start game">
						<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M8 5v14l11-7z" />
						</svg>
						<span class="hidden sm:inline">Start</span>
					</button>
				{:else if gameState?.status === 'review' || gameState?.status === 'question' || gameState?.status === 'reading'}
					<button class={btnPrimary} onclick={nextQuestion} title="Next question / phase">
						<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
							{#if gameState.status === 'reading'}
								<title>Launch Timer</title>
								<circle cx="12" cy="12" r="10" />
								<polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
							{:else}
								<path d="M13 5l7 7-7 7" />
								<path d="M4 12h16" />
							{/if}
						</svg>
						<span class="hidden sm:inline">
							{gameState.status === 'reading' ? 'Launch' : 'Next'}
						</span>
					</button>
					{#if gameState?.status === 'question'}
						<button class={btnDanger} onclick={finishRoundNow} title="Finish round now">
							<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M6 6h12v12H6z" />
							</svg>
							<span class="hidden sm:inline">Finish</span>
						</button>
					{/if}
				{/if}

				<button class={btnDanger} onclick={resetGameToLobby} title="Reset game to lobby">
					<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M3 12a9 9 0 1 0 3-6.7" />
						<path d="M3 4v5h5" />
					</svg>
					<span class="hidden sm:inline">Reset</span>
				</button>

				<button class={btnNeutral} onclick={removeOfflinePlayers} title="Remove offline players">
					<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M16 11c1.7 0 3 1.3 3 3v5" />
						<path d="M8 11c-1.7 0-3 1.3-3 3v5" />
						<path d="M12 12c2.2 0 4-1.8 4-4S14.2 4 12 4 8 5.8 8 8s1.8 4 4 4z" />
					</svg>
					<span class="hidden sm:inline">Clean</span>
				</button>

				<button class={btnNeutral} onclick={vibrateAll} title="Vibrate all phones">
					<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
						<path d="M20 9c1 1 1 5 0 6" />
						<path d="M4 9c-1 1-1 5 0 6" />
					</svg>
					<span class="hidden sm:inline">Buzz</span>
				</button>

				<button class={btnDanger} onclick={removeAllPlayers} title="Remove all players">
					<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M3 6h18" />
						<path d="M8 6V4h8v2" />
						<path d="M6 6l1 16h10l1-16" />
					</svg>
					<span class="hidden sm:inline">Clear</span>
				</button>

				<button class={btnDanger} onclick={clearLocalStorage} title="Clear Local Storage">
					<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M3 6h18" />
						<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
					</svg>
					<span class="hidden sm:inline">Storage</span>
				</button>
			</div>
		</div>

		<div class="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-300">
			<div class="min-w-0 truncate" title={currentQuestionLine}>
				<span class="text-slate-400">Now:</span> {currentQuestionLine}
			</div>
			<div class="flex items-center gap-3">
				<span title="Players">
					<span class="text-slate-400">Players:</span>
					{Object.keys(gameState?.players || {}).length}
				</span>
				<span title="Answers">
					<span class="text-slate-400">Answers:</span>
					{gameState?.answerCount ?? 0}
				</span>
			</div>
		</div>
	</header>

	<main class="px-4 py-4">
		{#if gameState}
			<div class="grid gap-4 lg:grid-cols-2">
				<section class="rounded-md border border-white/10 bg-white/5">
					<div class="flex items-center justify-between border-b border-white/10 px-3 py-2">
						<h2 class="text-xs font-semibold uppercase tracking-wide text-slate-200">
							Questions
						</h2>
						<span class="text-xs text-slate-400"
							>{questions.length || gameState.totalQuestions || 0}</span
						>
					</div>

					{#if questions.length}
						<ol class="max-h-[70vh] overflow-auto p-2">
							{#each questions as q (q.index)}
								<li class="mb-1 last:mb-0">
									<button
										onclick={() => jumpToQuestion(q.index)}
										class={
											q.index === gameState.questionIndex
												? 'w-full rounded-md border border-indigo-400/25 bg-indigo-500/10 px-3 py-2 text-left text-xs text-slate-100'
												: 'w-full rounded-md border border-white/10 bg-black/10 px-3 py-2 text-left text-xs text-slate-100 hover:bg-white/5'
										}
									>
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0">
												<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
													<span class="text-[0.7rem] font-semibold text-slate-300">#{q.index + 1}</span>
													{#if q.questionIndex !== null}
														<span class="rounded-md bg-white/5 px-1.5 py-0.5 text-[0.65rem] font-semibold text-slate-200"
															>Q{q.questionIndex! + 1}</span
														>
													{/if}
													{#if q.mediaIndex !== null}
														<span class="rounded-md bg-white/5 px-1.5 py-0.5 text-[0.65rem] font-semibold text-slate-200"
															>M{q.mediaIndex! + 1}</span
														>
													{/if}
												</div>
												<div class="mt-1 min-w-0 truncate text-xs text-slate-100">
													{q.question || '—'}
												</div>
												<div class="mt-1 text-[0.7rem] text-slate-400">
													{q.type || ''}{q.time ? ` · ${q.time}s` : ''}
												</div>
											</div>
										</div>
									</button>
								</li>
							{/each}
						</ol>
					{:else}
						<p class="p-3 text-xs text-slate-400">Question list not loaded yet.</p>
					{/if}
				</section>

				<section class="rounded-md border border-white/10 bg-white/5">
					<div class="flex items-center justify-between border-b border-white/10 px-3 py-2">
						<h2 class="text-xs font-semibold uppercase tracking-wide text-slate-200">Players</h2>
						<span class="text-xs text-slate-400">{Object.keys(gameState.players || {}).length}</span>
					</div>

					<ul class="max-h-[70vh] overflow-auto divide-y divide-white/5">
						{#each Object.values(gameState.players || {}) as any[] as p}
							<li class="px-3 py-2">
								<div class="flex items-center justify-between gap-3">
									<div class="min-w-0">
										<div class="flex items-center gap-2">
											<span
												class={
													p.connected
														? 'h-2 w-2 rounded-full bg-emerald-400'
														: 'h-2 w-2 rounded-full bg-slate-500'
												}
												title={p.connected ? 'Online' : 'Offline'}
											></span>
											<span class="truncate text-xs font-semibold text-slate-100">{p.name}</span>
											<span class="text-[0.7rem] text-slate-400">{p.score} pts</span>
											{#if gameState.status === 'question'}
												<span
													class={
														p.answered
															? 'h-2 w-2 rounded-full bg-emerald-400'
															: 'h-2 w-2 rounded-full bg-rose-400'
													}
													title={p.answered ? 'Answered' : 'Not answered'}
												></span>
											{/if}
										</div>

										<div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-slate-400">
											{#if gameState.status === 'question' && p.lastAnswerTimeLeft !== null && p.lastAnswerTimeLeft !== undefined}
												<span title="Time left when submitted">{p.lastAnswerTimeLeft}s left</span>
											{/if}
											{#if p.lastSeen}
												<span title="Last seen">{lastSeenLabel(p.lastSeen)}</span>
											{/if}
										</div>
									</div>

									<button
										onclick={() => removePlayer(p.id)}
										class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/5 text-slate-200 ring-1 ring-inset ring-white/10 hover:bg-white/10"
										title="Remove player"
									>
										<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
											<path d="M3 6h18" />
											<path d="M8 6V4h8v2" />
											<path d="M6 6l1 16h10l1-16" />
										</svg>
									</button>
								</div>
							</li>
						{/each}
					</ul>
				</section>
			</div>
		{:else}
			<div class="rounded-md border border-white/10 bg-white/5 p-4 text-xs text-slate-300">
				Loading state…
			</div>
		{/if}
	</main>
</div>
