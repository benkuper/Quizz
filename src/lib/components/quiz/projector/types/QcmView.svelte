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
			<div class="option">{opt}</div>
		{/each}
	{/if}
</div>

{#if status === 'review' && question.answers}
	<div class="correct-answer">
		Correct answer(s):
		{#each question.answers as ans}
			<div class="ans-pill">{ans}</div>
		{/each}
	</div>
{/if}
