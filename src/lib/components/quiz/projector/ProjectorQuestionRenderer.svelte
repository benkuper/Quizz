<script lang="ts">
	import type { GameStatus, QuizQuestion } from '$lib/quiz/types';
	import QcmView from './types/QcmView.svelte';
	import SortingView from './types/SortingView.svelte';
	import EstimateView from './types/EstimateView.svelte';
	import FastFingersView from './types/FastFingersView.svelte';
	import MediaView from './types/MediaView.svelte';

	type Props = {
		status: GameStatus;
		question: QuizQuestion | undefined;
		roundSummary?: any;
		onMediaFinished?: () => void;
	};

	let { status, question, roundSummary, onMediaFinished }: Props = $props();
	const type = $derived(String(question?.type || ''));

	function text(q: QuizQuestion) {
		return Array.isArray(q.question) ? q.question.join(' ') : String(q.question ?? '');
	}
</script>

{#if !question}
	<div class="loading">Loading question…</div>
{:else}
	<h2 class="q-text">{text(question)}</h2>

	{#if type === 'qcm'}
		<QcmView status={status} question={question as any} />
	{:else if type === 'sorting'}
		<SortingView status={status} question={question as any} />
	{:else if type === 'estimate'}
		<EstimateView status={status} question={question as any} summary={roundSummary?.estimate} />
	{:else if type === 'fastFingers'}
		<FastFingersView status={status} question={question as any} />
	{:else if type === 'media'}
		<MediaView status={status} question={question as any} onFinished={onMediaFinished} />
	{:else}
		<div class="muted">Unsupported type: {type}</div>
	{/if}
{/if}
