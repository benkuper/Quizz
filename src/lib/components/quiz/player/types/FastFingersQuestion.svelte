<script lang="ts">
	import type { QuizQuestionFastFingers } from '$lib/quiz/types';

	type Props = {
		question: QuizQuestionFastFingers;
		value: number | null;
		onChange: (next: number) => void;
		onSubmit?: (payload: { picks: Array<'left' | 'right'> }) => void;
	};

	let { question, value, onChange, onSubmit }: Props = $props();

	const steps = $derived(question.fastFingers?.steps ?? []);
	const shuffle = $derived(question.fastFingers?.shuffle ?? true);

	let stepIndex = $state(0);
	let finished = $derived(stepIndex >= steps.length && steps.length > 0);
	let picks = $state<Array<'left' | 'right'>>([]);
	let hasSubmitted = $state(false);
	let lastQid = $state<string | null>(null);

	const progressText = $derived(
		steps.length > 0 ? `Step ${Math.min(stepIndex + 1, steps.length)} / ${steps.length}` : 'No steps configured'
	);

	$effect(() => {
		const qid = String(question?.id ?? '');
		if (lastQid === null) {
			lastQid = qid;
			return;
		}
		if (qid && qid !== lastQid) {
			lastQid = qid;
			stepIndex = 0;
			picks = [];
			hasSubmitted = false;
			onChange(0);
		}
	});

	function pick(side: 'left' | 'right') {
		if (finished) return;
		picks = [...picks, side];
		stepIndex += 1;
	}

	function leftChoice() {
		const s = steps[stepIndex];
		if (!s) return null;
		return shuffle && (stepIndex % 2 === 1)
			? { kind: 'bad' as const, src: s.bad.src, alt: s.bad.alt ?? 'Wrong' }
			: { kind: 'good' as const, src: s.good.src, alt: s.good.alt ?? 'Correct' };
	}

	function rightChoice() {
		const s = steps[stepIndex];
		if (!s) return null;
		return shuffle && (stepIndex % 2 === 1)
			? { kind: 'good' as const, src: s.good.src, alt: s.good.alt ?? 'Correct' }
			: { kind: 'bad' as const, src: s.bad.src, alt: s.bad.alt ?? 'Wrong' };
	}

	const left = $derived(leftChoice());
	const right = $derived(rightChoice());

	$effect(() => {
		if (!finished) return;
		if (hasSubmitted) return;
		if (steps.length === 0) return;
		if (picks.length !== steps.length) return;
		onSubmit?.({ picks });
		hasSubmitted = true;
	});

	function click(side: 'left' | 'right') {
		pick(side);
	}
</script>

<div class="rounded-2xl bg-slate-900 p-4">
	<div class="flex items-center justify-between">
		<div class="text-sm font-semibold text-slate-100">Fast Fingers</div>
		<div class="text-xs text-slate-400">{progressText}</div>
	</div>

	{#if steps.length === 0}
		<div class="mt-4 rounded-xl bg-slate-950 p-4 text-center text-sm text-slate-300">
			No steps configured for this question.
		</div>
	{:else if finished}
		<div class="mt-4 rounded-xl bg-emerald-500/15 p-4 text-center">
			<div class="text-3xl">🏁</div>
			<div class="mt-2 text-lg font-extrabold text-emerald-200">Finished!</div>
			<div class="mt-1 text-sm text-emerald-100">Scoring is calculated at the end.</div>
		</div>
	{:else}
		<div class="mt-4 grid grid-cols-2 gap-3">
			<button
				type="button"
				class="choice"
				onclick={() => click('left')}
				aria-label={left?.alt ?? 'Choice'}
			>
				{#if left}
					<img class="img" src={left.src} alt={left.alt ?? ''} />
				{/if}
			</button>
			<button
				type="button"
				class="choice"
				onclick={() => click('right')}
				aria-label={right?.alt ?? 'Choice'}
			>
				{#if right}
					<img class="img" src={right.src} alt={right.alt ?? ''} />
				{/if}
			</button>
		</div>
		<div class="mt-3 text-center text-xs text-slate-400">Pick fast — it advances instantly.</div>
	{/if}
</div>

<style>
	.choice {
		border-radius: 1.25rem;
		background: rgba(2, 6, 23, 0.6);
		border: 0.1rem solid rgba(148, 163, 184, 0.18);
		padding: 0.75rem;
		width: 100%;
		aspect-ratio: 1 / 1;
		display: grid;
		place-items: center;
		transition: transform 80ms ease, border-color 120ms ease;
	}
	.choice:active {
		transform: scale(0.99);
	}
	.img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
</style>
