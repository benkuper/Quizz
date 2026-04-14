<script lang="ts">
	import type { QuizOptionAnswer, QuizQuestionDeblur } from '$lib/quiz/types';
	import QcmQuestion from './QcmQuestion.svelte';

	type Props = {
		question: QuizQuestionDeblur;
		value: QuizOptionAnswer | QuizOptionAnswer[] | null;
		onChange: (next: QuizOptionAnswer | QuizOptionAnswer[] | null) => void;
	};

	let { question, value, onChange }: Props = $props();

	const questionText = $derived.by(() =>
		Array.isArray(question.question) ? question.question.join(' ') : String(question.question ?? '')
	);
</script>


<section class="rounded-[1.75rem] bg-slate-950/90 p-3 shadow-[0_1.2rem_2.8rem_rgba(0,0,0,0.32)]">
	<div class="flex min-w-0 flex-col gap-3 rounded-[1.4rem] border border-slate-800 bg-slate-900/80 p-4">
		<div class="space-y-2">
			<div class="text-[0.72rem] font-black uppercase tracking-[0.24em] text-slate-400">Deblur</div>
			<h2 class="text-balance text-[clamp(1.15rem,4vw,1.85rem)] font-black leading-tight text-white">
				{questionText}
			</h2>
		</div>

		<div class="min-h-0">
			<QcmQuestion question={question as any} value={value} onChange={onChange} />
		</div>
	</div>
</section>