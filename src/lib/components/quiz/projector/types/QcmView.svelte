<script lang="ts">
	import type { GameStatus, QuizQuestionQcm } from '$lib/quiz/types';

	type Props = {
		status: GameStatus;
		question: QuizQuestionQcm;
	};

	let { status, question }: Props = $props();
</script>

<div class="options">
	{#if question.options}
		{#each question.options as opt}
			<div
				class="option {status == 'review'
					? 'review-' + (question.answers?.includes(opt) ? 'correct' : 'wrong')
					: ''}"
			>
				{opt}
			</div>
		{/each}
	{/if}
</div>

<!-- {#if status === 'review' && question.answers}
	<div class="correct-answer">
		Correct answer(s):
		{#each question.answers as ans}
			<div class="ans-pill">{ans}</div>
		{/each}
	</div>
{/if} -->

<style>
	.option
	{
		transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
	}

	.option.review-correct {
		background-color: #166534;
		border-color: #22c55e;
		color: white;
	}

	.option.review-wrong {
		background-color: #7f1d1d;
		border-color: #ef4444;
		color: white;
	}
</style>
