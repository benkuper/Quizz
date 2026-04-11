<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import type { GameStatus, KaraokePlaybackSync, QuizQuestionKaraoke } from '$lib/quiz/types';
	import { getMedia } from '$lib/url.svelte';
	import {
		getPhraseRevealPercent,
		getWordRevealPercent,
		getKaraokeState,
		loadKaraokeLyrics,
		type KaraokeLyricsDocument
	} from '$lib/quiz/karaoke';

	type Props = {
		status: GameStatus;
		question: QuizQuestionKaraoke;
		mode: 'projector' | 'phone';
		audioMode: 'audible' | 'muted' | 'none';
		sync?: KaraokePlaybackSync;
		onFinished?: () => void;
	};

	let { status, question, mode, audioMode, sync, onFinished }: Props = $props();

	let audioEl: HTMLAudioElement | null = $state(null);
	let lyrics: KaraokeLyricsDocument | null = $state(null);
	let loading = $state(false);
	let error = $state('');
	let playbackTime = $state(0);
	let syncedPlaybackTime = $state(0);
	let serverClockOffsetMs = $state(0);
	let activeLyricsPath = $state('');
	let activeQuestionId = $state('');

	const karaoke = $derived(question.karaoke);
	const title = $derived.by(() => karaoke.title?.trim() || lyrics?.title?.trim() || 'Karaoke');
	const artist = $derived(karaoke.artist?.trim() || '');
	const offsetSec = $derived(
		Number.isFinite(Number(karaoke.offsetSec)) ? Number(karaoke.offsetSec) : 0
	);
	const hasSharedClock = $derived.by(() => {
		const questionStartedAt = Number(sync?.questionStartedAt ?? NaN);
		const serverNow = Number(sync?.serverNow ?? NaN);
		return (
			status === 'question' &&
			Number.isFinite(questionStartedAt) &&
			questionStartedAt > 0 &&
			Number.isFinite(serverNow)
		);
	});
	const playbackPositionSec = $derived(hasSharedClock ? syncedPlaybackTime : playbackTime);
	const lyricTime = $derived(Math.max(0, playbackPositionSec + offsetSec));
	const karaokeState = $derived(getKaraokeState(lyrics, lyricTime));
	const activeLines = $derived(karaokeState.activePhrase?.lines ?? []);
	const previewLines = $derived.by(() => (lyrics ? (lyrics.phrases[0]?.lines ?? []) : []));
	const focusPhrase = $derived(karaokeState.activePhrase ?? karaokeState.nextPhrase ?? null);
	const focusLines = $derived(focusPhrase?.lines ?? []);
	const focusLineWords = $derived(focusPhrase?.lineWords ?? []);
	const hasLeadIn = $derived(
		status === 'question' && karaokeState.waitUntilNextSec !== null && !activeLines.length
	);
	const focusKey = $derived(
		focusPhrase
			? `focus-${focusPhrase.startSec}`
			: status === 'reading'
				? 'focus-reading'
				: 'focus-idle'
	);
	const progressRatio = $derived(Math.max(0, Math.min(1, karaokeState.progress)));
	const durationSec = $derived.by(() => (lyrics ? lyrics.durationSec : 0));
	const timeLeftSec = $derived(Math.max(0, durationSec - lyricTime));
	const waitProgressPercent = $derived.by(() => {
		if (!hasLeadIn || !karaokeState.nextPhrase) return 0;
		const waitStartSec = karaokeState.previousPhrase?.endSec ?? 0;
		const waitDurationSec = Math.max(0.001, karaokeState.nextPhrase.startSec - waitStartSec);
		return Math.max(0, Math.min(100, ((lyricTime - waitStartSec) / waitDurationSec) * 100));
	});

	function formatSeconds(value: number) {
		const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
		if (safe < 10) return `${safe.toFixed(1)}s`;
		return `${Math.round(safe)}s`;
	}

	function lineRevealPercent(lines: string[], index: number, phraseProgress: number) {
		const lineWords = focusLineWords[index] ?? [];
		if (lineWords.length) {
			return getWordRevealPercent(lineWords, lyricTime, phraseProgress);
		}

		if (lines.length === 1) {
			return getPhraseRevealPercent(focusPhrase, lyricTime, phraseProgress);
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

	function getExpectedPlaybackTimeSec() {
		const questionStartedAt = Number(sync?.questionStartedAt ?? NaN);
		if (!Number.isFinite(questionStartedAt) || questionStartedAt <= 0) return 0;
		return Math.max(0, (Date.now() + serverClockOffsetMs - questionStartedAt) / 1000);
	}

	function syncNodeToExpectedTime(node: HTMLAudioElement, toleranceSec: number) {
		const expectedTimeSec = getExpectedPlaybackTimeSec();
		if (Math.abs(node.currentTime - expectedTimeSec) <= toleranceSec) return;

		try {
			node.currentTime = expectedTimeSec;
		} catch {
			// ignore
		}
	}

	function tryStartPlayback(node: HTMLAudioElement) {
		if (status !== 'question' || audioMode === 'none') return;

		if (hasSharedClock) {
			syncNodeToExpectedTime(node, audioMode === 'audible' ? 0.35 : 0.12);
		}

		node.play().catch(() => {});
	}

	$effect(() => {
		const lyricsPath = karaoke.lyrics?.trim();
		if (!lyricsPath) {
			activeLyricsPath = '';
			lyrics = null;
			loading = false;
			error = 'No karaoke lyric file configured.';
			return;
		}

		if (lyricsPath === activeLyricsPath) return;

		activeLyricsPath = lyricsPath;
		loading = true;
		error = '';

		loadKaraokeLyrics(lyricsPath)
			.then((data) => {
				if (activeLyricsPath !== lyricsPath) return;
				lyrics = data;
			})
			.catch((err) => {
				if (activeLyricsPath !== lyricsPath) return;
				activeLyricsPath = '';
				lyrics = null;
				error = err instanceof Error ? err.message : 'Failed to load karaoke lyrics.';
			})
			.finally(() => {
				if (activeLyricsPath === lyricsPath || !activeLyricsPath) loading = false;
			});
	});

	$effect(() => {
		const serverNow = Number(sync?.serverNow ?? NaN);
		if (!Number.isFinite(serverNow)) return;
		serverClockOffsetMs = serverNow - Date.now();
	});

	$effect(() => {
		const qid = String(question.id ?? '');
		if (!qid || qid === activeQuestionId) return;
		activeQuestionId = qid;
		playbackTime = 0;
		syncedPlaybackTime = 0;
		try {
			audioEl?.pause();
			if (audioEl) audioEl.currentTime = 0;
		} catch {
			// ignore
		}
	});

	$effect(() => {
		if (!audioEl) return;

		const shouldPlay = status === 'question';
		const shouldReset = status === 'reading';
		audioEl.muted = audioMode !== 'audible';

		if (shouldReset) {
			try {
				audioEl.pause();
				audioEl.currentTime = 0;
			} catch {
				// ignore
			}
			playbackTime = 0;
			return;
		}

		if (!shouldPlay || audioMode === 'none') {
			try {
				audioEl.pause();
			} catch {
				// ignore
			}
			return;
		}

		if (hasSharedClock) {
			syncNodeToExpectedTime(audioEl, audioMode === 'audible' ? 0.35 : 0.12);
		}

		tryStartPlayback(audioEl);
	});

	$effect(() => {
		if (!hasSharedClock) {
			syncedPlaybackTime = 0;
			return;
		}

		let rafId = 0;
		const tick = () => {
			syncedPlaybackTime = getExpectedPlaybackTimeSec();
			rafId = requestAnimationFrame(tick);
		};

		rafId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafId);
	});

	$effect(() => {
		if (!audioEl) return;
		let rafId = 0;

		const tick = () => {
			playbackTime = Number.isFinite(audioEl?.currentTime) ? Number(audioEl?.currentTime) : 0;
			rafId = requestAnimationFrame(tick);
		};

		rafId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafId);
	});

	$effect(() => {
		if (!audioEl) return;
		if (!hasSharedClock) return;
		if (status !== 'question' || audioMode === 'none') return;

		const node = audioEl;
		const toleranceSec = audioMode === 'audible' ? 0.2 : 0.08;
		const syncAudio = () => {
			syncNodeToExpectedTime(node, toleranceSec);

			if (node.paused) {
				tryStartPlayback(node);
			}
		};

		syncAudio();
		const intervalId = window.setInterval(syncAudio, 1000);
		return () => window.clearInterval(intervalId);
	});

	function notifyFinished() {
		try {
			onFinished?.();
		} catch {
			// ignore
		}
	}
