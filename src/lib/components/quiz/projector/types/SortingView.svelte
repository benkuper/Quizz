<script lang="ts">
	import RevealableOptions from './RevealableOptions.svelte';
	import type { GameStatus, OptionRevealState, QuizQuestionSorting } from '$lib/quiz/types';

	type Props = {
		status: GameStatus;
		question: QuizQuestionSorting;
		optionReveal?: OptionRevealState;
	};

	let { status, question, optionReveal }: Props = $props();

	function completedReveal(totalOptions: number): OptionRevealState {
		return {
			focusedOptionIndex: null,
			placedOptionIndexes: Array.from({ length: totalOptions }, (_, index) => index),
			totalOptions
		};
	}

	const resolvedReveal = $derived.by(() => {
		const totalOptions = question.options?.length ?? 0;
		if (!totalOptions) return null;
		if (status === 'reveal' && optionReveal) return optionReveal;
		return completedReveal(totalOptions);
	});
</script>

{#if resolvedReveal && question.options}
	<RevealableOptions options={question.options.map(String)} reveal={resolvedReveal} />
{/if}

{#if status === 'review' && question.answers}
	<div class="correct-answer">
		Ordre correct :
		<div class="order">
			{#each question.answers as ans, idx}
				<div class="ans-pill">{idx + 1}. {ans}</div>
			{/each}
		</div>
	</div>
{/if}
