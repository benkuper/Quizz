<script lang="ts">
	import type { QuizQuestion } from '$lib/quiz/types';
	import QcmQuestion from './types/QcmQuestion.svelte';
	import EstimateQuestion from './types/EstimateQuestion.svelte';
	import FastFingersQuestion from './types/FastFingersQuestion.svelte';
	import SortingQuestion from './types/SortingQuestion.svelte';
	import MediaQuestion from './types/MediaQuestion.svelte';
	import VrWhackQuestion from './types/VrWhackQuestion.svelte';

	type Props = {
		question: QuizQuestion | undefined;
		value: unknown;
		onChange: (next: unknown) => void;
		onAutoSubmit?: (payload: unknown) => void;
	};

	let { question, value, onChange, onAutoSubmit }: Props = $props();

	const type = $derived(String(question?.type || ''));
</script>

{#if !question}
	<div class="rounded-2xl bg-slate-900 p-4 text-center text-slate-200">Loading…</div>
{:else if type === 'qcm'}
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
{:else if type === 'vrwhack'}
	<VrWhackQuestion
		question={question as any}
		value={typeof value === 'number' && Number.isFinite(value) ? (value as number) : 0}
		onChange={(v) => onChange(v)}
		onSubmit={onAutoSubmit as any}
	/>
{:else}
	<div class="rounded-2xl bg-slate-900 p-4">
		<div class="text-sm text-slate-300">Unsupported question type</div>
		<div class="mt-2 text-lg font-semibold">{type}</div>
	</div>
{/if}
