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
	const questionText = $derived.by(() =>
		Array.isArray(question.question) ? question.question.join(' ') : String(question.question ?? '')
	);
	const showImage = $derived((status === 'question' || status === 'review') && !imageFailed);
	const revealProgress = $derived.by(() => {
		if (status === 'review' || status === 'reveal') return 1;
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

<div class="deblur-layout" class:is-image-missing={!showImage}>
	{#if showImage}
		<div class="deblur-stage">
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
		</div>
	{/if}

	<aside class="deblur-sidebar">
		<h2 class="deblur-question">{questionText}</h2>
		<div class="deblur-options">
			<QcmView {status} question={question} {optionReveal} layout="sidebar" />
		</div>
	</aside>
</div>

<style>
	.deblur-layout {
		display: grid;
		grid-template-columns: minmax(0, 1.8fr) minmax(18rem, 0.95fr);
		gap: 1rem;
		width: 100%;
		max-width: 100%;
		min-height: 24rem;
		align-items: stretch;
	}

	.deblur-layout.is-image-missing {
		grid-template-columns: minmax(0, 1fr);
	}

	.deblur-stage {
		min-width: 0;
		min-height: 0;
	}

	.deblur-image-shell {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		min-height: 24rem;
		padding: 1rem;
		border-radius: 1.5rem;
		background:
			linear-gradient(180deg, rgba(2, 6, 23, 0.98) 0%, rgba(2, 6, 23, 0.94) 22%, rgba(2, 6, 23, 0.9) 100%),
			radial-gradient(circle at top, rgba(255, 255, 255, 0.08), transparent 44%);
		border: 0.1rem solid rgba(148, 163, 184, 0.22);
		box-shadow: 0 1.25rem 3rem rgba(15, 23, 42, 0.28);
		box-sizing: border-box;
	}

	.deblur-image {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
		object-position: center center;
		transition: filter 1s linear;
		transform: scale(1.01);
		transform-origin: center;
		filter: blur(var(--deblur-amount, 0rem)) drop-shadow(0 1.4rem 2.8rem rgba(0, 0, 0, 0.42));
	}

	.deblur-image.is-active {
		will-change: filter;
	}

	.deblur-sidebar {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		min-width: 0;
		min-height: 0;
		padding: 0.4rem 0;
	}

	.deblur-question {
		margin: 0;
		font-size: clamp(1.5rem, 2vw, 2.25rem);
		line-height: 1.08;
		text-align: left;
	}

	.deblur-options {
		flex: 1 1 auto;
		min-height: 0;
	}

	@media (max-width: 60rem) {
		.deblur-layout {
			grid-template-columns: minmax(0, 1fr);
		}

		.deblur-image-shell {
			min-height: 18rem;
		}
	}
</style>