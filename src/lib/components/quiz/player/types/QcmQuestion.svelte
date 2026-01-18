<script lang="ts">
	import type { QuizQuestionQcm } from '$lib/quiz/types';

	type Props = {
		question: QuizQuestionQcm;
		value: string | string[] | null;
		onChange: (next: string | string[] | null) => void;
	};

	let { question, value, onChange }: Props = $props();

	const isMulti = $derived(Boolean(question.multiple));
	const selectedSingle = $derived(!isMulti && typeof value === 'string' ? value : null);
	const selectedMulti = $derived(isMulti && Array.isArray(value) ? value : []);

	function toggle(opt: string) {
		if (isMulti) {
			const cur = selectedMulti;
			if (cur.includes(opt)) onChange(cur.filter((x) => x !== opt));
			else onChange([...cur, opt]);
			return;
		}
		onChange(opt);
	}
</script>

<div class="grid gap-2">
	{#each question.options ?? [] as opt}
		<button
			type="button"
			class="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-4 text-left text-base font-semibold active:scale-[0.99]"
			class:ring-2={(!isMulti && selectedSingle === opt) || (isMulti && selectedMulti.includes(opt))}
			class:ring-indigo-400={(!isMulti && selectedSingle === opt) || (isMulti && selectedMulti.includes(opt))}
			onclick={() => toggle(opt)}
		>
			<div class="flex items-center justify-between gap-3">
				<span>{opt}</span>
				{#if isMulti}
					<span class="text-sm text-slate-300">{selectedMulti.includes(opt) ? '✓' : ''}</span>
				{:else}
					<span class="text-sm text-slate-300">{selectedSingle === opt ? '✓' : ''}</span>
				{/if}
			</div>
		</button>
	{/each}
</div>

