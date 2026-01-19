<script lang="ts">
	import ProjectorQuestionRenderer from '$lib/components/quiz/projector/ProjectorQuestionRenderer.svelte';

	type GameState = {
		status?: string;
		players?: Record<string, any>;
		question?: any;
		roundSummary?: any;
		answerCount?: number;
		timer?: number;
	};

	const {
		gameState,
		joinUrl,
		joinQrDataUrl,
		correctPlayers,
		wrongPlayers,
		sortedPlayers,
		onMediaFinished
	} = $props<{
		gameState: GameState | null;
		joinUrl: string | null;
		joinQrDataUrl: string | null;
		correctPlayers: any[];
		wrongPlayers: any[];
		sortedPlayers: any[];
		onMediaFinished: () => void;
	}>();
</script>

<div class="screen">
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
	{:else if gameState.status === 'reading' || gameState.status === 'question' || gameState.status === 'review'}
		<div class="{gameState.status}-view">
			<ProjectorQuestionRenderer
				status={gameState.status}
				question={gameState.question}
				roundSummary={gameState.roundSummary}
				{onMediaFinished}
			/>
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
</div>
<div class="vignette-overlay"></div>

<style>
	.screen {
		position: absolute;
		width: 100%;
		height: 100%;
		background-blend-mode: normal, multiply;
		overflow: hidden;
		margin: 0;
		border-radius: 2rem;
		box-shadow: inset 0 0 50px rgba(0, 0, 0, 1);
	}

	.vignette-overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 101%;
		background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0) 60%, rgba(0, 0, 0, 1) 100%);
	}

	.join-qr-container {
		margin-bottom: 2rem;
		text-align: center;
		display: flex;
		justify-content: center;
	}

	.join-qr {
		width: 16rem;
		height: 16rem;
		background: white;
		border-radius: 0.75rem;
		padding: 0.75rem;
		filter: invert(1);
		mix-blend-mode: screen;
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

	.loading {
		font-size: 2rem;
		color: #cbd5e1;
	}

	.lobby {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.lobby h1 {
		font-size: 3.5rem;
		margin-bottom: 1rem;
	}
	.url {
		font-size: 1.8rem;
	}

	.question-view {
		width: 100%;
		max-width: 100%;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	:global(.q-text) {
		font-size: 3rem;
		margin-bottom: 2rem;
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
