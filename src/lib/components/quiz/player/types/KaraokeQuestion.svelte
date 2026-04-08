<script lang="ts">
	import type { GameStatus, KaraokePlaybackSync, QuizQuestionKaraoke } from '$lib/quiz/types';
	import KaraokeDisplay from '$lib/components/quiz/shared/KaraokeDisplay.svelte';

	type Props = {
		status: GameStatus;
		question: QuizQuestionKaraoke;
		sync?: KaraokePlaybackSync;
	};

	let { status, question, sync }: Props = $props();
</script>

<KaraokeDisplay {status} {question} {sync} mode="phone" audioMode="muted" />
