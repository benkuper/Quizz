<script lang="ts">
	import type { GameStatus, QuizQuestionMedia } from '$lib/quiz/types';
	import { getMedia } from '$lib/url.svelte';

	type Props = {
		status: GameStatus;
		question: QuizQuestionMedia;
		onFinished?: () => void;
	};

	let { question, onFinished }: Props = $props();

	
	const items = $derived.by(() => {
		const raw = (question as any)?.media;
		return Array.isArray(raw) ? raw : raw ? [raw] : [];
	});

	const lastVideoIndex = $derived.by(() => {
		for (let i = items.length - 1; i >= 0; i--) {
			if (items[i]?.kind === 'video') return i;
		}
		return -1;
	});

	function maybeFinished() {
		try {
			onFinished?.();
		} catch {
			// ignore
		}
	}

	function startAtAction(node: HTMLMediaElement, startAt: number | undefined) {
		if (!Number.isFinite(Number(startAt))) return;
		const desired = Math.max(0, Number(startAt));

		const apply = () => {
			try {
				node.currentTime = desired;
			} catch {
				// ignore
			}
		};

		node.addEventListener('loadedmetadata', apply, { once: true });
		apply();

		return {
			destroy() {
				node.removeEventListener('loadedmetadata', apply);
			}
		};
	}
</script>

<div class="media-wrap">
	{#each items as item, i (item?.src ?? i)}
		{#if item?.kind === 'image'}
			<img class="media" src={getMedia(item?.src)} alt={item.alt ?? ''} />
		{:else}
			<video
				class="media"
				src={getMedia(item?.src)}
				poster={item?.poster}
				playsinline
				preload="metadata"
				autoplay={item?.autoplay ?? true}
				muted={item?.muted ?? (item?.autoplay ?? true)}
				loop={item?.loop ?? false}
				controls={item?.controls ?? false}
				use:startAtAction={item?.startAt}
				onended={() => {
					if (i === lastVideoIndex && !(item?.loop ?? false)) maybeFinished();
				}}
			></video>
		{/if}
	{/each}
</div>

<style>
	.media-wrap {
		display: grid;
		gap: 1rem;
		width: min(70rem, 100%);
	}

	.media {
		width: 100%;
		max-height: 70vh;
		border-radius: 1.25rem;
		object-fit: contain;
		background: black;
		border: 0.1rem solid rgba(148, 163, 184, 0.22);
	}
</style>
