<script lang="ts">
	import type { GameStatus, KaraokePlaybackSync, QuizQuestion } from '$lib/quiz/types';
	import { isQcmLikeQuestionType } from '$lib/quiz/questionTypes';
	import QcmQuestion from './types/QcmQuestion.svelte';
	import EstimateQuestion from './types/EstimateQuestion.svelte';
	import FastFingersQuestion from './types/FastFingersQuestion.svelte';
	import SortingQuestion from './types/SortingQuestion.svelte';
	import MediaQuestion from './types/MediaQuestion.svelte';
	import KaraokeQuestion from './types/KaraokeQuestion.svelte';
	import VrWhackQuestion from './types/VrWhackQuestion.svelte';
	import BurgerQuestion from './types/BurgerQuestion.svelte';

	type Props = {
		status: GameStatus;
		question: QuizQuestion | undefined;
		karaokeSync?: KaraokePlaybackSync;
		value: unknown;
		onChange: (next: unknown) => void;
		onAutoSubmit?: (payload: unknown) => void;
	};

	let { status, question, karaokeSync, value, onChange, onAutoSubmit }: Props = $props();

	const type = $derived(String(question?.type || ''));
</script>

<div class="question-renderer">
	{#if !question}
		<div class="rounded-2xl bg-slate-900 p-4 text-center text-slate-200">Chargement…</div>
	{:else if isQcmLikeQuestionType(type)}
		<QcmQuestion question={question as any} value={value as any} onChange={onChange as any} />
	{:else if type === 'estimate'}
		<EstimateQuestion
			question={question as any}
			value={typeof value === 'number' && Number.isFinite(value) ? (value as number) : null}
			onChange={(v) => onChange(v)}
		/>
	{:else if type === 'fastFingers'}
		<FastFingersQuestion
			question={question as any}
			value={value as any}
			onChange={onChange as any}
			onSubmit={onAutoSubmit as any}
		/>
	{:else if type === 'sorting'}
		<SortingQuestion question={question as any} value={value as any} onChange={onChange as any} />
	{:else if type === 'media'}
		<MediaQuestion question={question as any} />
	{:else if type === 'burger'}
		<BurgerQuestion {status} question={question as any} />
	{:else if type === 'karaoke'}
		<KaraokeQuestion {status} question={question as any} sync={karaokeSync} />
	{:else if type === 'vrwhack'}
		<VrWhackQuestion
			question={question as any}
			value={typeof value === 'number' && Number.isFinite(value) ? (value as number) : 0}
			onChange={(v) => onChange(v)}
			onSubmit={onAutoSubmit as any}
		/>
	{:else}
		<div class="rounded-2xl bg-slate-900 p-4">
			<div class="text-sm text-slate-300">Type de question non pris en charge</div>
			<div class="mt-2 text-lg font-semibold">{type}</div>
		</div>
	{/if}
</div>
