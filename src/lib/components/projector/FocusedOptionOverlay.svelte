<script lang="ts">
	import type { FocusedOptionOverlayData } from './focusedOptionOverlay';

	type Props = FocusedOptionOverlayData;

	let { label = '', text, imageSrc }: Props = $props();
</script>

<div class="focused-option-overlay" aria-live="polite">
	<div class="focused-option-overlay__content">
		<div class="focused-option-overlay__header">
			{#if label}
				<span class="focused-option-overlay__label">{label}</span>
			{/if}
			<p class="focused-option-overlay__text">{text}</p>
		</div>

		<div class="focused-option-overlay__image-shell">
			<img class="focused-option-overlay__image" src={imageSrc} alt={text} />
		</div>
	</div>
</div>

<style>
	.focused-option-overlay {
		position: absolute;
		inset: 0;
		z-index: 1000;
		pointer-events: none;
		background:
			linear-gradient(180deg, rgba(2, 6, 23, 0.98) 0%, rgba(2, 6, 23, 0.94) 22%, rgba(2, 6, 23, 0.9) 100%),
			radial-gradient(circle at top, rgba(255, 255, 255, 0.08), transparent 44%);
		backdrop-filter: blur(0.5rem);
	}

	.focused-option-overlay__content {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		padding: 3rem 3.5rem 3.5rem;
		box-sizing: border-box;
		gap: 1.5rem;
	}

	.focused-option-overlay__header {
		display: grid;
		justify-items: center;
		align-content: start;
		gap: 1rem;
		min-height: 11rem;
		text-align: center;
		flex: 0 0 auto;
	}

	.focused-option-overlay__label {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.7rem 1.35rem;
		border-radius: 999rem;
		background: rgba(255, 255, 255, 0.12);
		border: 0.1rem solid rgba(255, 255, 255, 0.18);
		font-size: 2.1rem;
		font-weight: 800;
		line-height: 1;
	}

	.focused-option-overlay__text {
		margin: 0;
		max-width: 82rem;
		font-size: clamp(2.4rem, 3.1vw, 4rem);
		font-weight: 800;
		line-height: 1.12;
		color: rgba(255, 255, 255, 0.98);
		text-shadow: 0 0.25rem 1rem rgba(0, 0, 0, 0.55);
	}

	.focused-option-overlay__image-shell {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1 1 auto;
		min-height: 0;
		width: 100%;
		padding: 0 1rem 1rem;
		box-sizing: border-box;
		overflow: visible;
	}

	.focused-option-overlay__image {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
		object-position: center center;
		filter: drop-shadow(0 1.4rem 2.8rem rgba(0, 0, 0, 0.42));
	}

	@media (max-width: 60rem) {
		.focused-option-overlay__content {
			padding: 1.5rem 1.25rem 1.5rem;
			gap: 1rem;
		}

		.focused-option-overlay__header {
			min-height: 7.5rem;
		}

		.focused-option-overlay__label {
			font-size: 1.35rem;
			padding: 0.55rem 0.95rem;
		}

		.focused-option-overlay__text {
			max-width: 100%;
			font-size: clamp(1.5rem, 4.5vw, 2.15rem);
		}

		.focused-option-overlay__image-shell {
			padding: 0 0 0.5rem;
		}
	}
</style>