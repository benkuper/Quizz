<script lang="ts">
	import { getTeamBadgeUrl } from '$lib/quiz/teamAssets';

	type Props = {
		player: any;
		gameStatus?: string;
	};

	let { player, gameStatus }: Props = $props();
	let badgeMissing = $state(false);

	const badgeUrl = $derived.by(() => getTeamBadgeUrl(String(player?.id ?? '')));
	const fallbackLabel = $derived.by(() => {
		const name = String(player?.name ?? '').trim();
		if (!name) return '?';
		return name
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('');
	});

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
		{#if badgeUrl && !badgeMissing}
			<img src={badgeUrl} alt={player.name} class="badge" onerror={() => (badgeMissing = true)} />
		{:else}
			<div class="badge-fallback">{fallbackLabel}</div>
		{/if}
	</div>
	<div class="text-block">
		<div class="team-name">{player.name}</div>
		<div class="team-score">{player.score} pts</div>
	</div>
</div>

<style>
	.player-info-card {
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
		margin: 0.25rem;
		font-size: 1.6rem;
		font-weight: 100;
		border-radius: 2rem;
		height: 100%;
		border: 0.125rem solid var(--border, #e5e7eb);
		padding: 0.4rem 0.9rem;
		background: rgba(0, 0, 0, 0.6);
		transition: background-color 0.3s, border-color 0.3s, color 0.3s;
	}

	.badge-shell {
		height: 3.5rem;
		width: 3.5rem;
		flex-shrink: 0;
		display: grid;
		place-items: center;
		border-radius: 9999px;
		overflow: hidden;
		background: rgba(255, 255, 255, 0.08);
		border: 0.0625rem solid rgba(255, 255, 255, 0.1);
	}

	.badge-shell.dimmed {
		filter: grayscale(1);
		opacity: 0.65;
	}

	.badge {
		height: 100%;
		width: 100%;
		object-fit: cover;
	}

	.badge-fallback {
		display: grid;
		place-items: center;
		height: 100%;
		width: 100%;
		font-size: 1.1rem;
		font-weight: 700;
		letter-spacing: 0.08em;
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
