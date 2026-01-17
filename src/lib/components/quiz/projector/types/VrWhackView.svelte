<script lang="ts">
	import type { GameStatus, QuizQuestionVrWhack } from '$lib/quiz/types';

	type Props = {
		status: GameStatus;
		question: QuizQuestionVrWhack;
	};

	let { status, question }: Props = $props();

	const hint = $derived(String((question as any)?.vrwhack?.hint ?? 'Players look around with their phone and tap targets for points.'));
</script>

<div class="muted">Point & shoot (fake-VR)</div>
<div class="muted">{hint}</div>

{#if status === 'review'}
	<div class="muted">Points = number of targets tapped before the timer ended.</div>
{/if}
