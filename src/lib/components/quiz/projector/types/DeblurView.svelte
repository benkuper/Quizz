<script lang="ts">
	import { getMedia } from '$lib/url.svelte';
	import type { GameStatus, OptionRevealState, QuizQuestionDeblur } from '$lib/quiz/types';
	import QcmView from './QcmView.svelte';

	const MAX_BLUR_REM = 1.8;

	type Props = {
		status: GameStatus;
		question: QuizQuestionDeblur;
		optionReveal?: OptionRevealState;
		timer?: number;
	};

	let { status, question, optionReveal, timer = 0 }: Props = $props();
	let imageFailed = $state(false);

	const imageSrc = $derived.by(() => getMedia(`${question.id}/deblur.png`));
	const totalTime = $derived.by(() => {
		const raw = Number(question.time ?? 20);
		return Number.isFinite(raw) && raw > 0 ? raw : 20;
	});
	const revealProgress = $derived.by(() => {
		if (status === 'review') return 1;
		if (status !== 'question') return 0;

		const remaining = Number(timer ?? 0);
		const clampedRemaining = Math.min(totalTime, Math.max(0, remaining));
		return 1 - clampedRemaining / totalTime;
	});
	const blurAmount = $derived.by(() => `${(1 - revealProgress) * MAX_BLUR_REM}rem`);

	$effect(() => {
		question.id;
		imageFailed = false;
	});
</script>

<div class="deblur-layout">
	{#if (status === 'question' || status === 'review') && !imageFailed}
		<div class="deblur-image-shell">
			<img
				src={imageSrc}
				alt=""
				class="deblur-image"
				class:is-active={status === 'question'}
				style:--deblur-amount={blurAmount}
				draggable="false"
				onerror={() => (imageFailed = true)}
			/>
		</div>
	{/if}

	<QcmView {status} question={question} {optionReveal} />
</div>

<style>
	.deblur-layout {
		display: grid;
		gap: 1.25rem;
		width: min(78rem, 100%);
	}

	.deblur-image-shell {
		width: min(54rem, 100%);
		margin: 0 auto;
		padding: 0.75rem;
		border-radius: 1.5rem;
		background: rgba(15, 23, 42, 0.92);
		border: 0.1rem solid rgba(148, 163, 184, 0.22);
		box-shadow: 0 1.25rem 3rem rgba(15, 23, 42, 0.28);
	}

	.deblur-image {
		display: block;
		width: 100%;
		max-height: 18rem;
		object-fit: contain;
		filter: blur(var(--deblur-amount, 0rem));
		transition: filter 1s linear;
		transform: scale(1.02);
		transform-origin: center;
	}

	.deblur-image.is-active {
		will-change: filter;
	}
</style>