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
		if (!confirm('Reset the game and go back to the lobby? Scores will be reset.')) return;
		socket?.send(JSON.stringify({ type: 'admin_reset' }));
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
</script>

<div class="admin-panel">
	<h1>Admin Control</h1>

	<div class="status-indicator" class:on={connected}>
		{connected ? 'Connected' : 'Disconnected'}
	</div>

	{#if gameState}
		<div class="dashboard">
			<section class="game-state">
				<h2>Game Status: <span class="badge">{gameState.status}</span></h2>

				{#if gameState.question}
					<div class="current-q">
						<h3>Current Q: {gameState.question.question}</h3>
						<p>Type: {gameState.question.type}</p>
						<p>Timer: {gameState.question.type === 'media' ? '—' : `${gameState.timer}s`}</p>
					</div>
				{/if}

				<div class="controls">
					{#if gameState.status === 'lobby'}
						<button onclick={startGame}>Start Game</button>
						<button class="danger" onclick={resetGameToLobby}>Reset game (stay in lobby)</button>
					{:else if gameState.status === 'review' || gameState.status === 'question'}
						<button onclick={nextQuestion}>Next Question / Phase</button>
						{#if gameState.status === 'question'}
							<button class="danger" onclick={finishRoundNow}>Finish round now</button>
						{/if}
						<button class="danger" onclick={resetGameToLobby}>Reset game (back to lobby)</button>
					{/if}
					<div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
						<button onclick={removeOfflinePlayers}>Remove offline players</button>
						<button class="danger" onclick={removeAllPlayers}>Remove ALL players</button>
					</div>
				</div>
			</section>

			<section class="questions">
				<h3>Questions ({questions.length || gameState.totalQuestions || 0})</h3>
				{#if questions.length}
					<ol>
						{#each questions as q (q.index)}
							<li class:current={q.index === gameState.questionIndex}>
								<button onclick={() => jumpToQuestion(q.index)}>
									<span class="inum">#{q.index + 1}</span>
									{#if q.questionIndex !== null}<span class="qnum"
											>Q{q.questionIndex! + 1}</span
										>{/if}
									{#if q.mediaIndex !== null}<span class="mnum"
											>M{q.mediaIndex! + 1}</span
										>{/if}
									<span class="qtext">{q.question || '—'}</span>
									<span class="qmeta">{q.type || ''}{q.time ? ` · ${q.time}s` : ''}</span>
								</button>
							</li>
						{/each}
					</ol>
				{:else}
					<p class="muted">Question list not loaded yet.</p>
				{/if}
			</section>

			<section class="players">
				<h3>Players ({Object.keys(gameState.players || {}).length})</h3>
				<ul>
					{#each Object.values(gameState.players || {}) as any[] as p}
						<li>
							<span class="pname">{p.name}</span>
							<span class="pmeta">{p.score}pts</span>
							<span class="pmeta">{p.connected ? 'online' : 'offline'}</span>
							<button class="small" onclick={() => removePlayer(p.id)}>Remove</button>
							{#if gameState.status === 'question'}
								<span class="pmeta" class:answered={p.answered}>
									{p.answered ? 'answered' : 'not answered'}
								</span>
								{#if p.lastAnswerTimeLeft !== null && p.lastAnswerTimeLeft !== undefined}
									<span class="pmeta">({p.lastAnswerTimeLeft}s left)</span>
								{/if}
							{/if}
							{#if p.lastSeen}
								<span class="pmeta">({lastSeenLabel(p.lastSeen)})</span>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		</div>
	{:else}
		<p>Loading state...</p>
	{/if}
</div>

<style>
	.admin-panel {
		width: 100%;
		height: 100%;
		padding: 12px;
		box-sizing: border-box;
		font-family: Inter, sans-serif;
		overflow: auto;
		background: linear-gradient(180deg, #07070a 0%, #0b0b0d 100%);
		color: #e6eef8;
	}
	.status-indicator {
		color: #ef4444;
		margin-bottom: 12px;
		font-weight: 700;
	}
	.status-indicator.on {
		color: #34d399;
	}

	.dashboard {
		display: grid;
		gap: 20px;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
	}
	.game-state {
		background: #0f1724;
		padding: 16px;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.04);
		color: #e6eef8;
	}
	.controls button {
		padding: 10px 16px;
		font-size: 1rem;
		cursor: pointer;
		background: linear-gradient(180deg, #4f46e5, #4338ca);
		color: white;
		border: none;
		border-radius: 8px;
	}
	.controls button:hover {
		filter: brightness(1.05);
	}
	.controls .danger {
		background: linear-gradient(180deg, #dc2626, #b91c1c);
	}
	.controls .danger:hover {
		filter: brightness(1.05);
	}

	.questions {
		background: #0f1724;
		padding: 16px;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.04);
		color: #e6eef8;
	}
	.questions ol {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 8px;
		max-height: 60vh;
		overflow: auto;
	}
	.questions li button {
		width: 100%;
		text-align: left;
		padding: 10px 12px;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.04);
		background: rgba(255, 255, 255, 0.02);
		color: #e6eef8;
		cursor: pointer;
	}
	.questions li.current button {
		border-color: #7c3aed;
		box-shadow: 0 6px 18px rgba(124, 58, 237, 0.12);
	}

	button.small {
		margin-left: 8px;
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.04);
		color: #e6eef8;
		padding: 4px 8px;
		border-radius: 6px;
		cursor: pointer;
	}
	.qnum,.mnum {
		font-weight: 700;
		margin-right: 8px;
	}
	.qtext {
		display: inline;
	}
	.qmeta {
		display: block;
		color: #9fb0c8;
		font-size: 0.9rem;
		margin-top: 4px;
	}
	.muted {
		color: #9fb0c8;
	}

	.badge {
		background: rgba(255, 255, 255, 0.04);
		padding: 4px 8px;
		border-radius: 6px;
		font-size: 0.85em;
		text-transform: uppercase;
		color: #dbeafe;
	}

	.players ul {
		list-style: none;
		padding: 0;
	}
	.players li {
		padding: 10px 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.03);
	}
	.pname {
		font-weight: 700;
		color: #f8fafc;
	}
	.pmeta {
		margin-left: 8px;
		color: #9fb0c8;
	}
	.answered {
		color: #0f766e;
		font-weight: 700;
	}
</style>
