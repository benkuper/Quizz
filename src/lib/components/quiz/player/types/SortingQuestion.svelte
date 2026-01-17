<script lang="ts">
	import SortableList from '../ui/SortableList.svelte';
	import type { QuizQuestionSorting } from '$lib/quiz/types';

	type Props = {
		question: QuizQuestionSorting;
		value: string[] | null;
		onChange: (next: string[]) => void;
	};

	let { question, value, onChange }: Props = $props();

	const currentOrder = $derived(Array.isArray(value) && value.length ? value : question.options ?? []);
</script>

<div class="rounded-2xl bg-slate-900 p-4">
	<div class="text-sm text-slate-300">Drag to reorder</div>
	<div class="mt-3">
		<SortableList items={question.options ?? []} value={currentOrder} onChange={onChange} />
	</div>
</div>
