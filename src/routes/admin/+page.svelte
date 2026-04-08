<script lang="ts">
	import type PartySocket from 'partysocket';
	import { createQuizSocket } from '$lib/partykit/client.svelte';
	import { getTeamBadgeUrl } from '$lib/quiz/teamAssets';

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
	let missingBadgeIds = $state([] as string[]);

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
			if (msg.type === 'state') gameState = msg.data;
			if (msg.type === 'admin_questions') questions = Array.isArray(msg.data) ? msg.data : [];
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

	function focusOption(index: number) {
		socket?.send(JSON.stringify({ type: 'admin_focus_option', index }));
	}

	function finishRoundNow() {
		socket?.send(JSON.stringify({ type: 'admin_finish_round' }));
	}

	function resetGameToLobby() {
		if (!confirm('Reset the game to the lobby? Scores and team assignments will stay.')) return;
		socket?.send(JSON.stringify({ type: 'admin_reset' }));
	}

	function resetAssignments() {
		if (!confirm('Reset all team assignments? Scores will stay, but teams will need to reselect.')) return;
		socket?.send(JSON.stringify({ type: 'admin_reset_assignments' }));
	}

	function vibrateAll() {
		socket?.send(JSON.stringify({ type: 'admin_vibrate' }));
	}

	function disconnectTeam(id: string, name: string) {
		if (!confirm(`Disconnect ${name}?`)) return;
		socket?.send(JSON.stringify({ type: 'admin_remove_player', playerId: id }));
	}

	function toggleTeamEnabled(id: string, enabled: boolean) {
		socket?.send(JSON.stringify({ type: 'admin_set_team_enabled', teamId: id, enabled }));
	}

	function clearLocalStorage() {
		if (!confirm('Clear local storage and reload? This only affects this admin browser.')) return;
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

	function markBadgeMissing(teamId: string) {
		if (missingBadgeIds.includes(teamId)) return;
		missingBadgeIds = [...missingBadgeIds, teamId];
	}

	function teamBadgeUrl(teamId: string) {
		if (missingBadgeIds.includes(teamId)) return null;
		return getTeamBadgeUrl(teamId);
	}

	const status = $derived(String(gameState?.status ?? ''));
	const statusPill = $derived.by(() => {
		switch (status) {
			case 'lobby':
				return 'bg-slate-500/15 text-slate-200 ring-slate-400/20';
			case 'question':
				return 'bg-indigo-500/15 text-indigo-100 ring-indigo-400/20';
			case 'reveal':
				return 'bg-fuchsia-500/15 text-fuchsia-100 ring-fuchsia-400/20';
			case 'review':
				return 'bg-amber-500/15 text-amber-100 ring-amber-400/20';
			case 'finished':
				return 'bg-emerald-500/15 text-emerald-100 ring-emerald-400/20';
			default:
				return 'bg-white/5 text-slate-200 ring-white/10';
		}
	});

	const connectedDot = $derived(connected ? 'bg-emerald-400' : 'bg-rose-400');
	const teamEntries = $derived.by(() =>
		gameState?.players
			? [...(Object.values(gameState.players) as any[])].sort(
				(a: any, b: any) => Number(b.enabled) - Number(a.enabled) || String(a.name).localeCompare(String(b.name))
			)
			: []
	);
	const enabledTeamsCount = $derived(teamEntries.filter((team: any) => team.enabled).length);
	const connectedTeamsCount = $derived(teamEntries.filter((team: any) => team.enabled && team.connected).length);

	const currentQuestionLine = $derived.by(() => {
		const q = gameState?.question;
		if (!q) return '—';
		const text = Array.isArray(q.question) ? q.question.join(' ') : String(q.question ?? '');
		const type = String(q.type ?? '');
		const timer = type === 'media' ? '—' : `${gameState?.timer ?? 0}s`;
		return `${text} · ${type}${type ? '' : '—'} · ${timer}`;
	});

	const btnBase =
		'inline-flex items-center justify-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40';
	const btnPrimary = `${btnBase} bg-indigo-500/15 text-indigo-100 ring-indigo-400/20 hover:bg-indigo-500/20`;
	const btnDanger = `${btnBase} bg-rose-500/15 text-rose-100 ring-rose-400/20 hover:bg-rose-500/20`;
	const btnNeutral = `${btnBase} bg-white/5 text-slate-100 ring-white/10 hover:bg-white/10`;
	const optionLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	const currentQuestionOptions = $derived.by(() =>
		Array.isArray(gameState?.question?.options) ? gameState.question.options.map(String) : []
	);
	const optionReveal = $derived.by(() => gameState?.optionReveal ?? null);
	const allRevealOptionsPlaced = $derived.by(() => {
		const placed = optionReveal?.placedOptionIndexes ?? [];
		const total = optionReveal?.totalOptions ?? 0;
		return total > 0 && placed.length >= total;
	});
	const nextButtonLabel = $derived.by(() => {
		if (gameState?.status === 'reading') {
			return gameState?.question?.separateReveal ? 'Start reveal' : 'Launch';
		}
		if (gameState?.status === 'reveal') {
			if (optionReveal?.focusedOptionIndex !== null) return 'Place';
			if (!allRevealOptionsPlaced) return 'Show option';
			return 'Start countdown';
		}
		return 'Next';
	});

	function optionAdminLabel(index: number) {
		if (String(gameState?.question?.type ?? '') === 'qcm') {
			return optionLabels[index] ?? String(index + 1);
		}
		return String(index + 1);
	}
</script>

<div class="min-h-screen w-full">
	<header class="sticky top-0 z-10 border-b border-white/10 bg-black/30 px-4 py-3 backdrop-blur">
		<div class="flex items-center justify-between gap-3">
			<div class="flex min-w-0 items-center gap-2">
				<span class={`h-2.5 w-2.5 shrink-0 rounded-full ${connectedDot}`} title={connected ? 'Online' : 'Offline'}></span>
				<h1 class="truncate text-sm font-semibold tracking-wide text-slate-100">Admin</h1>
				<span class={`inline-flex items-center rounded-md px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ring-1 ring-inset ${statusPill}`}>
					{status || '—'}
				</span>
			</div>

			<div class="flex flex-wrap items-center justify-end gap-2">
				{#if gameState?.status === 'lobby'}
					<button class={btnPrimary} onclick={startGame} title="Start game">
						<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M8 5v14l11-7z" />
						</svg>
						<span class="hidden sm:inline">Start</span>
					</button>
				{:else if gameState?.status === 'review' || gameState?.status === 'question' || gameState?.status === 'reading' || gameState?.status === 'reveal'}
					<button class={btnPrimary} onclick={nextQuestion} title="Next question / phase">
						<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
							{#if gameState.status === 'reading'}
								<circle cx="12" cy="12" r="10" />
								<polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
							{:else if gameState.status === 'reveal' && optionReveal?.focusedOptionIndex !== null}
								<path d="M6 6h12v12H6z" />
							{:else}
								<path d="M13 5l7 7-7 7" />
								<path d="M4 12h16" />
							{/if}
						</svg>
						<span class="hidden sm:inline">{nextButtonLabel}</span>
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

				<button class={btnDanger} onclick={resetAssignments} title="Reset all team assignments">
					<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M12 3v6" />
						<path d="M6 9v5a6 6 0 0 0 12 0V9" />
						<path d="M9 6l3-3 3 3" />
					</svg>
					<span class="hidden sm:inline">Assignments</span>
				</button>

				<button class={btnNeutral} onclick={vibrateAll} title="Vibrate all phones">
					<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
						<path d="M20 9c1 1 1 5 0 6" />
						<path d="M4 9c-1 1-1 5 0 6" />
					</svg>
					<span class="hidden sm:inline">Buzz</span>
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
				<span title="Enabled teams"><span class="text-slate-400">Teams:</span> {connectedTeamsCount}/{enabledTeamsCount}</span>
				<span title="Answers"><span class="text-slate-400">Answers:</span> {gameState?.answerCount ?? 0}</span>
			</div>
		</div>

		{#if gameState?.status === 'reveal' && currentQuestionOptions.length > 0 && optionReveal}
			<div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
				<span class="text-slate-400">Reveal: {optionReveal.placedOptionIndexes.length}/{optionReveal.totalOptions}</span>
				{#each currentQuestionOptions as opt, index}
					<button
						onclick={() => focusOption(index)}
						disabled={!optionReveal.placedOptionIndexes.includes(index)}
						class={optionReveal.focusedOptionIndex === index ? btnPrimary : btnNeutral}
						title={opt}
					>
						Focus {optionAdminLabel(index)}
					</button>
				{/each}
			</div>
		{/if}
	</header>

	<main class="px-4 py-4">
		{#if gameState}
			<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr),minmax(0,1.15fr)]">
				<section class="rounded-md border border-white/10 bg-white/5">
					<div class="flex items-center justify-between border-b border-white/10 px-3 py-2">
						<h2 class="text-xs font-semibold uppercase tracking-wide text-slate-200">Questions</h2>
						<span class="text-xs text-slate-400">{questions.length || gameState.totalQuestions || 0}</span>
					</div>

					{#if questions.length}
						<ol class="max-h-[70vh] overflow-auto p-2">
							{#each questions as q (q.index)}
								<li class="mb-1 last:mb-0">
									<button
										onclick={() => jumpToQuestion(q.index)}
										class={q.index === gameState.questionIndex ? 'w-full rounded-md border border-indigo-400/25 bg-indigo-500/10 px-3 py-2 text-left text-xs text-slate-100' : 'w-full rounded-md border border-white/10 bg-black/10 px-3 py-2 text-left text-xs text-slate-100 hover:bg-white/5'}
									>
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0">
												<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
													<span class="text-[0.7rem] font-semibold text-slate-300">#{q.index + 1}</span>
													{#if q.questionIndex !== null}
														<span class="rounded-md bg-white/5 px-1.5 py-0.5 text-[0.65rem] font-semibold text-slate-200">Q{q.questionIndex! + 1}</span>
													{/if}
													{#if q.mediaIndex !== null}
														<span class="rounded-md bg-white/5 px-1.5 py-0.5 text-[0.65rem] font-semibold text-slate-200">M{q.mediaIndex! + 1}</span>
													{/if}
												</div>
												<div class="mt-1 min-w-0 truncate text-xs text-slate-100">{q.question || '—'}</div>
												<div class="mt-1 text-[0.7rem] text-slate-400">{q.type || ''}{q.time ? ` · ${q.time}s` : ''}</div>
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
						<h2 class="text-xs font-semibold uppercase tracking-wide text-slate-200">Teams</h2>
						<span class="text-xs text-slate-400">{enabledTeamsCount} enabled</span>
					</div>

					<ul class="max-h-[70vh] overflow-auto divide-y divide-white/5">
						{#each teamEntries as p (p.id)}
							<li class="px-3 py-3">
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<div class="flex items-center gap-3">
											<div class="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/20">
												{#if teamBadgeUrl(p.id)}
													<img src={teamBadgeUrl(p.id)!} alt={p.name} class:grayscale={!p.connected} class="h-full w-full object-cover" onerror={() => markBadgeMissing(p.id)} />
												{:else}
													<span class="text-xs font-black uppercase tracking-[0.18em] text-slate-200">{p.name.split(/\s+/).slice(0, 2).map((part: string) => part[0]?.toUpperCase() ?? '').join('')}</span>
												{/if}
											</div>
											<div class="min-w-0">
												<div class="flex flex-wrap items-center gap-2">
													<span class={p.enabled && p.connected ? 'h-2 w-2 rounded-full bg-emerald-400' : p.enabled ? 'h-2 w-2 rounded-full bg-slate-500' : 'h-2 w-2 rounded-full bg-amber-400'} title={p.enabled ? (p.connected ? 'Connected' : 'Available') : 'Disabled'}></span>
													<span class="truncate text-xs font-semibold text-slate-100">{p.name}</span>
													<span class="text-[0.7rem] text-slate-400">{p.score} pts</span>
													{#if p.enabled && gameState.status === 'question'}
														<span class={p.answered ? 'h-2 w-2 rounded-full bg-emerald-400' : 'h-2 w-2 rounded-full bg-rose-400'} title={p.answered ? 'Answered' : 'Not answered'}></span>
													{/if}
												</div>

												<div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-slate-400">
													<span>{p.enabled ? 'Playing' : 'Disabled'}</span>
													{#if gameState.status === 'question' && p.lastAnswerTimeLeft !== null && p.lastAnswerTimeLeft !== undefined}
														<span title="Time left when submitted">{p.lastAnswerTimeLeft}s left</span>
													{/if}
													{#if p.lastSeen}
														<span title="Last seen">{lastSeenLabel(p.lastSeen)}</span>
													{/if}
												</div>
											</div>
										</div>
									</div>

									<div class="flex shrink-0 flex-col items-end gap-2">
										<button onclick={() => toggleTeamEnabled(p.id, !p.enabled)} class={p.enabled ? btnNeutral : btnPrimary} title={p.enabled ? 'Disable team' : 'Enable team'}>{p.enabled ? 'Disable' : 'Enable'}</button>
										{#if p.connected}
											<button onclick={() => disconnectTeam(p.id, p.name)} class={btnDanger} title="Disconnect team">Disconnect</button>
										{/if}
									</div>
								</div>
							</li>
						{/each}
					</ul>
				</section>
			</div>
		{:else}
			<div class="rounded-md border border-white/10 bg-white/5 p-4 text-xs text-slate-300">Loading state…</div>
		{/if}
	</main>
</div>
