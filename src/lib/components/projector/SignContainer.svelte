<script lang="ts">
	import type { Snippet } from 'svelte';

	type SignVariant = 'yellow' | 'red' | 'blue';

	interface Props {
		text: string;
		variant?: SignVariant;
		x?: number;
		y?: number;
		size?: number;
	}

	let { text, variant = 'yellow', x = 0, y = 0, size = 1 }: Props = $props();

	// Map variants to specific glow colors for inline styles or class logic
	const variantClasses = {
		yellow: 'border-yellow-500 text-yellow-100 shadow-yellow-500',
		red: 'border-red-600 text-red-100 shadow-red-600',
		blue: 'border-cyan-400 text-cyan-50 shadow-cyan-400'
	};
</script>

<div class="perspective-container">
	<span class="sign-container {variant}" style="--x: {x}rem; --y: {y}rem; --size: {3 * size}rem;">
		<span class="glow-text">{text}</span>
	</span>
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
			box-shadow 240ms;
		will-change: transform;
	}

	/* The Neon Glow Magic 
       We use multiple text-shadows to create layers of light diffusion.
    */
	.glow-text {
		transition: all 0.2s ease-in-out;
		border: solid 0.3rem;
		padding: 0.0em 0.8rem;
		border-radius: 0.3em;
	}

	/* --- Variant: YELLOW (Snacks) --- */
	.yellow {
		border-color: #d4a017;
		color: #fff06dbe; /* LemonChiffon text */
		text-shadow:
			0 0 5px #a99000,
			0 0 10px #ffd700,
			0 0 20px #d49f00e1,
			0 0 40px #e6ac00;
	}

	/* --- Variant: RED (Hot Dogs) --- */
	.red {
		/* border-color: #b62121; */
		color: #ffc758; /* Light red text */
		box-shadow:
			0 0 20px rgba(255, 0, 0, 0.1),
			inset 0 0 10px rgba(255, 0, 0, 0.1);
		text-shadow:
			0 0 5px #e42c2c,
			0 0 10px #ff0000,
			0 0 60px #990000,
			0 0 80px #ed2f00;
	}

	/* --- Variant: BLUE (Cold Drinks) --- */
	.blue {
        letter-spacing:-.1ch;
		border-color: #008b8b;
		color: #c3f6f6; /* Light cyan text */
		box-shadow:
			0 0 20px rgba(0, 255, 255, 0.4),
			inset 0 0 10px rgba(0, 255, 255, 0.2);
		text-shadow:
			0 0 5px #3f8dc1,
			0 0 10px #41a4a4,
			0 0 20px #008b8b,
			0 0 40px #008b8b;
	}
</style>
