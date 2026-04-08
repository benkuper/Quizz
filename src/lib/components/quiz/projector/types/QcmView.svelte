<script lang="ts">
	import RevealableOptions from './RevealableOptions.svelte';
	import { loadQuestionOptionImages } from '$lib/quiz/optionImages.svelte';
	import type {
		GameStatus,
		OptionRevealState,
		QuizOptionAnswer,
		QuizQuestionPerfectMatch,
		QuizQuestionQcm
	} from '$lib/quiz/types';

	const OPTION_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

	type Props = {
		status: GameStatus;
		question: QuizQuestionQcm | QuizQuestionPerfectMatch;
		optionReveal?: OptionRevealState;
	};

	let { status, question, optionReveal }: Props = $props();
	let optionImages = $state<Array<string | null>>([]);

	function optionLabel(index: number) {
		return OPTION_LABELS[index] ?? String(index + 1);
	}

	$effect(() => {
		let cancelled = false;

		optionImages = [];
		if (question.type !== 'qcm') return;

		(async () => {
			const nextImages = await loadQuestionOptionImages(question.id, question.options?.length ?? 0);
			if (!cancelled) optionImages = nextImages;
		})();

		return () => {
			cancelled = true;
		};
	});

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
	const hasOptionImages = $derived.by(() => optionImages.some((src) => Boolean(src)));
	const showRevealLayout = $derived.by(() => {
		if (status !== 'reveal' || !optionReveal) return false;
		return (
			optionReveal.focusedOptionIndex !== null ||
			optionReveal.placedOptionIndexes.length < optionReveal.totalOptions
		);
	});
</script>

{#if showRevealLayout && question.options}
	<RevealableOptions
		options={question.options}
		reveal={optionReveal!}
		labels={optionLabels}
		optionImages={optionImages}
		showLabels
	/>
{:else}
	<div class="options">
		{#if question.options}
			{#each question.options as opt, index}
				{@const hasReviewAnswers = correctAnswerIndexes.length > 0}
				{@const imageSrc = optionImages[index]}
				<div
					class="option {status === 'review' && hasReviewAnswers
						? 'review-' + (correctAnswerIndexes.includes(index + 1) ? 'correct' : 'wrong')
						: ''}"
					class:has-image={Boolean(imageSrc)}
				>
					<span class="option-label">{optionLabel(index)}</span>
					<div class="option-body" class:has-image={Boolean(imageSrc)}>
						{#if imageSrc}
							<div class="option-image-shell">
								<img class="option-image" src={imageSrc} alt={opt} />
							</div>
						{/if}
						<span class="option-text">{opt}</span>
					</div>
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

	.option.has-image {
		align-items: stretch;
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

	.option-body {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex: 1;
		min-width: 0;
	}

	.option-body.has-image {
		align-items: stretch;
	}

	.option-image-shell {
		width: min(20vw, 12rem);
		height: 7rem;
		flex-shrink: 0;
		border-radius: 1rem;
		overflow: hidden;
		background: rgba(15, 23, 42, 0.92);
		border: 0.1rem solid rgba(255, 255, 255, 0.12);
	}

	.option-image {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
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

	@media (max-width: 60rem) {
		.option,
		.option-body.has-image {
			flex-direction: column;
			align-items: flex-start;
		}

		.option-label {
			width: 2.75rem;
			height: 2.75rem;
		}

		.option-image-shell {
			width: 100%;
			height: 10rem;
		}
	}
</style>
