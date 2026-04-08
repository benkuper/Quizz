<script lang="ts">
	import type { OptionRevealState } from '$lib/quiz/types';

	type Props = {
		options: string[];
		reveal: OptionRevealState;
		labels?: string[];
		showLabels?: boolean;
	};

	let { options, reveal, labels = [], showLabels = false }: Props = $props();

	let landingOptionIndexes = $state<number[]>([]);
	let fadingFocusOptionIndex = $state<number | null>(null);

	let previousFocusedOptionIndex: number | null = null;
	let previousPlacedOptionIndexes: number[] = [];

	const focusedOptionIndex = $derived(reveal?.focusedOptionIndex ?? null);
	const placedOptionIndexes = $derived(Array.isArray(reveal?.placedOptionIndexes) ? reveal.placedOptionIndexes : []);
	const placedLookup = $derived.by(() => new Set(placedOptionIndexes));

	function optionLabel(index: number) {
		return labels[index] ?? String(index + 1);
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
</script>


<div class="reveal-board">
	<div class="options reveal-grid">
		{#each options as option, index}
			<div
				class="option reveal-slot"
				class:is-placed={placedLookup.has(index)}
				class:is-landing={landingOptionIndexes.includes(index)}
			>
				<div
					class="slot-content"
					class:is-hidden={!placedLookup.has(index) || focusedOptionIndex === index || landingOptionIndexes.includes(index)}
					class:is-fading-in={landingOptionIndexes.includes(index)}
				>
					{#if showLabels}
						<span class="option-label">{optionLabel(index)}</span>
					{/if}
					<span class="option-text">{option}</span>
				</div>

				{#if !placedLookup.has(index) || focusedOptionIndex === index}
					<div class="slot-placeholder-wrap">
					<span class="slot-placeholder">{showLabels ? optionLabel(index) : index + 1}</span>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	{#if focusedOptionIndex !== null || fadingFocusOptionIndex !== null}
		<div class="focus-stage">
			<div class="option focus-card" class:is-fading-out={focusedOptionIndex === null && fadingFocusOptionIndex !== null}>
				{#if showLabels}
					<span class="option-label">{optionLabel(focusedOptionIndex ?? fadingFocusOptionIndex!)}</span>
				{/if}
				<span class="option-text">{options[focusedOptionIndex ?? fadingFocusOptionIndex!]}</span>
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

	.reveal-grid {
		position: relative;
		z-index: 1;
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
</style>