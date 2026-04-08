<script lang="ts">
	import RevealableOptions from './RevealableOptions.svelte';
	import type {
		GameStatus,
		OptionRevealState,
		QuizOptionAnswer,
		QuizQuestionDeblur,
		QuizQuestionPerfectMatch,
		QuizQuestionQcm
	} from '$lib/quiz/types';

	const OPTION_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

	type Props = {
		status: GameStatus;
		question: QuizQuestionQcm | QuizQuestionDeblur | QuizQuestionPerfectMatch;
		optionReveal?: OptionRevealState;
	};

	let { status, question, optionReveal }: Props = $props();

	function optionLabel(index: number) {
		return OPTION_LABELS[index] ?? String(index + 1);
	}

	function toOptionIndex(raw: QuizOptionAnswer | null | undefined) {
		if (typeof raw === 'number' && Number.isInteger(raw)) {
			return raw >= 1 && raw <= (question.options?.length ?? 0) ? raw : null;
		}

		if (typeof raw !== 'string') return null;

		const trimmed = raw.trim();
		if (!trimmed) return null;

		const numericValue = Number(trimmed);
		if (Number.isInteger(numericValue) && numericValue >= 1 && numericValue <= (question.options?.length ?? 0)) {
			return numericValue;
		}

		const labelIndex = OPTION_LABELS.indexOf(trimmed.toUpperCase());
		if (trimmed.length === 1 && labelIndex >= 0 && labelIndex < (question.options?.length ?? 0)) {
			return labelIndex + 1;
		}

		const optionIndex = question.options?.findIndex((option) => option === trimmed) ?? -1;
		return optionIndex >= 0 ? optionIndex + 1 : null;
	}

	const correctAnswerIndexes = $derived.by(() => {
		const answers = Array.isArray(question.answers) ? question.answers : [];
		return [...new Set(answers.map((answer) => toOptionIndex(answer)).filter((answer): answer is number => answer !== null))];
	});

	const optionLabels = $derived.by(() => question.options.map((_, index) => optionLabel(index)));
	const showRevealLayout = $derived.by(() => {
		if (status !== 'reveal' || !optionReveal) return false;
		return (
			optionReveal.focusedOptionIndex !== null ||
			optionReveal.placedOptionIndexes.length < optionReveal.totalOptions
		);
	});
</script>

{#if showRevealLayout && question.options}
	<RevealableOptions options={question.options} reveal={optionReveal!} labels={optionLabels} showLabels />
{:else}
	<div class="options">
		{#if question.options}
			{#each question.options as opt, index}
				{@const hasReviewAnswers = correctAnswerIndexes.length > 0}
				<div
					class="option {status === 'review' && hasReviewAnswers
						? 'review-' + (correctAnswerIndexes.includes(index + 1) ? 'correct' : 'wrong')
						: ''}"
				>
					<span class="option-label">{optionLabel(index)}</span>
					<span class="option-text">{opt}</span>
				</div>
			{/each}
		{/if}
	</div>
{/if}

<!-- {#if status === 'review' && question.answers}
	<div class="correct-answer">
		Correct answer(s):
		{#each question.answers as ans}
			<div class="ans-pill">{ans}</div>
		{/each}
	</div>
{/if} -->

<style>
	.option {
		transition: background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease;
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.option-label {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 3rem;
		height: 3rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.1);
		font-size: 1.4rem;
		font-weight: 800;
		flex-shrink: 0;
	}

	.option-text {
		flex: 1;
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
