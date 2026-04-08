<script lang="ts">
	import {
		getKaraokeState,
		getPhraseRevealPercent,
		getWordRevealPercent,
		type KaraokeLyricsDocument,
		type KaraokePhrase
	} from '$lib/quiz/karaoke';

	type Props = {
		lyrics: KaraokeLyricsDocument | null;
		currentTimeSec: number;
	};

	let { lyrics, currentTimeSec }: Props = $props();

	const karaokeState = $derived(getKaraokeState(lyrics, currentTimeSec));
	const focusPhrase = $derived(karaokeState.activePhrase ?? karaokeState.nextPhrase ?? null);
	const focusLines = $derived(focusPhrase?.lines ?? []);
	const focusLineWords = $derived(focusPhrase?.lineWords ?? []);
	const activeLines = $derived(karaokeState.activePhrase?.lines ?? []);
	const previousLines = $derived(karaokeState.previousPhrase?.lines ?? []);
	const nextLines = $derived.by(() =>
		karaokeState.activePhrase ? (karaokeState.nextPhrase?.lines ?? []) : []
	);
	const progressRatio = $derived(Math.max(0, Math.min(1, karaokeState.progress)));
	const waitingForNext = $derived(Boolean(!activeLines.length && karaokeState.nextPhrase));
	const totalProgress = $derived.by(() => {
		if (!lyrics?.durationSec) return 0;
		return Math.max(0, Math.min(100, (currentTimeSec / lyrics.durationSec) * 100));
	});
	const phaseProgress = $derived.by(() => {
		if (!activeLines.length) return 0;
		return Math.max(0, Math.min(100, progressRatio * 100));
	});
	const phaseLabel = $derived.by(() => {
		if (!lyrics?.phrases.length) return 'No lyrics';
		if (karaokeState.afterLastPhrase) return 'After the last block';
		if (activeLines.length) return 'Live block';
		if (waitingForNext) return 'Waiting for the next block';
		return 'Idle';
	});

	function formatClock(value: number) {
		const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
		const minutes = Math.floor(safe / 60);
		const seconds = safe - minutes * 60;
		return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(2).padStart(5, '0')}`;
	}

	function joinLines(lines: string[]) {
		return lines.join(' / ');
	}

	function lineRevealPercent(
		phrase: KaraokePhrase | null,
		lines: string[],
		index: number,
		phraseProgress: number
	) {
		const lineWords = focusLineWords[index] ?? [];
		if (lineWords.length) {
			return getWordRevealPercent(lineWords, currentTimeSec, phraseProgress);
		}

		if (lines.length === 1) {
			return getPhraseRevealPercent(phrase, currentTimeSec, phraseProgress);
		}

		if (!lines.length) return 0;

		const weights = lines.map((line) => Math.max(1, line.replace(/\s+/g, '').length));
		const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
		if (totalWeight <= 0) return 0;

		let startWeight = 0;
		for (let i = 0; i < index; i++) startWeight += weights[i];
		const endWeight = startWeight + weights[index];
		const start = startWeight / totalWeight;
		const end = endWeight / totalWeight;
		const localProgress = (phraseProgress - start) / Math.max(0.0001, end - start);
		return Math.max(0, Math.min(100, localProgress * 100));
	}
</script>

<div class="preview-shell">
	<div class="preview-head">
		<div>
			<p class="preview-kicker">Live preview</p>
			<h2>{lyrics?.title?.trim() || 'Untitled karaoke'}</h2>
		</div>
		<div class="preview-clock">{formatClock(currentTimeSec)}</div>
	</div>

	{#if !lyrics?.phrases.length}
		<div class="preview-empty">
			<p>No lyric blocks yet.</p>
			<span>Add a block or import a JSON file to preview timing.</span>
		</div>
	{:else}
		<div class="preview-stage">
			{#if previousLines.length}
				<p class="preview-previous">{joinLines(previousLines)}</p>
			{/if}

			<div class={`preview-focus ${waitingForNext ? 'is-waiting' : ''}`}>
				{#if focusLines.length}
					{#each focusLines as line, index}
						<div class="preview-line">
							<span class="preview-line-copy">
								<span class="preview-line-base">{line}</span>
								{#if activeLines.length}
									<span
										class="preview-line-fill"
										style={`clip-path: inset(0 ${100 - lineRevealPercent(focusPhrase, focusLines, index, progressRatio)}% 0 0);`}
										aria-hidden="true"
									>
										{line}
									</span>
								{/if}
							</span>
						</div>
					{/each}
				{:else}
					<p class="preview-idle-copy">Nothing scheduled at this cursor position.</p>
				{/if}
			</div>

			{#if nextLines.length}
				<p class="preview-next">{joinLines(nextLines)}</p>
			{/if}
		</div>

		<div class="preview-meters">
			<div class="preview-meter">
				<div class="preview-meter-label">
					<span>{phaseLabel}</span>
					<span>{activeLines.length ? `${phaseProgress.toFixed(0)}%` : '0%'}</span>
				</div>
				<div class="preview-track">
					<div class="preview-fill preview-fill--phrase" style={`width:${phaseProgress}%`}></div>
				</div>
			</div>

			<div class="preview-meter">
				<div class="preview-meter-label">
					<span>Song progress</span>
					<span>{totalProgress.toFixed(0)}%</span>
				</div>
				<div class="preview-track">
					<div class="preview-fill preview-fill--timeline" style={`width:${totalProgress}%`}></div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.preview-shell {
		display: flex;
		min-height: 100%;
		flex-direction: column;
		gap: 1.5rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background:
			radial-gradient(circle at top, rgba(252, 211, 77, 0.22), transparent 42%),
			linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(3, 7, 18, 0.98));
		padding: 1.4rem;
		color: #fef3c7;
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.03),
			0 1.5rem 4rem rgba(2, 6, 23, 0.45);
	}

	.preview-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.preview-kicker {
		margin: 0 0 0.25rem;
		font-size: 0.78rem;
		font-weight: 900;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: rgba(253, 230, 138, 0.72);
	}

	.preview-head h2 {
		margin: 0;
		font-size: clamp(1.4rem, 2vw, 2.15rem);
		line-height: 1.05;
	}

	.preview-clock {
		flex-shrink: 0;
		border-radius: 999px;
		border: 1px solid rgba(253, 224, 71, 0.22);
		background: rgba(245, 158, 11, 0.12);
		padding: 0.6rem 0.9rem;
		font-size: 1rem;
		font-weight: 800;
		letter-spacing: 0.06em;
	}

	.preview-stage {
		display: flex;
		flex: 1;
		flex-direction: column;
		justify-content: center;
		gap: 1rem;
	}

	.preview-previous,
	.preview-next {
		margin: 0;
		text-align: center;
		font-size: 1rem;
		font-weight: 700;
		color: rgba(255, 248, 220, 0.5);
	}

	.preview-focus {
		display: flex;
		min-height: 14rem;
		flex-direction: column;
		justify-content: center;
		gap: 0.75rem;
		border-radius: 1.35rem;
		border: 1px solid rgba(255, 255, 255, 0.05);
		background: rgba(8, 15, 31, 0.56);
		padding: 1.35rem;
	}

	.preview-focus.is-waiting {
		background:
			linear-gradient(180deg, rgba(245, 158, 11, 0.1), rgba(8, 15, 31, 0.56)), rgba(8, 15, 31, 0.56);
	}

	.preview-line {
		position: relative;
		display: flex;
		width: 100%;
		justify-content: center;
		margin-inline: auto;
		text-align: center;
	}

	.preview-line-copy {
		position: relative;
		display: inline-grid;
		width: max-content;
		max-width: 100%;
	}

	.preview-line-base,
	.preview-line-fill {
		display: block;
		box-sizing: border-box;
		width: auto;
		max-width: 100%;
		padding: 0.05em 0;
		font-size: clamp(1.9rem, 3vw, 3.6rem);
		line-height: 1.1;
		font-weight: 900;
		white-space: nowrap;
		word-break: normal;
		overflow-wrap: normal;
	}

	.preview-line-base {
		color: rgba(255, 248, 220, 0.34);
	}

	.preview-line-fill {
		position: absolute;
		inset: 0;
		color: #fff7bf;
		text-shadow:
			0 0 0.22rem rgba(251, 191, 36, 0.9),
			0 0 1rem rgba(251, 191, 36, 0.24);
		background: linear-gradient(90deg, #fde68a, #fff7bf, #f59e0b);
		-webkit-background-clip: text;
		background-clip: text;
		transition: clip-path 120ms linear;
		will-change: clip-path;
	}

	.preview-idle-copy {
		margin: 0;
		text-align: center;
		font-size: 1.05rem;
		font-weight: 700;
		color: rgba(255, 248, 220, 0.62);
	}

	.preview-empty {
		display: flex;
		min-height: 15rem;
		flex: 1;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		border-radius: 1.35rem;
		border: 1px dashed rgba(255, 255, 255, 0.12);
		background: rgba(15, 23, 42, 0.58);
		text-align: center;
		color: rgba(255, 248, 220, 0.76);
	}

	.preview-empty p,
	.preview-empty span {
		margin: 0;
	}

	.preview-empty p {
		font-size: 1.05rem;
		font-weight: 800;
	}

	.preview-meters {
		display: grid;
		gap: 0.85rem;
	}

	.preview-meter-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.35rem;
		font-size: 0.82rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: rgba(255, 248, 220, 0.75);
	}

	.preview-track {
		height: 0.5rem;
		overflow: hidden;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.08);
	}

	.preview-fill {
		height: 100%;
		border-radius: inherit;
		transition: width 120ms linear;
	}

	.preview-fill--phrase {
		background: linear-gradient(90deg, #f59e0b, #fde68a);
		box-shadow: 0 0 1rem rgba(245, 158, 11, 0.3);
	}

	.preview-fill--timeline {
		background: linear-gradient(90deg, #38bdf8, #67e8f9);
		box-shadow: 0 0 1rem rgba(56, 189, 248, 0.28);
	}

	@media (max-width: 640px) {
		.preview-shell {
			padding: 1rem;
		}

		.preview-head {
			flex-direction: column;
			align-items: flex-start;
		}

		.preview-clock {
			align-self: stretch;
			text-align: center;
		}

		.preview-focus {
			min-height: 10.5rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.preview-line-fill,
		.preview-fill {
			transition: none;
		}
	}
</style>
