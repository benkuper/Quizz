<script lang="ts">
	import type { GameStatus, QuizQuestionFastFingers } from '$lib/quiz/types';

	type Props = {
		status: GameStatus;
		question: QuizQuestionFastFingers;
	};

	let { status }: Props = $props();
</script>

<div class="muted">Fast fingers: pick the correct image</div>

{#if status === 'review'}
	<div class="muted">Points are the number of correct picks.</div>
{/if}
