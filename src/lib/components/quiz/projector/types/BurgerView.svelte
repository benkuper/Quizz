<script lang="ts">
	import RevealableOptions from './RevealableOptions.svelte';
	import type { GameStatus, OptionRevealState, QuizQuestionBurger } from '$lib/quiz/types';

	type Props = {
		status: GameStatus;
		question: QuizQuestionBurger;
		optionReveal?: OptionRevealState;
	};

	let { status, question, optionReveal }: Props = $props();

	function buildReveal(
		totalOptions: number,
		revealPhase: 'questions' | 'answers',
		placedOptionIndexes: number[] = [],
		focusedOptionIndex: number | null = null
	): OptionRevealState {
		return {
			placedOptionIndexes,
			focusedOptionIndex,
			totalOptions,
			revealPhase
		};
	}

	function emptyReveal(totalOptions: number, revealPhase: 'questions' | 'answers') {
		return buildReveal(totalOptions, revealPhase);
	}

	function completedReveal(totalOptions: number, revealPhase: 'questions' | 'answers') {
		return buildReveal(
			totalOptions,
			revealPhase,
			Array.from({ length: totalOptions }, (_, index) => index),
			null
		);
	}

	function sanitizeReveal(
		reveal: OptionRevealState | undefined,
		totalOptions: number,
		revealPhase: 'questions' | 'answers'
	) {
		const placedOptionIndexes = [...new Set(
			(reveal?.placedOptionIndexes ?? []).filter(
				(index): index is number => Number.isInteger(index) && index >= 0 && index < totalOptions
			)
		)];
		const focusedOptionIndex =
			typeof reveal?.focusedOptionIndex === 'number' &&
			reveal.focusedOptionIndex >= 0 &&
			reveal.focusedOptionIndex < totalOptions
				? reveal.focusedOptionIndex
				: null;

		return buildReveal(totalOptions, revealPhase, placedOptionIndexes, focusedOptionIndex);
	}

	const prompt = $derived(
		Array.isArray(question.question) ? question.question.join(' ') : String(question.question ?? '')
	);
	const questionItems = $derived(Array.isArray(question.options) ? question.options.map(String) : []);
	const answerItems = $derived(Array.isArray(question.answers) ? question.answers.map(String) : []);
	const questionLabels = $derived(questionItems.map((_, index) => String(index + 1)));
	const answerLabels = $derived(answerItems.map((_, index) => String(index + 1)));
	const revealPhase = $derived(
		optionReveal?.revealPhase === 'answers' ? 'answers' : 'questions'
	);
	const questionReveal = $derived.by(() => {
		const totalOptions = questionItems.length;
		if (status === 'review') return completedReveal(totalOptions, 'questions');
		if (status === 'reveal' && revealPhase === 'questions') {
			return sanitizeReveal(optionReveal, totalOptions, 'questions');
		}
		if (status === 'reveal' && revealPhase === 'answers') {
			return completedReveal(totalOptions, 'questions');
		}
		return emptyReveal(totalOptions, 'questions');
	});
	const answerReveal = $derived.by(() => {
		const totalOptions = answerItems.length;
		if (status === 'review') return completedReveal(totalOptions, 'answers');
		if (status === 'reveal' && revealPhase === 'answers') {
			return sanitizeReveal(optionReveal, totalOptions, 'answers');
		}
		return emptyReveal(totalOptions, 'answers');
	});
</script>

<div class="burger-view">
	<h2 class="burger-title">{prompt}</h2>
	<!-- <div class="burger-meta">
		<span>{questionItems.length} question{questionItems.length > 1 ? 's' : ''}</span>
		<span>{answerItems.length} answer{answerItems.length > 1 ? 's' : ''}</span>
	</div> -->

	<div class="burger-columns">
		<section class="burger-column">
			<div class="column-heading">Questions</div>
			<RevealableOptions
				options={questionItems}
				reveal={questionReveal}
				labels={questionLabels}
				layout="sidebar"
				textScale="large"
				showLabels
			/>
		</section>

		<section class="burger-column">
			<div class="column-heading">Answers</div>
			<RevealableOptions
				options={answerItems}
				reveal={answerReveal}
				labels={answerLabels}
				layout="sidebar"
				textScale="large"
				showLabels
			/>
		</section>
	</div>
</div>

<style>
	.burger-view {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		width: min(99%, 118rem);
		height: 100%;
		max-height: 100%;
		margin: 0 auto;
		padding: 0.3rem 0.45rem 0.45rem;
		box-sizing: border-box;
		overflow: hidden;
	}

	.burger-title {
		margin: 0;
		text-align: center;
		font-size: clamp(1.28rem, 2.35vw, 2.2rem);
		line-height: 1.08;
	}

	.burger-columns {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
		align-items: start;
		flex: 1 1 auto;
		min-height: 0;
	}

	.burger-column {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-height: 0;
		overflow: hidden;
	}

	.column-heading {
		text-align: center;
		font-size: clamp(0.68rem, 0.9vw, 0.82rem);
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.72);
	}

	@media (max-width: 64rem) {
		.burger-columns {
			grid-template-columns: 1fr;
		}
	}
</style>