<script lang="ts">
	import type { OptionRevealState } from '$lib/quiz/types';

	type Props = {
		options: string[];
		reveal: OptionRevealState;
		labels?: string[];
		optionImages?: Array<string | null>;
		layout?: 'grid' | 'sidebar';
		textScale?: 'default' | 'large';
		showLabels?: boolean;
		slotStates?: Array<'correct' | 'wrong' | null>;
		onFocusImageChange?: ((payload: { label?: string; text: string; imageSrc: string } | null) => void) | undefined;
	};

	let {
		options,
		reveal,
		labels = [],
		optionImages = [],
		layout = 'grid',
		textScale = 'default',
		showLabels = false,
		slotStates = [],
		onFocusImageChange
	}: Props = $props();

	let landingOptionIndexes = $state<number[]>([]);
	let fadingFocusOptionIndex = $state<number | null>(null);

	let previousFocusedOptionIndex: number | null = null;
	let previousPlacedOptionIndexes: number[] = [];

	const focusedOptionIndex = $derived(reveal?.focusedOptionIndex ?? null);
	const activeFocusOptionIndex = $derived(focusedOptionIndex ?? fadingFocusOptionIndex);
	const placedOptionIndexes = $derived(Array.isArray(reveal?.placedOptionIndexes) ? reveal.placedOptionIndexes : []);
	const placedLookup = $derived.by(() => new Set(placedOptionIndexes));
	const activeFocusHasImage = $derived(
		activeFocusOptionIndex !== null && Boolean(optionImage(activeFocusOptionIndex))
	);
	const activeFocusImagePayload = $derived.by(() => {
		if (activeFocusOptionIndex === null) return null;
		const imageSrc = optionImage(activeFocusOptionIndex);
		if (!imageSrc) return null;

		return {
			label: showLabels ? optionLabel(activeFocusOptionIndex) : undefined,
			text: options[activeFocusOptionIndex],
			imageSrc
		};
	});

	function optionLabel(index: number) {
		return labels[index] ?? String(index + 1);
	}

	function optionImage(index: number) {
		return optionImages[index] ?? null;
	}

	function slotState(index: number) {
		return slotStates[index] ?? null;
	}

	$effect(() => {
		const nextFocused = reveal?.focusedOptionIndex ?? null;
		const nextPlaced = Array.isArray(reveal?.placedOptionIndexes) ? [...reveal.placedOptionIndexes] : [];
		const previousFocused = previousFocusedOptionIndex;
		const previousPlaced = previousPlacedOptionIndexes;

		if (
			previousFocused !== null &&
			nextFocused === null &&
			nextPlaced.includes(previousFocused) &&
			!previousPlaced.includes(previousFocused)
		) {
			fadingFocusOptionIndex = previousFocused;
			landingOptionIndexes = [...landingOptionIndexes.filter((value) => value !== previousFocused), previousFocused];

			window.setTimeout(() => {
				landingOptionIndexes = landingOptionIndexes.filter((value) => value !== previousFocused);
			}, 320);

			window.setTimeout(() => {
				if (fadingFocusOptionIndex === previousFocused) {
					fadingFocusOptionIndex = null;
				}
			}, 280);
		}

		previousFocusedOptionIndex = nextFocused;
		previousPlacedOptionIndexes = nextPlaced;
	});

	$effect(() => {
		onFocusImageChange?.(activeFocusImagePayload);
	});

	$effect(() => {
		return () => {
			onFocusImageChange?.(null);
		};
	});
</script>


