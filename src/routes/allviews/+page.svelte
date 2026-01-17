<script lang="ts">
	import PartySocket from 'partysocket';
	import ProjectorQuestionRenderer from '$lib/components/quiz/projector/ProjectorQuestionRenderer.svelte';
	import PlayerQuestionRenderer from '$lib/components/quiz/player/PlayerQuestionRenderer.svelte';

	const PARTYKIT_PORT = 1999;
	function getPartykitHost() {
		const override = (import.meta as any).env?.VITE_PARTYKIT_HOST;
		if (typeof override === 'string' && override.trim()) return override.trim();
		if (typeof location !== 'undefined' && location.hostname)
			return `${location.hostname}:${PARTYKIT_PORT}`;
		return `localhost:${PARTYKIT_PORT}`;
	}

	// Projector state
	let projState: any = $state(null);

	$effect(() => {
		const s = new PartySocket({
			host: getPartykitHost(),
			room: 'quiz-room-1',
			query: { role: 'projector' }
		});
		s.onmessage = (evt) => {
			const msg = JSON.parse(evt.data);
			if (msg.type === 'state') projState = msg.data;
		};
		return () => s.close();
	});

	// Admin socket (controls + questions)
	let adminState: any = $state(null);
	let questions: any[] = $state([]);
	let adminSocket: any = $state(null);

	function startGame() {
		adminSocket?.send(JSON.stringify({ type: 'admin_start' }));
	}
	function nextQuestion() {
		adminSocket?.send(JSON.stringify({ type: 'admin_next' }));
	}
	function finishRoundNow() {
		adminSocket?.send(JSON.stringify({ type: 'admin_finish_round' }));
	}
	function jumpToQuestion(i: number) {
		adminSocket?.send(JSON.stringify({ type: 'admin_jump', index: i }));
	}

	$effect(() => {
		const s = new PartySocket({
			host: getPartykitHost(),
			room: 'quiz-room-1',
			query: { role: 'admin' }
		});
		adminSocket = s;
		s.onopen = () => s.send(JSON.stringify({ type: 'admin_get_questions' }));
		s.onmessage = (evt) => {
			const msg = JSON.parse(evt.data);
			if (msg.type === 'state') adminState = msg.data;
			if (msg.type === 'admin_questions') questions = Array.isArray(msg.data) ? msg.data : [];
		};
		return () => s.close();
	});
</script>

<main class="allviews">
	<div class="left">
		<iframe title="Projector View" class="panel-iframe" src="/projector" width="1920" height="1080"></iframe>
	</div>

	<div class="right">
		<div class="top">
			<iframe title="Admin View" class="panel-iframe" src="/admin"></iframe>
		</div>
		<div class="bottom">
			{#each [1, 2] as i}
				<div class="phone-frame">
					<div class="phone-header">Phone {i}</div>
					<div class="device-wrap">
						<iframe
							title="Phone {i}"
							class="phone-iframe"
							src="/?playerId=phone-{i}&name=Phone%20{i}"
							width="1080"
							height="1920"
						></iframe>
					</div>
				</div>
			{/each}
		</div>
	</div>
</main>

<style>
	:global(body) {
		margin: 0;
	}
	.allviews {
		background-color: #222222;
		display: flex;
		flex-direction: row;
		height: 100vh;
		gap: 12px;
		padding: 12px;
		box-sizing: border-box;
		overflow: hidden;
	}

	.left {
		flex-grow: 1;
		width: 100%;
		height: 100%;
		display: flex;
	}

	.right {
		display: flex;
		flex-direction: column;
	}

	.top {
		display: flex;
		grid-template-columns: 1fr 420px;
		gap: 12px;
		flex: 1;
		min-height: 0;
	}
	.bottom {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
		flex: 1;
		min-height: 0;
	}

	

	.phone-frame {
		position: relative;
		width: 235px;
		border-radius: 20px;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		padding: 48px 18px 18px; /* leave top space for device bezel */
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2);
		box-sizing: border-box;
		min-height: 0;
		background-image: url('/phone_placeholder.png');
		background-repeat: no-repeat;
		background-position: center;
		background-size: contain;
	}
	.phone-header {
		position: absolute;
		top: 12px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(17, 24, 39, 0.95);
		color: white;
		padding: 6px 10px;
		border-radius: 12px;
		z-index: 2;
	}
	.device-wrap {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		min-height: 0;
	}

	.phone-iframe {
		height: 650px;
		transform: scale(0.66);
		flex: 1;
		border: 0;
		border-radius: 12px;
		background: transparent;
		display: block;
	}
	.panel-iframe {
		width: 100%;
		flex: 1;
		border: 0;
		border-radius: 8px;
		background: transparent;
		display: block;
	}
</style>
