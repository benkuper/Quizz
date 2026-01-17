<script lang="ts">
	import type { QuizQuestionMedia } from '$lib/quiz/types';

	type Props = {
		question: QuizQuestionMedia;
	};

	let { question }: Props = $props();

	const items = $derived.by(() => {
		const raw = (question as any)?.media;
		return Array.isArray(raw) ? raw : raw ? [raw] : [];
	});

	function startAtAction(node: HTMLMediaElement, startAt: number | undefined) {
		if (!Number.isFinite(Number(startAt))) return;
		const desired = Math.max(0, Number(startAt));

		const apply = () => {
			try {
				if (Number.isFinite(desired)) node.currentTime = desired;
			} catch {
				// ignore
			}
		};

		// Some browsers won't allow setting currentTime until metadata is loaded.
		node.addEventListener('loadedmetadata', apply, { once: true });
		apply();

		return {
			destroy() {
				node.removeEventListener('loadedmetadata', apply);
			}
		};
	}
</script>

<!--
No content so players are all looking at the projector
-->

<div class="media-question">
    Media Interlude
</div>

