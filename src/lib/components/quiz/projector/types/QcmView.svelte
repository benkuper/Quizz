<script lang="ts">
	import RevealableOptions from './RevealableOptions.svelte';
	import { loadQuestionOptionImages } from '$lib/quiz/optionImages.svelte';
	import type { FocusedOptionOverlayData } from '../../../projector/focusedOptionOverlay';
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
		onFocusImageChange?: (payload: FocusedOptionOverlayData | null) => void;
		layout?: 'grid' | 'sidebar';
	};

	let { status, question, optionReveal, onFocusImageChange, layout = 'grid' }: Props = $props();
	let optionImages = $state<Array<string | null>>([]);

	function completedReveal(totalOptions: number): OptionRevealState {
		return {
			focusedOptionIndex: null,
			placedOptionIndexes: Array.from({ length: totalOptions }, (_, index) => index),
			totalOptions
		};
	}

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
	const resolvedReveal = $derived.by(() => {
		const totalOptions = question.options?.length ?? 0;
		if (!totalOptions) return null;
		if (status === 'reveal' && optionReveal) return optionReveal;
		return completedReveal(totalOptions);
	});
	const reviewSlotStates = $derived.by(() => {
		if (status !== 'review' || correctAnswerIndexes.length === 0) return [];
		return question.options.map((_, index) => (correctAnswerIndexes.includes(index + 1) ? 'correct' : 'wrong'));
	});
</script>

{#if resolvedReveal && question.options}
	<RevealableOptions
		options={question.options}
		reveal={resolvedReveal}
		labels={optionLabels}
		optionImages={optionImages}
		{layout}
		showLabels
		slotStates={reviewSlotStates}
		onFocusImageChange={onFocusImageChange}
	/>
{/if}

<!-- {#if status === 'review' && question.answers}
	<div class="correct-answer">
		Correct answer(s):
		{#each question.answers as ans}
			<div class="ans-pill">{ans}</div>
		{/each}
	</div>
{/if} -->

