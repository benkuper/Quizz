<script lang="ts">
	import { getMedia } from '$lib/url.svelte';

	type Props = {
		questionId?: string;
		maxProbeCount?: number;
	};

	let { questionId, maxProbeCount = 8 }: Props = $props();
	let imageSources: string[] = $state([]);

	function loadable(src: string) {
		return new Promise<boolean>((resolve) => {
			const img = new Image();
			img.onload = () => resolve(true);
			img.onerror = () => resolve(false);
			img.src = src;
		});
	}

	$effect(() => {
		const id = String(questionId ?? '').trim();
		let cancelled = false;

		imageSources = [];
		if (!id) return;

		(async () => {
			const nextSources: string[] = [];

			for (let index = 1; index <= maxProbeCount; index++) {
				const src = getMedia(`${id}/${index}.png`);
				const exists = await loadable(src);
				if (!exists) break;
				nextSources.push(src);
			}

			if (!cancelled) imageSources = nextSources;
		})();

		return () => {
			cancelled = true;
		};
	});
</script>

{#if imageSources.length > 0}
	<div class="question-images">
		{#each imageSources as src, index (src)}
			<img class="question-image" src={src} alt={`Illustration ${index + 1}`} />
		{/each}
	</div>
{/if}

<style>
	.question-images {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 1rem;
		width: min(70rem, 100%);
		margin: 0 auto 1.5rem;
	}

	.question-image {
		width: 100%;
		height: 14rem;
		object-fit: contain;
		border-radius: 1rem;
		background: rgba(15, 23, 42, 0.9);
		border: 0.1rem solid rgba(148, 163, 184, 0.22);
		padding: 0.5rem;
	}
</style>