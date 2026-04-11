<script lang="ts">
	import type { GameStatus, QuizQuestionFastFingers } from '$lib/quiz/types';

	type Props = {
		status: GameStatus;
		question: QuizQuestionFastFingers;
	};

	let { status }: Props = $props();
</script>

<div class="muted">Rapide et juste : choisissez la bonne image</div>

{#if status === 'review'}
	<div class="muted">Les points correspondent au nombre de bons choix.</div>
{/if}
