<script lang="ts">
	import type { GameStatus, KaraokePlaybackSync, QuizQuestionKaraoke } from '$lib/quiz/types';
	import KaraokeDisplay from '$lib/components/quiz/shared/KaraokeDisplay.svelte';

	type Props = {
		status: GameStatus;
		question: QuizQuestionKaraoke;
		sync?: KaraokePlaybackSync;
		onFinished?: () => void;
	};

	let { status, question, sync, onFinished }: Props = $props();
</script>

<KaraokeDisplay {status} {question} {sync} mode="projector" audioMode="audible" {onFinished} />