<div class="reveal-board" class:is-sidebar={layout === 'sidebar'} class:has-large-text={textScale === 'large'}>
	<div class="options reveal-grid" class:layout-sidebar={layout === 'sidebar'}>
		{#each options as option, index}
			<div
				class="option reveal-slot"
				class:has-image={Boolean(optionImage(index))}
				class:is-placed={placedLookup.has(index)}
				class:is-landing={landingOptionIndexes.includes(index)}
				class:is-review-correct={slotState(index) === 'correct'}
				class:is-review-wrong={slotState(index) === 'wrong'}
			>
				<div
					class="slot-content"
					class:has-image={Boolean(optionImage(index))}
					class:is-hidden={!placedLookup.has(index) || focusedOptionIndex === index || landingOptionIndexes.includes(index)}
					class:is-fading-in={landingOptionIndexes.includes(index)}
				>
					{#if showLabels}
						<span class="option-label">{optionLabel(index)}</span>
					{/if}
					<div class="option-body" class:has-image={Boolean(optionImage(index))}>
						{#if optionImage(index)}
							<div class="option-image-shell">
								<img class="option-image" src={optionImage(index)!} alt={option} />
							</div>
						{/if}
						<span class="option-text">{option}</span>
					</div>
				</div>

				{#if !placedLookup.has(index) || focusedOptionIndex === index}
					<div class="slot-placeholder-wrap">
					<span class="slot-placeholder">{showLabels ? optionLabel(index) : index + 1}</span>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	{#if activeFocusOptionIndex !== null && !activeFocusHasImage}
		<div class="focus-stage">
			<div
				class="option focus-card"
				class:has-image={activeFocusHasImage}
				class:is-fading-out={focusedOptionIndex === null && fadingFocusOptionIndex !== null}
			>
				{#if showLabels}
					<span class="option-label">{optionLabel(activeFocusOptionIndex)}</span>
				{/if}
				<div class="option-body" class:has-image={activeFocusHasImage}>
					{#if optionImage(activeFocusOptionIndex)}
						<div class="option-image-shell focus-image-shell">
							<img
								class="option-image focus-image"
								src={optionImage(activeFocusOptionIndex)!}
								alt={options[activeFocusOptionIndex]}
							/>
						</div>
					{/if}
					<span class="option-text">{options[activeFocusOptionIndex]}</span>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.reveal-board {
		position: relative;
		width: 100%;
		min-height: 24rem;
	}

	.reveal-board.is-sidebar {
		min-height: 0;
		height: 100%;
		max-height: 100%;
		overflow: hidden;
	}

	.reveal-grid {
		position: relative;
		z-index: 1;
		gap:.5rem;
	}

	.reveal-grid.layout-sidebar {
		grid-template-columns: 1fr;
		grid-auto-rows: minmax(0, 1fr);
		align-content: start;
		height: 100%;
		min-height: 0;
	}

	.reveal-slot {
		min-height: 8.5rem;
		border-style: dashed;
		justify-content: center;
		box-sizing: border-box;
		position: relative;
	}

	.slot-content {
		display: flex;
		align-items: center;
		gap: 1rem;
		width: 100%;
	}

	.option
	{
		position:relative;
		padding:0;
	}

	.option-label
	{
		position:absolute;
		left:.5rem;
		top:.5rem;
		padding:1rem;
		background:rgba(0,0,0,0.3);
		border-radius:0.75rem;
		font-size:0.75rem;
		font-size: 5rem;

	}


	.option-body {
		display: flex;
		align-items: center;
		gap: 1rem;
		width: 100%;
		min-width: 0;
	}

	.option-text {
		font-size: 3rem;
		color: rgba(255, 255, 255, 0.95);
		width:100%;
		padding: 1rem;
		text-align: center;
	}

	.option-body.has-image {
		align-items: stretch;
	}

	.has-image .option-text {
		flex: 1;
		font-size: 1.5rem;
		color: rgba(255, 255, 255, 0.9);
		padding: 0 1rem;
		line-height: 1rem;
	}

	.option-image-shell {
		width: min(18vw, 10rem);
		height: 6.5rem;
		flex-shrink: 0;
		border-radius: 1rem;
		overflow: hidden;
		background: rgba(15, 23, 42, 0.92);
		border: 0.1rem solid rgba(255, 255, 255, 0.12);
	}

	.option-image {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.slot-content.is-hidden {
		visibility: hidden;
	}

	.slot-content.is-fading-in {
		animation: placed-fade-in 0.32s ease-out;
	}

	.slot-placeholder-wrap {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
	}

	.reveal-slot:not(.is-placed) {
		color: rgba(255, 255, 255, 0.3);
		background: rgba(255, 255, 255, 0.04);
		border-color: rgba(255, 255, 255, 0.12);
		box-shadow: none;
		text-align: center;
	}

	.reveal-slot.is-placed {
		border-style: solid;
	}

	.reveal-slot.is-landing {
		opacity: 0;
	}

	.reveal-slot.is-review-correct {
		background-color: #166534;
		border-color: #22c55e;
		color: white;
	}

	.reveal-slot.is-review-wrong {
		background-color: #7f1d1d;
		border-color: #ef4444;
		color: white;
	}

	.slot-placeholder {
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: 0.08em;
	}

	.focus-stage {
		position: absolute;
		inset: 0;
		z-index: 3;
		display: grid;
		place-items: start center;
		padding-top: 2rem;
		pointer-events: none;
	}

	.focus-card,
	.focus-card {
		width: min(72%, 47.5rem);
		min-height: 8rem;
		padding: 2rem 2.25rem;
		box-shadow: 0 1.25rem 3rem rgba(0, 0, 0, 0.45);
		border-color: rgba(255, 255, 255, 0.3);
		background: rgba(24, 24, 27, 0.97);
		box-sizing: border-box;
	}

	.focus-card {
		animation: focus-enter 0.28s ease-out;
	}

	.focus-card.has-image {
		padding-block: 1.5rem 1.75rem;
	}

	.focus-card .option-body.has-image {
		flex-direction: column;
		align-items: center;
		text-align: center;
	}

	.focus-image-shell {
		width: min(100%, 26rem);
		height: 14rem;
	}

	.focus-image {
		background: rgba(15, 23, 42, 0.92);
	}

	.focus-card.is-fading-out {
		animation: focus-exit 0.28s ease-in forwards;
	}

	@keyframes focus-enter {
		from {
			opacity: 0;
			transform: translateY(1rem) scale(0.96);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	@keyframes focus-exit {
		from {
			opacity: 1;
		}
		to {
			opacity: 0;
		}
	}

	@keyframes placed-fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.focus-card,
		.slot-content.is-fading-in {
			animation: none;
		}
	}

	.reveal-board.is-sidebar .reveal-slot {
		min-height: clamp(2.7rem, 5.3vh, 3.8rem);
	}

	.reveal-board.is-sidebar .option-label {
		left: 0.35rem;
		top: 50%;
		transform: translateY(-50%);
		padding: 0.2rem 0.42rem;
		font-size: clamp(0.8rem, 1.25vw, 1rem);
		line-height: 1;
	}

	.reveal-board.is-sidebar .option-body {
		padding-left: 2.1rem;
	}

	.reveal-board.is-sidebar .option-text {
		padding: 0.28rem 0.45rem 0.28rem 0;
		font-size: clamp(1rem, 1.75vw, 1.45rem);
		line-height: 1.02;
		text-align: left;
		overflow-wrap: anywhere;
	}

	.reveal-board.is-sidebar .has-image .option-text {
		font-size: clamp(0.95rem, 1.45vw, 1.15rem);
		line-height: 1.15;
	}

	.reveal-board.is-sidebar .slot-placeholder {
		font-size: clamp(0.95rem, 1.4vw, 1.15rem);
	}

	.reveal-board.is-sidebar .focus-stage {
		place-items: start stretch;
		padding-top: 0;
	}

	.reveal-board.is-sidebar .focus-card {
		width: 100%;
		min-height: clamp(2.7rem, 5.3vh, 3.8rem);
		padding: 0.45rem 0.55rem;
	}

	.reveal-board.is-sidebar .focus-card .option-body {
		padding-left: 2.1rem;
	}

	.reveal-board.is-sidebar.has-large-text .option-label {
		font-size: clamp(0.92rem, 1.45vw, 1.15rem);
	}

	.reveal-board.is-sidebar.has-large-text .option-text {
		font-size: clamp(1.15rem, 2vw, 1.7rem);
		line-height: 1.04;
	}

	.reveal-board.is-sidebar.has-large-text .has-image .option-text {
		font-size: clamp(1rem, 1.65vw, 1.3rem);
	}

	.reveal-board.is-sidebar.has-large-text .slot-placeholder {
		font-size: clamp(1rem, 1.55vw, 1.25rem);
	}

	@media (max-width: 60rem) {
		.slot-content.has-image,
		.option-body.has-image {
			flex-direction: column;
			align-items: flex-start;
		}

		.option-image-shell {
			width: 100%;
			height: 9rem;
		}

		.focus-card {
			width: min(88%, 36rem);
		}
	}
</style>