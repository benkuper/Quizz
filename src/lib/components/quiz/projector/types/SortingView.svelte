<script lang="ts">
	import RevealableOptions from './RevealableOptions.svelte';
	import type { GameStatus, OptionRevealState, QuizQuestionSorting } from '$lib/quiz/types';

	type Props = {
		status: GameStatus;
		question: QuizQuestionSorting;
		optionReveal?: OptionRevealState;
	};

	let { status, question, optionReveal }: Props = $props();
	const showRevealLayout = $derived.by(() => {
		if (status !== 'reveal' || !optionReveal) return false;
		return (
			optionReveal.focusedOptionIndex !== null ||
			optionReveal.placedOptionIndexes.length < optionReveal.totalOptions
		);
	});
</script>

{#if showRevealLayout && question.options}
	<RevealableOptions options={question.options.map(String)} reveal={optionReveal!} />
{:else}
	<div class="options">
		{#if question.options}
			{#each question.options as opt}
				<div class="option">{opt}</div>
			{/each}
		{/if}
	</div>
{/if}

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
