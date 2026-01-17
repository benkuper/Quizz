<script lang="ts">
	import type PartySocket from 'partysocket';
	import ProjectorQuestionRenderer from '$lib/components/quiz/projector/ProjectorQuestionRenderer.svelte';
	import { toDataURL } from 'qrcode';
	import { createQuizSocket } from '$lib/partykit/client.svelte';

	let gameState: any = $state(null);
	let socket: PartySocket | null = $state(null);
	let lastAutoAdvanceQuestionId: string | null = $state(null);
	let joinUrl = typeof window !== 'undefined' ? `${location.origin}` : null
	let joinQrDataUrl: string | null = $state(null);

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


	$effect(() => {
		if (!joinUrl) return;
		let cancelled = false;

		(async () => {
			const dataUrl = await toDataURL(joinUrl, {
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

<main class="projector">
	<div class="layout">
		<section class="stage">
			{#if !gameState}
				<div class="loading">Connecting to Quiz Server...</div>
			{:else if gameState.status === 'lobby'}
				<div class="lobby">
					<h1>Join the Quiz!</h1>
					<p class="url">Go to <strong>{joinUrl}</strong></p>

					<div class="join-qr-container">
						{#if joinQrDataUrl}
							<img class="join-qr" src={joinQrDataUrl} alt="QR code to join the quiz" />
						{:else}
							<div class="join-qr placeholder">Generating QR…</div>
						{/if}
					</div>

					<p class="count">Players: {Object.keys(gameState.players || {}).length}</p>
				</div>
			{:else if gameState.status === 'question'}
				<div class="question-view">
					{#if String(gameState?.question?.type ?? '') !== 'media'}
						<div class="timer" class:urgent={gameState.timer < 5}>{gameState.timer}</div>
					{/if}
					<ProjectorQuestionRenderer
						status={gameState.status}
						question={gameState.question}
						roundSummary={gameState.roundSummary}
						onMediaFinished={handleMediaFinished}
					/>

					<div class="answers-in">
						Answers: {gameState.answerCount} / {Object.keys(gameState.players).length}
					</div>
				</div>
			{:else if gameState.status === 'review'}
				<div class="review-view">
					<h2>Round results</h2>
					<ProjectorQuestionRenderer
						status={gameState.status}
						question={gameState.question}
						roundSummary={gameState.roundSummary}
					/>

					<div class="results">
						<div class="col">
							<h4>Correct</h4>
							<div class="pill-row">
								{#each correctPlayers as p (p.id)}
									<div class="res-pill ok">{p.name}</div>
								{/each}
								{#if correctPlayers.length === 0}
									<div class="res-pill neutral">—</div>
								{/if}
							</div>
						</div>
						<div class="col">
							<h4>Wrong</h4>
							<div class="pill-row">
								{#each wrongPlayers as p (p.id)}
									<div class="res-pill ko">{p.name}</div>
								{/each}
								{#if wrongPlayers.length === 0}
									<div class="res-pill neutral">—</div>
								{/if}
							</div>
						</div>
					</div>
				</div>
			{:else if gameState.status === 'finished'}
				<div class="leaderboard">
					<h1>Winner!</h1>
					{#if gameState.players}
						<ol>
							{#each sortedPlayers.slice(0, 5) as p: any}
								<li>
									<span class="name">{p.name}</span>
									<span class="score">{p.score} pts</span>
								</li>
							{/each}
						</ol>
					{:else}
						<p>No players</p>
					{/if}
				</div>
			{/if}
		</section>

		<aside class="players-panel">
			<h3>Players</h3>
			{#if !gameState}
				<div class="muted">—</div>
			{:else}
				<ul class="plist">
					{#each playersList as p (p.id)}
						<li
							class:online={p.connected}
							class:offline={!p.connected}
							class:ok={gameState.status === 'review' && p.lastCorrect === true}
							class:ko={gameState.status === 'review' && p.lastCorrect === false}
						>
							<div class="row">
								<span class="pname">{p.name}</span>
								<span class="score">{p.score}</span>
							</div>
							<div class="meta">
								<span class="tag">{p.connected ? 'online' : 'offline'}</span>
								{#if gameState.status === 'question'}
									<span class="tag" class:answered={p.answered}
										>{p.answered ? 'answered' : '…'}</span
									>
								{/if}
								{#if gameState.status === 'review' && p.lastCorrect !== null}
									<span class="tag">{p.lastCorrect ? 'correct' : 'wrong'}</span>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</aside>
	</div>
</main>

<style>
	:global(body) {
		margin: 0;
		background: #111;
		color: white;
		font-family: 'Inter', sans-serif;
	}

	.join-qr-container {
		margin-bottom: 2rem;
		text-align: center;
		display: flex;
		justify-content: center;
	}

	.join-qr {
		width: 14rem;
		height: 14rem;
		background: white;
		border-radius: 0.75rem;
		padding: 0.75rem;
		box-sizing: border-box;
		image-rendering: pixelated;
	}
	.join-qr.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		color: #cbd5e1;
		background: #0b0b0b;
		border: 1px solid #222;
		font-weight: 700;
		letter-spacing: 0.02em;
	}
	.projector {
		height: 100%;
		display: flex;
		align-items: stretch;
		box-sizing: border-box;
	}

	.layout {
		display: grid;
		grid-template-columns: 1fr 360px;
		width: 100%;
		height: 100%;
	}

	.stage {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 2rem;
		box-sizing: border-box;
	}

	.players-panel {
		border-left: 1px solid #222;
		background: #0b0b0b;
		padding: 18px;
		overflow: auto;
	}
	.players-panel h3 {
		margin: 0 0 12px;
		font-size: 1.2rem;
		color: #cbd5e1;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.plist {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.plist li {
		border: 1px solid #222;
		background: #111;
		border-radius: 14px;
		padding: 10px 12px;
	}
	.plist li.online {
		border-color: #1f2937;
	}
	.plist li.offline {
		opacity: 0.55;
	}
	.plist li.ok {
		border-color: #10b981;
	}
	.plist li.ko {
		border-color: #ef4444;
	}
	.plist .row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
	}
	.plist .pname {
		font-weight: 800;
	}
	.plist .score {
		color: #cbd5e1;
		font-weight: 800;
	}
	.plist .meta {
		margin-top: 6px;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.tag {
		font-size: 0.85rem;
		padding: 3px 10px;
		border-radius: 999px;
		background: #1f2937;
		color: #cbd5e1;
	}
	.tag.answered {
		background: #4f46e5;
		color: white;
	}
	.muted {
		color: #666;
	}

	.loading {
		font-size: 2rem;
		color: #666;
	}


	.lobby {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	
	.lobby h1 {
		font-size: 4rem;
		margin-bottom: 0.5em;
	}
	.url {
		font-size: 2rem;
		color: #4f46e5;
		margin-bottom: 2rem;
	}

	.question-view {
		width: 100%;
		max-width: 100%;
		box-sizing: border-box;
	}
	:global(.q-text) {
		font-size: 3rem;
		margin-bottom: 2rem;
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

	:global(.options) {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px;
	}
	:global(.option) {
		background: #222;
		padding: 30px;
		font-size: 1.5rem;
		border-radius: 12px;
		border: 2px solid #333;
	}

	:global(.ans-pill) {
		background: #10b981;
		color: white;
		display: inline-block;
		padding: 10px 20px;
		font-size: 2rem;
		border-radius: 12px;
		margin: 10px;
	}
	:global(.correct-answer) {
		margin-top: 14px;
	}

	.results {
		margin-top: 26px;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 18px;
		width: 100%;
		max-width: 100%;
	}
	.results h4 {
		margin: 0 0 10px;
		color: #cbd5e1;
		font-size: 1.2rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.pill-row {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.res-pill {
		padding: 10px 14px;
		border-radius: 999px;
		border: 2px solid #333;
		background: #111;
		font-size: 1.2rem;
		font-weight: 800;
	}
	.res-pill.ok {
		border-color: #10b981;
	}
	.res-pill.ko {
		border-color: #ef4444;
	}
	.res-pill.neutral {
		opacity: 0.6;
	}

	.leaderboard ol {
		font-size: 2.5rem;
		text-align: left;
		background: #222;
		padding: 40px 80px;
		border-radius: 20px;
	}
	.leaderboard li {
		margin: 20px 0;
		display: flex;
		justify-content: space-between;
		gap: 40px;
	}

	@keyframes pulse {
		50% {
			opacity: 0.5;
			transform: scale(0.95);
		}
	}
</style>
