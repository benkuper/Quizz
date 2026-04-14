<script lang="ts">
	import type { Snippet } from 'svelte';

	type SignVariant = 'yellow' | 'red' | 'blue';

	interface Props {
		text: string;
		variant?: SignVariant;
		x?: number;
		y?: number;
		size?: number;
		flicker?: number;
		lit?: boolean;
	}

	let { text, variant = 'yellow', x = 0, y = 0, size = 1, flicker = 5, lit = true }: Props = $props();
</script>

<div class="perspective-container">
	<div
		class="sign-container {variant}"
		class:is-unlit={!lit}
		style="--x: {x}rem; --y: {y}rem; --size: {3 * size}rem; --flicker: {flicker}s;"
	>
		<div class="glow-text">{text}</div>
	</div>
</div>

<style>
	/* Base Container Styles */
	@font-face {
		font-family: 'Oswald';
		src: url('/oswald.ttf') format('truetype');
		font-weight: normal;
		font-style: normal;
		font-display: swap;
	}

	.perspective-container {
		position: absolute;
		perspective: 60rem;
		perspective-origin: 50% 100%; /* center bottom */
		width: 100%;
		height: 100%;
		display: flex;
		align-items: flex-end; /* keep sign near bottom so pivot feels natural */
		justify-content: center;
		padding-bottom: 4rem;
	}

	.sign-container {
		box-sizing: content-box;
		font-family: 'Oswald', sans-serif;
		font-weight: 800;
		font-size: var(--size);
		text-transform: uppercase;
		transform-style: preserve-3d;
		-webkit-transform-style: preserve-3d;
		transform-origin: 50% 100%; /* pivot at center bottom */
		/* move up-right and give depth with perspective; slight left rotation */
		transform: translate3d(var(--x), var(--y), -11rem) rotateY(-4deg);
		transition:
			transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1),
			box-shadow 240ms,
			border-color 180ms ease,
			color 180ms ease,
			opacity 180ms ease;
		will-change: transform;
		width: 180px;
		height: 50px;
		overflow: hidden;

		border: solid 0.3rem;
		border-radius: 0.3em;
		padding: 0.2em 0.4em;

		animation: flicker var(--flicker) infinite;
	}

	.sign-container.is-unlit {
		animation: none;
		box-shadow: none;
		text-shadow: none;
		opacity: 0.9;
		background: rgba(0, 0, 0, 0.28);
	}

	@keyframes flicker {
		0%,
		18%,
		22%,
		25%,
		53%,
		57%,
		100% {
			opacity: 1;
		}
		20%,
		24%,
		55% {
			opacity: 0.96; /* Subtle dim logic */
		}
		21%,
		23% {
			opacity: 0.6; /* Slightly more dim */
		}
	}
	/* The Neon Glow Magic 
       We use multiple text-shadows to create layers of light diffusion.
    */
	.glow-text {
		width: 100%;
		text-align: center;
		transition: all 0.2s ease-in-out;
		white-space: nowrap;

		min-width: 100%;
		width: fit-content;
		animation: pingpong 4s ease-in-out infinite alternate;
	}

	.sign-container.is-unlit .glow-text {
		animation: none;
		transform: none;
	}

	@keyframes pingpong {
		to {
			transform: translateX(calc(180px - 100%));
		}
	}

	/* --- Variant: YELLOW (Snacks) --- */
	.yellow {
		border-color: #d4a017;
		color: #feee5abe; /* LemonChiffon text */
		text-shadow:
			0 0 5px #a99000,
			0 0 10px #ffd700,
			0 0 20px #d49f00e1,
			0 0 40px #e6ac00;
		box-shadow:
			0 0 20px rgb(240, 152, 10),
			inset 0 0 30px rgba(248, 160, 6, 0.843);
	}

	.yellow.is-unlit {
		border-color: rgba(212, 160, 23, 0.35);
		color: rgba(92, 72, 14, 0.9);
	}

	/* --- Variant: RED (Hot Dogs) --- */
	.red {
		/* border-color: #b62121; */
		color: #ffb676; /* Light red text */
		border-color: #ff3b3b;
		box-shadow:
			0 0 20px rgb(198, 15, 15),
			inset 0 0 20px rgba(213, 11, 11, 0.843);
		text-shadow:
			0 0 5px #e42c2c,
			0 0 10px #ff0000,
			0 0 60px #990000,
			0 0 80px #ed2f00;
	}

	.red.is-unlit {
		border-color: rgba(255, 59, 59, 0.35);
		color: rgba(104, 42, 28, 0.9);
	}

	/* --- Variant: BLUE (Cold Drinks) --- */
	.blue {
		letter-spacing: -0.1ch;
		border-color: #008b8b;
		color: #c3f6f6; /* Light cyan text */
		box-shadow:
			0 0 20px rgba(0, 255, 255, 0.4),
			inset 0 0 20px rgba(44, 217, 217, 0.913);
		text-shadow:
			0 0 5px #3f8dc1,
			0 0 10px #41a4a4,
			0 0 20px #008b8b,
			0 0 40px #008b8b;
	}

	.blue.is-unlit {
		border-color: rgba(0, 139, 139, 0.35);
		color: rgba(40, 79, 86, 0.95);
	}
</style>
