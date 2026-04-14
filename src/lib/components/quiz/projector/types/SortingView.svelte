<script lang="ts">
	import RevealableOptions from './RevealableOptions.svelte';
	import type { GameStatus, OptionRevealState, QuizQuestionSorting } from '$lib/quiz/types';

	type Props = {
		status: GameStatus;
		question: QuizQuestionSorting;
		optionReveal?: OptionRevealState;
	};

	let { status, question, optionReveal }: Props = $props();

	function normalizeSortingAnswers(rawAnswers: Array<string | number> | undefined, options: string[]) {
		if (!Array.isArray(rawAnswers) || options.length === 0) return [];

		const normalized: string[] = [];
		const usedIndexes = new Set<number>();

		for (const rawAnswer of rawAnswers) {
			let optionIndex = -1;

			if (typeof rawAnswer === 'number' && Number.isInteger(rawAnswer)) {
				optionIndex = rawAnswer - 1;
			} else if (typeof rawAnswer === 'string') {
				const trimmed = rawAnswer.trim();
				if (!trimmed) continue;

				const parsed = Number(trimmed);
				if (Number.isInteger(parsed)) {
					optionIndex = parsed - 1;
				} else {
					optionIndex = options.findIndex((option) => option === trimmed);
				}
			}

			if (optionIndex < 0 || optionIndex >= options.length || usedIndexes.has(optionIndex)) continue;
			usedIndexes.add(optionIndex);
			normalized.push(options[optionIndex]);
		}

		return normalized;
	}

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

	const correctOrder = $derived(
		normalizeSortingAnswers(question.answers, question.options?.map(String) ?? [])
	);
</script>

{#if resolvedReveal && question.options}
	<RevealableOptions options={question.options.map(String)} reveal={resolvedReveal} textScale="large" />
{/if}

{#if status === 'review' && correctOrder.length}
	<div class="correct-answer">
		Ordre correct :
		<div class="order">
			{#each correctOrder as ans, idx}
				<div class="ans-pill">{idx + 1}. {ans}</div>
			{/each}
		</div>
	</div>
{/if}
