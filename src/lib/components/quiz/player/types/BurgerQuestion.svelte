<script lang="ts">
	import type { GameStatus, QuizQuestionBurger } from '$lib/quiz/types';

	type Props = {
		status: GameStatus;
		question: QuizQuestionBurger;
	};

	let { status, question }: Props = $props();

	const prompt = $derived(
		Array.isArray(question.question) ? question.question.join(' ') : String(question.question ?? '')
	);
	const itemCount = $derived(Array.isArray(question.options) ? question.options.length : 0);
	const helperText = $derived(
		status === 'reading'
			? 'Lis le theme puis regarde le projecteur pour la revelation pas a pas.'
			: 'Regarde le projecteur pour suivre la revelation.'
	);
</script>

<div class="burger-question">
	<div class="eyebrow">Burger</div>
	<h2>{prompt}</h2>
	<p>{helperText}</p>
	<div class="count">{itemCount} paire{itemCount > 1 ? 's' : ''} a retrouver</div>
</div>

<style>
	.burger-question {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.75rem;
		border-radius: 1.5rem;
		background: rgb(15 23 42 / 0.92);
		text-align: center;
	}

	.eyebrow {
		font-size: 0.8rem;
		font-weight: 800;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: rgb(148 163 184);
	}

	h2 {
		margin: 0;
		font-size: 1.8rem;
		font-weight: 800;
		color: white;
	}

	p {
		margin: 0;
		font-size: 1rem;
		color: rgb(203 213 225);
	}

	.count {
		font-size: 0.95rem;
		font-weight: 600;
		color: rgb(226 232 240);
	}
</style>