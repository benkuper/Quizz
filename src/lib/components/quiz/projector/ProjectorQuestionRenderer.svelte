<script lang="ts">
	import type { GameStatus, OptionRevealState, QuizQuestion } from '$lib/quiz/types';
	import QcmView from './types/QcmView.svelte';
	import SortingView from './types/SortingView.svelte';
	import EstimateView from './types/EstimateView.svelte';
	import FastFingersView from './types/FastFingersView.svelte';
	import MediaView from './types/MediaView.svelte';
	import VrWhackView from './types/VrWhackView.svelte';
	import QuestionImageStrip from './QuestionImageStrip.svelte';

	type Props = {
		status: GameStatus;
		question: QuizQuestion | undefined;
		optionReveal?: OptionRevealState;
		roundSummary?: any;
		onMediaFinished?: () => void;
	};

	let { status, question, optionReveal, roundSummary, onMediaFinished }: Props = $props();
	const type = $derived(String(question?.type || ''));

	function text(q: QuizQuestion) {
		return Array.isArray(q.question) ? q.question.join(' ') : String(q.question ?? '');
	}
</script>

<div class="question-renderer">
	{#if !question}
		<div class="loading">Loading question…</div>
	{:else}
		{#if type !== 'media'}
			<h2 class="q-text">{text(question)}</h2>
			<QuestionImageStrip questionId={question.id} />
		{/if}
		{#if status === 'reading'}
			<div class="reading-spacer"></div>
		{:else if type === 'qcm'}
			<QcmView {status} question={question as any} {optionReveal} />
		{:else if type === 'sorting'}
			<SortingView {status} question={question as any} {optionReveal} />
		{:else if type === 'estimate'}
			<EstimateView {status} question={question as any} summary={roundSummary?.estimate} />
		{:else if type === 'fastFingers'}
			<FastFingersView {status} question={question as any} />
		{:else if type === 'media'}
			<MediaView {status} question={question as any} onFinished={onMediaFinished} />
		{:else if type === 'vrwhack'}
			<VrWhackView {status} question={question as any} />
		{:else}
			<div class="muted">Unsupported type: {type}</div>
		{/if}
	{/if}
</div>

<style>
	.question-renderer {
		display: flex;
		width: 100%;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}

	.loading {
		text-align: center;
		padding: 2rem;
		color: var(--slate-400);
	}

	.q-text {
		margin-top: 1rem;
		text-align: center;
		max-width: 88%;
	}

	.reading-spacer {
		height: 1rem;
	}

	:global {
		.option {
			font-size: 2.5rem;
			min-width:4rem;
			font-size:3rem;
		}

		.ans-pill {
			font-size: 2.5rem;
		}
	}
</style>
