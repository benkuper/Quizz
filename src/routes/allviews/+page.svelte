<script lang="ts">
	import { createQuizSocket } from '$lib/partykit/client.svelte';
	import { urlState } from '$lib/url.svelte';

	// Projector state
	let projState: any = $state(null);

	$effect(() => {
		const s = createQuizSocket({ role: 'projector' });
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
		const s = createQuizSocket({ role: 'admin' });
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

{#if urlState.baseUrl === ''}
	<p>Loading...</p>
{:else}
	<main class="allviews">
		<div class="left">
			<iframe
				title="Projector View"
				class="panel-iframe"
				src="{urlState.basePath}/projector"
				width="1920"
				height="1080"
			></iframe>
		</div>

		<div class="right">
			<div class="top">
				<iframe title="Admin View" class="panel-iframe" src="{urlState.basePath}/admin"></iframe>
			</div>
			<div class="bottom">
				{#each [1, 2] as i}
					<div class="phone-frame">
						<div class="phone-header">Phone {i}</div>
						<div class="device-wrap">
							<iframe
								title="Phone {i}"
								class="phone-iframe"
								src="{urlState.basePath}/?playerId=phone-{i}&name=Phone%20{i}"
								width="1080"
								height="1920"
							></iframe>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</main>
{/if}

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
		width: 220px;
		border-radius: 20px;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		padding-top: 1rem;
		/* padding: 48px 18px 18px; */
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2);
		box-sizing: border-box;
		min-height: 0;
		background-image: url('/phone_placeholder.png');
		background-color: #000000;
		background-repeat: no-repeat;
		background-position: center;
		background-size: contain;
	}
	.phone-header {
		position: absolute;
		font-size: 0.6em;
		top: 12px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(17, 24, 39, 0.95);
		color: white;
		padding: 0.15rem 0.6rem;
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
