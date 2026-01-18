<script lang="ts">
	type Props = {
		player: any;
		gameStatus?: string;
	};

	let { player, gameStatus }: Props = $props();

	let playerStatus = $derived.by(() => {
		if (!player.connected) return 'offline';
		if (gameStatus === 'review') {
			if (!player.answered) return 'review-unanswered';
			return player.lastCorrect ? 'review-correct' : 'review-incorrect';
		}
		if (player.answered) return 'answered';
		return 'thinking';
	});
</script>

<div class="player-info-card {playerStatus}">
	{player.name}
	&nbsp;:&nbsp;
	{player.score}
</div>

<style>
	.player-info-card {
		display: inline-block;
        margin:.25rem;
		font-size: 2.3rem;
		font-weight: 100;
		border-radius: 2rem;
		height: 100%;
		border: 0.125rem solid var(--border, #e5e7eb);
		padding: 0.025rem 1rem;
		background: rgba(0, 0, 0, 0.6);
        transition: background-color 0.3s, border-color 0.3s, color 0.3s;
	}

	.player-info-card.offline {
		opacity: 0.4;
	}

	.player-info-card.review-unanswered {
		background: rgba(239, 68, 68, 0.2);
		border-color: #ef4444;
	}
	.player-info-card.review-correct {
		background: rgba(16, 185, 129, 0.2);
		border-color: #10b981;
	}
	.player-info-card.review-incorrect {
		background: rgba(239, 68, 68, 0.2);
		border-color: #ef4444;
        color: #f18b8b;
	}
	.player-info-card.answered {
		background: rgba(238, 235, 23, 0.2);
		border-color: #e6e211;
	}

	.player-info-card.thinking {
		background: rgba(59, 130, 246, 0.2);
		border-color: #3b82f6;
	}
</style>
