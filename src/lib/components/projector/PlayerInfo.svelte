<script lang="ts">
	import TeamBadge from '$lib/components/shared/TeamBadge.svelte';

	type Props = {
		player: any;
		gameStatus?: string;
	};

	let { player, gameStatus }: Props = $props();
	const fallbackLabel = $derived.by(() => {
		const name = String(player?.name ?? '').trim();
		if (!name) return '?';
		return name
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('');
	});
	const winningSpin = $derived(gameStatus === 'review' && player?.lastCorrect === true);

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
	<div class="badge-shell" class:dimmed={!player.connected}>
		<TeamBadge
			teamId={String(player?.id ?? '')}
			teamName={String(player?.name ?? fallbackLabel)}
			spinning={winningSpin}
			spinDuration="12s"
			dimmed={!player.connected}
		/>
	</div>
	<!-- <div class="text-block">
		<div class="team-name">{player.name}</div>
		<div class="team-score">{player.score} pts</div>
	</div> -->
</div>

<style>
	.player-info-card {
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
		/* margin: 0.25rem; */
		font-size: 1.6rem;
		font-weight: 100;
		border-radius: 5rem;
		height: 100%;
		border: 0.125rem solid var(--border, #e5e7eb);
		/* padding: 0.4rem 0.9rem; */
		background: rgba(0, 0, 0, 0.6);
		transition: background-color 0.3s, border-color 0.3s, color 0.3s;
	}

	.badge-shell {
		height: 10.5rem;
		width: 10.5rem;
		flex-shrink: 0;
		border-radius: 9999px;
	}

	.badge-shell.dimmed {
		opacity: 0.9;
	}

	.text-block {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.team-name {
		font-size: 1.35rem;
		line-height: 1.2;
	}

	.team-score {
		font-size: 1rem;
		opacity: 0.85;
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
