<script lang="ts">
	import type { GameStatus, KaraokePlaybackSync, QuizQuestion, OptionRevealState } from '$lib/quiz/types';
	import type { FocusedOptionOverlayData } from '../../projector/focusedOptionOverlay';
	import QcmView from './types/QcmView.svelte';
	import DeblurView from './types/DeblurView.svelte';
	import SortingView from './types/SortingView.svelte';
	import EstimateView from './types/EstimateView.svelte';
	import FastFingersView from './types/FastFingersView.svelte';
	import MediaView from './types/MediaView.svelte';
	import KaraokeView from './types/KaraokeView.svelte';
	import VrWhackView from './types/VrWhackView.svelte';
	import BurgerView from './types/BurgerView.svelte';
	import QuestionImageStrip from './QuestionImageStrip.svelte';
	import { isPassiveQuestionType, isQcmLikeQuestionType } from '$lib/quiz/questionTypes';

	type Props = {
		status: GameStatus;
		question: QuizQuestion | undefined;
		karaokeSync?: KaraokePlaybackSync;
		optionReveal?: OptionRevealState;
		roundSummary?: any;
		timer?: number;
		onPassiveFinished?: () => void;
		onFocusImageChange?: (payload: FocusedOptionOverlayData | null) => void;
	};

	let {
		status,
		question,
		karaokeSync,
		optionReveal,
		roundSummary,
		timer = 0,
		onPassiveFinished,
		onFocusImageChange
	}: Props = $props();
	const type = $derived(String(question?.type || ''));

	function text(q: QuizQuestion) {
		return Array.isArray(q.question) ? q.question.join(' ') : String(q.question ?? '');
	}
</script>

<div class="question-renderer">
	{#if !question}
		<div class="loading">Chargement de la question…</div>
	{:else}
		{#if !isPassiveQuestionType(type) && type !== 'deblur'}
			<h2 class="q-text">{text(question)}</h2>
			{#if type !== 'qcm' && type !== 'deblur'}
				<QuestionImageStrip questionId={question.id} />
			{/if}
		{/if}
		{#if status === 'reading'}
			<div class="reading-spacer"></div>
		{:else if type === 'deblur'}
			<DeblurView {status} question={question as any} {optionReveal} {timer} />
		{:else if type === 'burger'}
			<BurgerView {status} question={question as any} {optionReveal} />
		{:else if isQcmLikeQuestionType(type)}
			<QcmView {status} question={question as any} {optionReveal} {onFocusImageChange} />
		{:else if type === 'sorting'}
			<SortingView {status} question={question as any} {optionReveal} />
		{:else if type === 'estimate'}
			<EstimateView {status} question={question as any} summary={roundSummary?.estimate} />
		{:else if type === 'fastFingers'}
			<FastFingersView {status} question={question as any} />
		{:else if type === 'media'}
			<MediaView {status} question={question as any} onFinished={onPassiveFinished} />
		{:else if type === 'karaoke'}
			<KaraokeView
				{status}
				question={question as any}
				sync={karaokeSync}
				onFinished={onPassiveFinished}
			/>
		{:else if type === 'vrwhack'}
			<VrWhackView {status} question={question as any} />
		{:else}
			<div class="muted">Type non pris en charge : {type}</div>
		{/if}
	{/if}
</div>

<style>
	.question-renderer {
		display: flex;
		width: 100%;
		height: 100%;
		min-height: 0;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		overflow: hidden;
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
			min-width: 4rem;
			font-size: 3rem;
		}

		.ans-pill {
			font-size: 2.5rem;
		}
	}
</style>
