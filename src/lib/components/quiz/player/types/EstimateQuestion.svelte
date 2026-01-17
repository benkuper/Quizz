<script lang="ts">
	import type { QuizQuestionEstimate } from '$lib/quiz/types';

	type Props = {
		question: QuizQuestionEstimate;
		value: number | null;
		onChange: (next: number) => void;
	};

	let { question, value, onChange }: Props = $props();

	const unit = $derived(question.estimate?.unit ?? 'year');
	const min = $derived(typeof question.estimate?.min === 'number' ? question.estimate!.min! : 1900);
	const max = $derived(
		typeof question.estimate?.max === 'number' ? question.estimate!.max! : new Date().getFullYear()
	);
	const step = $derived(typeof question.estimate?.step === 'number' ? question.estimate!.step! : 1);

	const minClamped = $derived(Math.min(min, max));
	const maxClamped = $derived(Math.max(min, max));

	const label = $derived(unit === 'year' ? 'year' : 'value');
	const displayValue = $derived(
		typeof value === 'number' && Number.isFinite(value)
			? unit === 'year'
				? Math.round(value)
				: value
			: unit === 'year'
				? Math.round((minClamped + maxClamped) / 2)
				: (minClamped + maxClamped) / 2
	);
	const pct = $derived(((displayValue - minClamped) / Math.max(1, maxClamped - minClamped)) * 100);

	function setValue(next: number) {
		const raw = unit === 'year' ? Math.round(next) : next;
		const clamped = Math.max(minClamped, Math.min(maxClamped, raw));
		onChange(clamped);
	}

	let trackEl: HTMLElement | null = null;
	let dragging = $state(false);

	function pctToValue(p: number) {
		const range = Math.max(1, maxClamped - minClamped);
		const raw = minClamped + (p / 100) * range;
		// snap to step
		const s = step || 1;
		const snapped = Math.round(raw / s) * s;
		return Math.max(minClamped, Math.min(maxClamped, snapped));
	}

	function updateFromClientX(clientX: number) {
		if (!trackEl) return;
		const rect = trackEl.getBoundingClientRect();
		const rel = (clientX - rect.left) / rect.width;
		const clamped = Math.max(0, Math.min(1, rel));
		const percent = clamped * 100;
		const val = pctToValue(percent);
		setValue(val);
	}

	function handlePointerDown(evt: PointerEvent) {
		if (evt.button !== 0) return;
		// only respond to primary pointer
		if (evt.isPrimary === false) return;
		dragging = true;
		(evt.currentTarget as Element).setPointerCapture?.(evt.pointerId);
		updateFromClientX(evt.clientX);
		evt.preventDefault();
	}

	function handlePointerMove(evt: PointerEvent) {
		if (!dragging) return;
		updateFromClientX(evt.clientX);
		evt.preventDefault();
	}

	function handlePointerUp(evt: PointerEvent) {
		dragging = false;
		try {
			(evt.currentTarget as Element).releasePointerCapture?.(evt.pointerId);
		} catch {}
	}
</script>

<div class="rounded-2xl bg-slate-900 p-4">
	<div class="flex items-end justify-between gap-4">
		<div>
			<div class="text-sm text-slate-300">Pick a {label}</div>
			<div class="mt-1 text-xs text-slate-400">From {minClamped} to {maxClamped}</div>
		</div>
		<div class="rounded-xl bg-slate-950 px-3 py-2 text-lg font-extrabold text-slate-50">
			{unit === 'year' ? Math.round(displayValue) : displayValue}
		</div>
	</div>

	<div class="relative mt-4 select-none">
		<!-- Pointer events are handled on the wrapper so dragging the thumb works reliably on mobile. -->
		<div
			class="touch-zone relative"
			class:dragging
			onpointerdown={handlePointerDown}
			onpointermove={handlePointerMove}
			onpointerup={handlePointerUp}
			onpointercancel={handlePointerUp}
		>
			<div bind:this={trackEl} class="track h-3 w-full rounded-full bg-slate-800 sm:h-2">
				<div class="fill h-full rounded-full bg-indigo-500/70" style={`width: ${pct}%`}></div>
			</div>

			<div
				class="thumb absolute top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-400 shadow-lg sm:h-10 sm:w-10"
				class:scale-110={dragging}
				class:ring-2={dragging}
				class:ring-indigo-200={dragging}
				style={`left: ${pct}%`}
			></div>
		</div>

		<!-- keep a hidden range input for accessibility / keyboard support -->
		<input
			class="sr-only"
			type="range"
			min={minClamped}
			max={maxClamped}
			{step}
			value={displayValue}
			aria-label={`Estimate ${label}`}
			oninput={(e) => setValue(Number((e.currentTarget as HTMLInputElement).value))}
		/>
	</div>

	<div class="mt-3 flex items-center justify-between text-xs text-slate-500">
		<span>{minClamped}</span>
		<span
			>{unit === 'year'
				? Math.round((minClamped + maxClamped) / 2)
				: (minClamped + maxClamped) / 2}</span
		>
		<span>{maxClamped}</span>
	</div>
</div>

<style>
	.touch-zone {
		touch-action: none;
	}
	.track {
		touch-action: none;
	}
	.fill {
		pointer-events: none;
		transition: width 140ms ease-out;
	}
	.thumb {
		touch-action: none;
		cursor: grab;
		display: block;
		transition:
			left 140ms ease-out,
			transform 140ms ease-out,
			box-shadow 140ms ease-out;
	}
	.dragging .fill {
		transition: none;
	}
	.dragging .thumb {
		transition:
			transform 90ms ease-out,
			box-shadow 90ms ease-out;
	}
	.thumb:active {
		cursor: grabbing;
	}
	.sr-only {
		position: absolute !important;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