</script>

<div class={`karaoke-display karaoke-display--${mode}`}>
	{#if audioMode !== 'none'}
		<audio
			bind:this={audioEl}
			src={getMedia(karaoke.audio)}
			autoplay
			preload="auto"
			playsinline
			muted={audioMode !== 'audible'}
			oncanplay={() => audioEl && tryStartPlayback(audioEl)}
			onended={notifyFinished}
		></audio>
	{/if}

	<div class="karaoke-shell">
		<div class="karaoke-topline">
			<div class="karaoke-badge">Karaoke</div>
			<div class="karaoke-meta">
				<h3>{title}</h3>
				{#if artist}
					<p>{artist}</p>
				{/if}
			</div>
			<div class="karaoke-clock">
				{#if status === 'question'}
					{#if hasLeadIn}
						<span>Suis l'intro</span>
					{:else if karaokeState.afterLastPhrase}
						<span>Dernier refrain...</span>
					{:else}
						<span>Encore {formatSeconds(timeLeftSec)}</span>
					{/if}
				{:else}
					<span>En attente du lancement</span>
				{/if}
			</div>
		</div>

		{#if loading}
			<div class="karaoke-placeholder">Chargement des paroles...</div>
		{:else if error}
			<div class="karaoke-placeholder karaoke-placeholder--error">{error}</div>
		{:else if status === 'reading'}
			<div class="karaoke-reading">
				<div class="karaoke-reading-copy">
					<p class="karaoke-reading-label">Echauffement</p>
					<p>La musique demarre quand l'animateur lance la manche.</p>
				</div>
				{#if previewLines.length}
					<div class="karaoke-preview">
						{#each previewLines as line}
							<p>{line}</p>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<div class="karaoke-stage">
				<div class="karaoke-focus-slot">
					{#key focusKey}
						<div
							class={`karaoke-phrase karaoke-focus ${activeLines.length ? 'karaoke-phrase--active' : 'karaoke-phrase--waiting'}`}
							in:fly={{ y: 26, duration: 460, opacity: 0.08 }}
							out:fly={{ y: -18, duration: 320, opacity: 0.08 }}
						>
							{#if focusLines.length}
								{#each focusLines as line, index}
									<div class={`karaoke-line ${hasLeadIn ? 'karaoke-line--upcoming' : ''}`}>
										<span class="karaoke-line-copy">
											<span class="karaoke-line-base">{line}</span>
											{#if activeLines.length}
												<span
													class="karaoke-line-fill"
													style={`clip-path: inset(0 ${100 - lineRevealPercent(focusLines, index, progressRatio)}% 0 0);`}
													aria-hidden="true"
												>
													{line}
												</span>
											{/if}
										</span>
									</div>
								{/each}
								<div class={`karaoke-leadin-shell ${hasLeadIn ? 'is-visible' : ''}`}>
									<div
										class="karaoke-leadin"
										in:fade={{ duration: 220 }}
										out:fade={{ duration: 180 }}
									>
										<div class="karaoke-leadin-track">
											<div
												class="karaoke-leadin-fill"
												style={`width:${hasLeadIn ? waitProgressPercent : 0}%`}
											></div>
										</div>
									</div>
								</div>
							{:else}
								<div class="karaoke-wait">
									<p class="karaoke-wait-label">Chantez</p>
									<p class="karaoke-wait-time">...</p>
								</div>
							{/if}
						</div>
					{/key}
				</div>
			</div>
		{/if}

		<div class="karaoke-progress" aria-hidden="true">
			<div class="karaoke-progress-track">
				<div
					class="karaoke-progress-fill"
					style={`width:${durationSec > 0 ? Math.min(100, (lyricTime / durationSec) * 100) : 0}%`}
				></div>
			</div>
		</div>
	</div>
</div>

<style>
	.karaoke-display {
		--karaoke-copy-width: 100%;
		--karaoke-focus-min-height: 10rem;
		width: 100%;
		color: #fff8dc;
	}

	.karaoke-display--projector {
		--karaoke-copy-width: 54rem;
		--karaoke-focus-min-height: 14rem;
	}

	.karaoke-display--phone {
		--karaoke-copy-width: 17rem;
		--karaoke-focus-min-height: 9.5rem;
	}

	.karaoke-shell {
		position: relative;
		display: flex;
		min-height: 100%;
		flex-direction: column;
		gap: 1.5rem;
		overflow: hidden;
		border: 1px solid rgba(251, 191, 36, 0.2);
		background:
			radial-gradient(circle at top, rgba(252, 211, 77, 0.15), transparent 45%),
			linear-gradient(180deg, rgba(17, 24, 39, 0.98), rgba(10, 10, 10, 0.96));
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.04),
			0 1.5rem 4rem rgba(0, 0, 0, 0.4);
	}

	.karaoke-display--projector .karaoke-shell {
		width: min(82rem, 100%);
		min-height: 28rem;
		padding: 2.25rem 2.5rem 1.75rem;
		border-radius: 1.75rem;
	}

	.karaoke-display--phone .karaoke-shell {
		min-height: 22rem;
		padding: 1.25rem 1rem 1rem;
		border-radius: 1.5rem;
	}

	.karaoke-topline {
		display: grid;
		gap: 0.75rem;
		align-items: center;
	}

	.karaoke-display--projector .karaoke-topline {
		grid-template-columns: auto 1fr auto;
	}

	.karaoke-display--phone .karaoke-topline {
		grid-template-columns: 1fr;
	}

	.karaoke-badge {
		display: inline-flex;
		width: fit-content;
		align-items: center;
		border-radius: 999px;
		border: 1px solid rgba(253, 224, 71, 0.35);
		background: rgba(217, 119, 6, 0.16);
		padding: 0.4rem 0.8rem;
		font-size: 0.85rem;
		font-weight: 800;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.karaoke-meta h3,
	.karaoke-meta p {
		margin: 0;
	}

	.karaoke-display--projector .karaoke-meta h3 {
		font-size: 2.1rem;
	}

	.karaoke-display--phone .karaoke-meta h3 {
		font-size: 1.3rem;
	}

	.karaoke-meta p,
	.karaoke-clock,
	.karaoke-reading-copy,
	.karaoke-wait-label {
		color: rgba(255, 248, 220, 0.76);
	}

	.karaoke-clock {
		font-weight: 700;
		text-align: right;
	}

	.karaoke-reading,
	.karaoke-stage {
		display: flex;
		flex: 1;
		flex-direction: column;
		justify-content: center;
		gap: 1rem;
	}

	.karaoke-focus-slot {
		position: relative;
		display: flex;
		width: 100%;
		align-items: center;
		justify-content: center;
		min-height: var(--karaoke-focus-min-height);
	}

	.karaoke-reading-copy,
	.karaoke-preview,
	.karaoke-placeholder,
	.karaoke-wait {
		border-radius: 1.25rem;
		background: rgba(15, 23, 42, 0.55);
		padding: 1rem 1.25rem;
	}

	.karaoke-reading-label {
		margin: 0 0 0.4rem;
		font-size: 0.8rem;
		font-weight: 900;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.karaoke-preview p,
	.karaoke-placeholder,
	.karaoke-wait {
		margin: 0;
		text-align: center;
	}

	.karaoke-phrase {
		width: 100%;
		text-align: center;
	}

	.karaoke-focus {
		position: absolute;
		inset: 0;
		display: flex;
		width: 100%;
		flex-direction: column;
		justify-content: center;
	}

	.karaoke-phrase p {
		margin: 0.25rem 0;
		width: min(100%, var(--karaoke-copy-width));
		margin-inline: auto;
		white-space: nowrap;
		word-break: normal;
		overflow-wrap: normal;
	}

	.karaoke-phrase--active {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		padding: 0.5rem 0;
		transition:
			opacity 260ms ease,
			transform 320ms ease,
			filter 320ms ease;
	}

	.karaoke-phrase--waiting {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		padding: 0.5rem 0;
	}

	.karaoke-display--projector .karaoke-phrase--active {
		font-size: 3rem;
		line-height: 1.15;
		font-weight: 900;
	}

	.karaoke-display--phone .karaoke-phrase--active {
		font-size: 1.5rem;
		line-height: 1.2;
		font-weight: 900;
	}

	.karaoke-display--projector .karaoke-phrase--waiting {
		font-size: 3rem;
		line-height: 1.15;
		font-weight: 900;
	}

	.karaoke-display--phone .karaoke-phrase--waiting {
		font-size: 1.5rem;
		line-height: 1.2;
		font-weight: 900;
	}

	.karaoke-line {
		position: relative;
		display: flex;
		width: min(100%, var(--karaoke-copy-width));
		min-width: 0;
		justify-content: center;
		margin-inline: auto;
		transform: translateY(0);
		transition:
			transform 320ms ease,
			opacity 260ms ease,
			filter 260ms ease;
	}

	.karaoke-line-base,
	.karaoke-line-fill {
		display: block;
		box-sizing: border-box;
		width: auto;
		padding: 0.05em 0;
		white-space: nowrap;
		word-break: normal;
		overflow-wrap: normal;
	}

	.karaoke-line-copy {
		position: relative;
		display: inline-grid;
		width: max-content;
		max-width: 100%;
		min-width: 0;
	}

	.karaoke-line-base {
		color: rgba(255, 248, 220, 0.36);
		transition:
			color 220ms ease,
			text-shadow 220ms ease;
	}

	.karaoke-line-fill {
		position: absolute;
		inset: 0;
		color: #fff7bf;
		text-shadow:
			0 0 0.25rem rgba(251, 191, 36, 0.9),
			0 0 1.25rem rgba(251, 191, 36, 0.3);
		background: linear-gradient(90deg, #fde68a, #fff7bf, #f59e0b);
		-webkit-background-clip: text;
		background-clip: text;
		transition: clip-path 120ms linear;
		will-change: clip-path;
	}

	.karaoke-line--upcoming {
		transform: translateY(0.12rem) scale(0.985);
	}

	.karaoke-line--upcoming .karaoke-line-base {
		color: rgba(255, 248, 220, 0.68);
		text-shadow: 0 0 0.75rem rgba(245, 158, 11, 0.14);
	}

	.karaoke-leadin-shell {
		display: flex;
		width: min(100%, var(--karaoke-copy-width));
		min-height: 1.1rem;
		align-items: center;
		justify-content: center;
		margin: 0.45rem auto 0;
		opacity: 0;
		transition: opacity 220ms ease;
	}

	.karaoke-leadin-shell.is-visible {
		opacity: 1;
	}

	.karaoke-leadin {
		width: 100%;
	}

	.karaoke-leadin-track {
		height: 0.55rem;
		overflow: hidden;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.1);
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
	}

	.karaoke-leadin-fill {
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, rgba(245, 158, 11, 0.45), rgba(253, 230, 138, 0.95));
		box-shadow: 0 0 1rem rgba(245, 158, 11, 0.24);
		transition: width 120ms linear;
	}

	.karaoke-wait-label,
	.karaoke-wait-time {
		margin: 0;
	}

	.karaoke-wait-time {
		font-weight: 900;
	}

	.karaoke-display--projector .karaoke-wait-time {
		font-size: 3rem;
	}

	.karaoke-display--phone .karaoke-wait-time {
		font-size: 2rem;
	}

	.karaoke-progress-track {
		height: 0.45rem;
		overflow: hidden;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.08);
	}

	.karaoke-progress-fill {
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, #f59e0b, #fde68a);
		box-shadow: 0 0 1rem rgba(245, 158, 11, 0.35);
	}

	.karaoke-placeholder--error {
		color: #fecaca;
	}

	.karaoke-display--phone .karaoke-line-copy {
		width: 100%;
		justify-items: center;
	}

	.karaoke-display--phone .karaoke-phrase p,
	.karaoke-display--phone .karaoke-line-base,
	.karaoke-display--phone .karaoke-line-fill {
		width: 100%;
		white-space: normal;
		overflow-wrap: anywhere;
		text-wrap: balance;
	}

	@media (prefers-reduced-motion: reduce) {
		.karaoke-phrase--active,
		.karaoke-phrase--waiting,
		.karaoke-line,
		.karaoke-line-base,
		.karaoke-line-fill {
			transition: none;
		}
	}
</style>
