<script lang="ts">
	import type { GameStatus, QuizQuestionSorting } from '$lib/quiz/types';

	type Props = {
		status: GameStatus;
		question: QuizQuestionSorting;
	};

	let { status, question }: Props = $props();
</script>

<div class="options">
	{#if question.options}
		{#each question.options as opt}
			<div class="option">{opt}</div>
		{/each}
	{/if}
</div>

{#if status === 'review' && question.answers}
	<div class="correct-answer">
		Correct order:
		<div class="order">
			{#each question.answers as ans, idx}
				<div class="ans-pill">{idx + 1}. {ans}</div>
			{/each}
		</div>
	</div>
{/if}
