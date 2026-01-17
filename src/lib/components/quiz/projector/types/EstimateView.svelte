<script lang="ts">
	import type { GameStatus, QuizQuestionEstimate } from '$lib/quiz/types';

	type Props = {
		status: GameStatus;
		question: QuizQuestionEstimate;
		summary?: {
			unit?: 'year' | 'number';
			guesses: Array<{ value: number; count: number; names: string[] }>;
		} | null;
	};

	let { status, question, summary = null }: Props = $props();

	const unit = $derived(question.estimate?.unit ?? 'year');
	const min = $derived(typeof question.estimate?.min === 'number' ? question.estimate!.min! : 1900);
	const max = $derived(
		typeof question.estimate?.max === 'number' ? question.estimate!.max! : new Date().getFullYear()
	);
	const minClamped = $derived(Math.min(min, max));
	const maxClamped = $derived(Math.max(min, max));
	const range = $derived(Math.max(1, maxClamped - minClamped));

	const correctYear = $derived(
		status === 'review' && Array.isArray(question.answers) && typeof question.answers[0] === 'number'
			? Math.round(question.answers[0])
			: null
	);
	const correctPct = $derived(
		correctYear === null
			? 0
			: ((Math.max(minClamped, Math.min(maxClamped, correctYear)) - minClamped) / range) * 100
	);

	const guesses = $derived(
		status === 'review' && summary?.guesses
			? summary.guesses
				.slice()
				.sort((a, b) => a.value - b.value)
			: []
	);

	function guessPct(v: number) {
		const clamped = Math.max(minClamped, Math.min(maxClamped, v));
		return ((clamped - minClamped) / range) * 100;
	}
</script>

<div class="muted">Estimate the {unit === 'year' ? 'year' : 'value'}</div>

<div class="correct-answer">
	<div class="relative mt-4">
		<div class="h-2 w-full rounded-full bg-[#222]"></div>

		{#if status === 'review' && guesses.length > 0}
			{#each guesses as g (g.value)}
				<div
					class="guess-bubble"
					class:hit={correctYear !== null && g.value === correctYear}
					style={`left: ${guessPct(g.value)}%; width: ${Math.min(3.5, 1.4 + g.count * 0.35)}rem; height: ${Math.min(3.5, 1.4 + g.count * 0.35)}rem;`}
					aria-label={`Guesses at ${g.value}: ${g.count}`}
				>
					<span>{g.names}</span>
				</div>
			{/each}
		{/if}

		{#if correctYear !== null}
			<div
				class="absolute top-1/2 h-10 w-1 -translate-y-1/2 rounded bg-[#10b981]"
				style={`left: ${correctPct}%`}
			></div>
			<div
				class="absolute -top-10 -translate-x-1/2 rounded-xl bg-[#10b981] px-3 py-2 text-xl font-extrabold"
				style={`left: ${correctPct}%`}
			>
				{correctYear}
			</div>
		{/if}
	</div>

	<div class="mt-3 flex items-center justify-between text-sm text-slate-300">
		<span>{minClamped}</span>
		<span>{unit === 'year' ? Math.round((minClamped + maxClamped) / 2) : (minClamped + maxClamped) / 2}</span>
		<span>{maxClamped}</span>
	</div>

	{#if status !== 'review'}
		<div class="muted" style="margin-top: 0.75rem">(Correct year hidden)</div>
	{/if}

	{#if status === 'review' && guesses.length > 0}
		<div class="guess-legend">
			<div class="muted" style="margin-top: 0.75rem">What people chose</div>
			<div class="guess-list">
				{#each guesses as g (g.value)}
					<div class="guess-row">
						<div class="guess-val">{g.value}</div>
						<div class="guess-names">{g.names.join(', ')}</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.guess-bubble {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		border-radius: 9999px;
		background: rgba(148, 163, 184, 0.22);
		border: 0.1rem solid rgba(148, 163, 184, 0.5);
		color: rgba(226, 232, 240, 0.95);
		font-weight: 900;
		font-size: 1.1rem;
		display: flex;
		align-items: center;
		justify-content: center;
		backdrop-filter: blur(0.35rem);
	}
	.guess-bubble.hit {
		background: rgba(16, 185, 129, 0.22);
		border-color: rgba(16, 185, 129, 0.8);
		color: rgba(167, 243, 208, 1);
	}

	.guess-bubble span {
		user-select: none;
		padding: 0 0.25rem;
		white-space: nowrap;
		font-size: 0.6rem;
	}

	.guess-legend {
		margin-top: 0.25rem;
	}
	.guess-list {
		margin-top: 0.35rem;
		display: grid;
		gap: 0.35rem;
		max-height: 12rem;
		overflow: hidden;
	}
	.guess-row {
		display: grid;
		grid-template-columns: 6rem 1fr;
		gap: 0.75rem;
		align-items: baseline;
		padding: 0.35rem 0.5rem;
		border-radius: 0.75rem;
		background: rgba(15, 23, 42, 0.45);
		border: 0.1rem solid rgba(148, 163, 184, 0.12);
	}
	.guess-val {
		font-size: 1.1rem;
		font-weight: 900;
		color: rgba(226, 232, 240, 0.95);
	}
	.guess-names {
		color: rgba(203, 213, 225, 0.95);
		font-size: 0.95rem;
		line-height: 1.2;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
