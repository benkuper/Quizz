<script lang="ts">
	import type { GameStatus, QuizQuestionVrWhack } from '$lib/quiz/types';

	type Props = {
		status: GameStatus;
		question: QuizQuestionVrWhack;
	};

	let { status, question }: Props = $props();

	const hint = $derived(String((question as any)?.vrwhack?.hint ?? 'Les joueurs regardent autour d eux avec leur telephone et touchent les cibles pour marquer.'));
</script>

<div class="muted">Vise et touche (faux mode VR)</div>
<div class="muted">{hint}</div>

{#if status === 'review'}
	<div class="muted">Points = nombre de cibles touchees avant la fin du chrono.</div>
{/if}
