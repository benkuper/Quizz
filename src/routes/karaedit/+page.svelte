<script lang="ts">
	import { browser } from '$app/environment';
	import KaraokeTimingPreview from '$lib/components/karaoke/KaraokeTimingPreview.svelte';
	import KaraokeTimelineEditor from '$lib/components/karaoke/KaraokeTimelineEditor.svelte';
	import {
		normalizeKaraokeLyrics,
		type KaraokeLyricsDocument,
		type KaraokeWord
	} from '$lib/quiz/karaoke';
	import { resolveAppAssetUrl } from '$lib/utils/paths.svelte';

	type EditorPhrase = {
		id: string;
		startSec: number;
		endSec: number;
		text: string;
	};

	type Props = {
		data: {
			karaokeAudioFiles: string[];
			karaokeLyricsFiles: string[];
		};
	};

	type StoredSnapshot = {
		title?: string;
		tempoBpm?: string;
		ticksPerQuarter?: string;
		timingBasis?: string;
		note?: string;
		audioPath?: string;
		lyricsPath?: string;
		currentTimeSec?: number;
		selectedId?: string | null;
		timelineZoomPxPerSec?: number;
		phrases?: Array<Partial<EditorPhrase>>;
	};

	type WaveformEnvelopeSample = {
		min: number;
		max: number;
	};

	type BlockTimingUpdateMode = 'move' | 'resize-start' | 'resize-end' | 'free';

	let { data }: Props = $props();

	const STORAGE_KEY = 'karaedit:workspace:v1';
	const MIN_BLOCK_LENGTH_SEC = 0.2;
	const DEFAULT_BLOCK_LENGTH_SEC = 3.5;
	const DEFAULT_INSERT_GAP_SEC = 0.2;
	const TIME_STEP_SEC = 0.1;

	const panelClass =
		'rounded-[0.95rem] border border-white/10 bg-slate-950/72 shadow-[0_1rem_2.5rem_rgba(2,6,23,0.34)] backdrop-blur';
	const softButtonClass =
		'inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50';
	const accentButtonClass =
		'inline-flex items-center justify-center rounded-lg border border-amber-300/20 bg-amber-400/15 px-3.5 py-2 text-sm font-semibold text-amber-50 transition hover:bg-amber-400/25 disabled:cursor-not-allowed disabled:opacity-50';
	const dangerButtonClass =
		'inline-flex items-center justify-center rounded-lg border border-rose-300/20 bg-rose-400/15 px-3.5 py-2 text-sm font-semibold text-rose-50 transition hover:bg-rose-400/25 disabled:cursor-not-allowed disabled:opacity-50';
	const fieldClass =
		'w-full rounded-lg border border-white/10 bg-slate-950/78 px-3.5 py-2.5 text-sm text-slate-50 outline-none transition placeholder:text-slate-500 focus:border-amber-300/50 focus:bg-slate-950';

	let title = $state('');
	let tempoBpm = $state('');
	let ticksPerQuarter = $state('');
	let timingBasis = $state('');
	let note = $state('');
	let audioPath = $state('');
	let lyricsPath = $state('');
	let phrases: EditorPhrase[] = $state([]);
	let selectedId: string | null = $state(null);

	let audioEl: HTMLAudioElement | null = $state(null);
	let audioDurationSec = $state(0);
	let currentTimeSec = $state(0);
	let isPlaying = $state(false);
	let uploadedAudioUrl = $state('');
	let uploadedAudioName = $state('');

	let statusMessage = $state('Load a karaoke JSON file or add lyric blocks to start editing.');
	let errorMessage = $state('');
	let loadingRemoteLyrics = $state(false);
	let waveformEnvelope: WaveformEnvelopeSample[] = $state([]);
	let waveformLoading = $state(false);
	let waveformError = $state('');
	let timelineZoomPxPerSec = $state(64);
	let lastSavedAt = $state(0);
	let booted = false;

	const selectedIndex = $derived(phrases.findIndex((phrase) => phrase.id === selectedId));
	const selectedPhrase = $derived(selectedIndex >= 0 ? phrases[selectedIndex] : null);
	const editorDurationSec = $derived(
		phrases.reduce((max, phrase) => Math.max(max, phrase.endSec), 0)
	);
	const previewDurationSec = $derived(Math.max(audioDurationSec, editorDurationSec, 1));
	const livePhraseId = $derived.by(
		() =>
			phrases.find((phrase) => currentTimeSec >= phrase.startSec && currentTimeSec <= phrase.endSec)
				?.id ?? null
	);
	const availableLyricsFiles = $derived.by(() => {
		const current = lyricsPath.trim();
		return current && !data.karaokeLyricsFiles.includes(current)
			? [current, ...data.karaokeLyricsFiles]
			: data.karaokeLyricsFiles;
	});
	const availableAudioFiles = $derived.by(() => {
		const current = audioPath.trim();
		return current && !data.karaokeAudioFiles.includes(current)
			? [current, ...data.karaokeAudioFiles]
			: data.karaokeAudioFiles;
	});
	const audioSrc = $derived.by(() => uploadedAudioUrl || resolveMediaLikeUrl(audioPath));
	const lyricsDocument = $derived.by<KaraokeLyricsDocument>(() => ({
		version: 1,
		title: title.trim() || undefined,
		tempoBpm: toFiniteOptional(tempoBpm),
		ticksPerQuarter: toFiniteOptional(ticksPerQuarter),
		timingBasis: timingBasis.trim() || undefined,
		note: note.trim() || undefined,
		phrases: phrases.map((phrase) => ({
			startSec: phrase.startSec,
			endSec: phrase.endSec,
			text: phrase.text,
			lines: splitEditorText(phrase.text),
			words: [] as KaraokeWord[],
			lineWords: splitEditorText(phrase.text).map(() => [] as KaraokeWord[])
		})),
		durationSec: editorDurationSec
	}));
	const exportPayload = $derived.by(() => {
		const payload: Record<string, unknown> = {
			version: 1,
			phrases: phrases.map((phrase) => ({
				start_sec: phrase.startSec,
				end_sec: phrase.endSec,
				text: phrase.text
			}))
		};

		if (title.trim()) payload.title = title.trim();
		if (tempoBpm.trim() && Number.isFinite(Number(tempoBpm))) {
			payload.tempo_bpm = Number(tempoBpm);
		}
		if (ticksPerQuarter.trim() && Number.isFinite(Number(ticksPerQuarter))) {
			payload.ticks_per_quarter = Number(ticksPerQuarter);
		}
		if (timingBasis.trim()) payload.timing_basis = timingBasis.trim();
		if (note.trim()) payload.note = note.trim();

		return payload;
	});
	const exportJson = $derived.by(() => JSON.stringify(exportPayload, null, 2));
	const validationIssues = $derived.by(() => {
		const issues: string[] = [];

		phrases.forEach((phrase, index) => {
			const blockNumber = index + 1;
			if (!phrase.text.trim()) {
				issues.push(`Block ${blockNumber} has no lyric text.`);
			}
			if (phrase.endSec < phrase.startSec) {
				issues.push(`Block ${blockNumber} ends before it starts.`);
			}
			const previous = phrases[index - 1];
			if (!previous) return;
			if (phrase.startSec < previous.startSec) {
				issues.push(`Block ${blockNumber} starts before block ${index}.`);
			}
			if (phrase.startSec < previous.endSec) {
				issues.push(`Block ${blockNumber} overlaps block ${index}.`);
			}
		});

		return issues;
	});
	const downloadFileName = $derived.by(() => {
		const baseName = sanitizeFileBase(title.trim() || fileBaseName(lyricsPath) || 'karaoke-lyrics');
		return `${baseName}.json`;
	});
	const lastSavedLabel = $derived.by(() => {
		if (!lastSavedAt) return 'Autosave pending';
		return `Autosaved ${new Date(lastSavedAt).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit'
		})}`;
	});
	const hintLink = '?lyrics=karaoke/karaoke.json&audio=karaoke/karaoke.mp3';

	function createPhraseId() {
		if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
			return crypto.randomUUID();
		}
		return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	function roundTime(value: number) {
		return Math.round(Math.max(0, value) * 100) / 100;
	}

	function toFiniteOptional(value: string) {
		const numeric = Number(value);
		return Number.isFinite(numeric) ? numeric : undefined;
	}

	function splitEditorText(text: string) {
		return text
			.split(/\r?\n|\/+/)
			.map((line) => line.trim())
			.filter(Boolean);
	}

	function phraseSummary(text: string) {
		const lines = splitEditorText(text);
		if (!lines.length) return 'Empty block';
		return lines.join(' / ');
	}

	function isAbsoluteLikeUrl(value: string) {
		return (
			value.startsWith('http://') ||
			value.startsWith('https://') ||
			value.startsWith('data:') ||
			value.startsWith('blob:')
		);
	}

	function resolveMediaLikeUrl(path: string) {
		const trimmed = path.trim();
		if (!trimmed) return '';
		if (isAbsoluteLikeUrl(trimmed)) return trimmed;
		if (trimmed.startsWith('/')) return resolveAppAssetUrl(trimmed);
		return resolveAppAssetUrl(`/media/${trimmed}`);
	}

	function formatClock(value: number) {
		const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
		const minutes = Math.floor(safe / 60);
		const seconds = safe - minutes * 60;
		return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(2).padStart(5, '0')}`;
	}

	function fileBaseName(value: string) {
		const clean = value.trim().split(/[?#]/)[0];
		const lastSegment = clean.split('/').filter(Boolean).pop() ?? '';
		return lastSegment.replace(/\.[^.]+$/, '');
	}

	function sanitizeFileBase(value: string) {
		const trimmed = value.trim().toLowerCase();
		const normalized = trimmed
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.replace(/-+/g, '-');
		return normalized || 'karaoke-lyrics';
	}

	function createEditorPhrase(startSec: number, endSec: number, text = ''): EditorPhrase {
		const safeStart = roundTime(startSec);
		const safeEnd = roundTime(Math.max(safeStart + MIN_BLOCK_LENGTH_SEC, endSec));
		return {
			id: createPhraseId(),
			startSec: safeStart,
			endSec: safeEnd,
			text
		};
	}

	function buildWaveformEnvelope(buffer: AudioBuffer, sampleCount = 1600) {
		const limitedChannels = Math.min(buffer.numberOfChannels, 2);
		const samples = Math.max(128, sampleCount);
		const windowSize = Math.max(1, Math.floor(buffer.length / samples));
		const envelope = Array.from({ length: samples }, (_, index) => {
			const start = index * windowSize;
			const end =
				index === samples - 1 ? buffer.length : Math.min(buffer.length, start + windowSize);
			let min = 1;
			let max = -1;

			for (let channelIndex = 0; channelIndex < limitedChannels; channelIndex++) {
				const channel = buffer.getChannelData(channelIndex);
				for (let sampleIndex = start; sampleIndex < end; sampleIndex++) {
					const amplitude = channel[sampleIndex] ?? 0;
					if (amplitude < min) min = amplitude;
					if (amplitude > max) max = amplitude;
				}
			}

			if (min === 1 && max === -1) {
				return {
					min: 0,
					max: 0
				};
			}

			return {
				min,
				max
			};
		});

		const maxAmplitude = envelope.reduce(
			(peak, sample) => Math.max(peak, Math.abs(sample.min), Math.abs(sample.max)),
			0.001
		);
		return envelope.map((sample) => ({
			min: Math.max(-1, sample.min / maxAmplitude),
			max: Math.min(1, sample.max / maxAmplitude)
		}));
	}

	async function decodeAudioEnvelope(src: string) {
		if (!browser) return [];
		const AudioContextCtor =
			window.AudioContext ||
			(window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!AudioContextCtor) {
			throw new Error('This browser does not support audio decoding.');
		}

		const response = await fetch(src);
		if (!response.ok) {
			throw new Error(`Unable to load audio: ${response.status}`);
		}

		const arrayBuffer = await response.arrayBuffer();
		const audioContext = new AudioContextCtor();

		try {
			const buffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
			const sampleCount = Math.min(6000, Math.max(960, Math.ceil(buffer.duration * 180)));
			return buildWaveformEnvelope(buffer, sampleCount);
		} finally {
			await audioContext.close();
		}
	}

	function clearMessages() {
		errorMessage = '';
	}

	function phraseCardClass(phraseId: string) {
		const isSelected = selectedId === phraseId;
		const isLive = livePhraseId === phraseId;
		return [
			'w-full rounded-xl border px-3.5 py-3.5 text-left transition',
			isSelected ? 'border-amber-300/40 bg-amber-400/12' : '',
			!isSelected && isLive ? 'border-emerald-300/25 bg-emerald-400/10' : '',
			!isSelected && !isLive ? 'border-white/10 bg-white/5' : ''
		]
			.filter(Boolean)
			.join(' ');
	}

	function applyImportedPayload(payload: unknown, sourceLabel: string) {
		const raw = payload as { cues?: Array<{ words?: unknown[] }> };
		const hasWordTimings = Array.isArray(raw?.cues)
			? raw.cues.some((cue) => Array.isArray(cue?.words) && cue.words.length > 0)
			: false;
		const document = normalizeKaraokeLyrics(payload);
		const nextPhrases = document.phrases.map((phrase) =>
			createEditorPhrase(phrase.startSec, phrase.endSec, phrase.text)
		);

		title = document.title ?? '';
		tempoBpm = document.tempoBpm !== undefined ? String(document.tempoBpm) : '';
		ticksPerQuarter =
			document.ticksPerQuarter !== undefined ? String(document.ticksPerQuarter) : '';
		timingBasis = document.timingBasis ?? '';
		note = document.note ?? '';
		phrases = nextPhrases;
		selectedId = nextPhrases[0]?.id ?? null;
		currentTimeSec = 0;
		clearMessages();
		statusMessage = hasWordTimings
			? `Imported ${nextPhrases.length} blocks from ${sourceLabel}. Word timings were flattened into phrase blocks for editing.`
			: `Imported ${nextPhrases.length} blocks from ${sourceLabel}.`;
	}

	function hydrateSnapshot(snapshot: StoredSnapshot) {
		title = typeof snapshot.title === 'string' ? snapshot.title : '';
		tempoBpm = typeof snapshot.tempoBpm === 'string' ? snapshot.tempoBpm : '';
		ticksPerQuarter = typeof snapshot.ticksPerQuarter === 'string' ? snapshot.ticksPerQuarter : '';
		timingBasis = typeof snapshot.timingBasis === 'string' ? snapshot.timingBasis : '';
		note = typeof snapshot.note === 'string' ? snapshot.note : '';
		audioPath = typeof snapshot.audioPath === 'string' ? snapshot.audioPath : '';
		lyricsPath = typeof snapshot.lyricsPath === 'string' ? snapshot.lyricsPath : '';
		timelineZoomPxPerSec =
			typeof snapshot.timelineZoomPxPerSec === 'number' &&
			Number.isFinite(snapshot.timelineZoomPxPerSec)
				? snapshot.timelineZoomPxPerSec
				: 64;

		const restoredPhrases = Array.isArray(snapshot.phrases)
			? snapshot.phrases.map((phrase) =>
					createEditorPhrase(
						Number(phrase.startSec ?? 0),
						Number(phrase.endSec ?? Number(phrase.startSec ?? 0) + DEFAULT_BLOCK_LENGTH_SEC),
						typeof phrase.text === 'string' ? phrase.text : ''
					)
				)
			: [];

		phrases = restoredPhrases;
		currentTimeSec = roundTime(Number(snapshot.currentTimeSec ?? 0));
		selectedId = restoredPhrases[0]?.id ?? null;
	}

	function snapshotWorkspace(): StoredSnapshot {
		return {
			title,
			tempoBpm,
			ticksPerQuarter,
			timingBasis,
			note,
			audioPath,
			lyricsPath,
			currentTimeSec,
			selectedId,
			timelineZoomPxPerSec,
			phrases: phrases.map((phrase) => ({
				id: phrase.id,
				startSec: phrase.startSec,
				endSec: phrase.endSec,
				text: phrase.text
			}))
		};
	}

	function seekTo(value: number) {
		const nextTime = Math.max(0, Math.min(previewDurationSec, value));
		currentTimeSec = roundTime(nextTime);
		if (!audioEl) return;
		try {
			audioEl.currentTime = nextTime;
		} catch {
			// ignore seek failures
		}
	}

	async function togglePlayback() {
		if (!audioEl || !audioSrc) {
			errorMessage = 'Load an audio track first if you want playback while editing.';
			return;
		}

		clearMessages();
		try {
			if (audioEl.paused) {
				await audioEl.play();
			} else {
				audioEl.pause();
			}
		} catch (error) {
			errorMessage =
				error instanceof Error ? error.message : 'The audio track could not be played.';
		}
	}

	function updatePhrase(
		id: string,
		updater: (phrase: EditorPhrase, index: number, list: EditorPhrase[]) => EditorPhrase
	) {
		phrases = phrases.map((phrase, index, list) =>
			phrase.id === id ? updater(phrase, index, list) : phrase
		);
	}

	function getTimeOrderedPhrases() {
		return [...phrases].sort(
			(left, right) =>
				left.startSec - right.startSec ||
				left.endSec - right.endSec ||
				left.id.localeCompare(right.id)
		);
	}

	function getTimingNeighbors(id: string) {
		const ordered = getTimeOrderedPhrases();
		const index = ordered.findIndex((phrase) => phrase.id === id);
		return {
			current: index >= 0 ? ordered[index] : null,
			previous: index > 0 ? ordered[index - 1] : null,
			next: index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null
		};
	}

	function constrainBlockTiming(
		id: string,
		startSec: number,
		endSec: number,
		mode: BlockTimingUpdateMode = 'free'
	) {
		const basicStartSec = roundTime(Math.max(0, startSec));
		const basicEndSec = roundTime(Math.max(basicStartSec + MIN_BLOCK_LENGTH_SEC, endSec));
		const { current, previous, next } = getTimingNeighbors(id);
		if (!current) {
			return {
				startSec: basicStartSec,
				endSec: basicEndSec
			};
		}

		const minStartSec = roundTime(previous?.endSec ?? 0);
		const maxEndSec = next ? roundTime(next.startSec) : Number.POSITIVE_INFINITY;
		if (Number.isFinite(maxEndSec) && maxEndSec - minStartSec < MIN_BLOCK_LENGTH_SEC) {
			return {
				startSec: current.startSec,
				endSec: current.endSec
			};
		}

		if (mode === 'move') {
			const durationSec = Math.max(
				MIN_BLOCK_LENGTH_SEC,
				roundTime(current.endSec - current.startSec)
			);
			let nextStartSec = roundTime(Math.max(minStartSec, basicStartSec));
			if (Number.isFinite(maxEndSec)) {
				nextStartSec = roundTime(Math.min(nextStartSec, maxEndSec - durationSec));
			}
			nextStartSec = roundTime(Math.max(minStartSec, nextStartSec));
			const nextEndSec = roundTime(nextStartSec + durationSec);

			return {
				startSec: nextStartSec,
				endSec: nextEndSec
			};
		}

		if (mode === 'resize-start') {
			const nextEndSec = roundTime(Math.min(current.endSec, maxEndSec));
			const nextStartSec = roundTime(
				Math.max(minStartSec, Math.min(basicStartSec, nextEndSec - MIN_BLOCK_LENGTH_SEC))
			);

			return {
				startSec: nextStartSec,
				endSec: nextEndSec
			};
		}

		if (mode === 'resize-end') {
			const nextStartSec = roundTime(Math.max(minStartSec, current.startSec));
			const nextEndSec = roundTime(
				Math.min(maxEndSec, Math.max(basicEndSec, nextStartSec + MIN_BLOCK_LENGTH_SEC))
			);

			return {
				startSec: nextStartSec,
				endSec: nextEndSec
			};
		}

		let nextStartSec = roundTime(Math.max(minStartSec, basicStartSec));
		let nextEndSec = roundTime(Math.max(nextStartSec + MIN_BLOCK_LENGTH_SEC, basicEndSec));

		if (Number.isFinite(maxEndSec) && nextEndSec > maxEndSec) {
			nextEndSec = roundTime(maxEndSec);
			nextStartSec = roundTime(Math.max(minStartSec, nextEndSec - MIN_BLOCK_LENGTH_SEC));
		}

		if (nextEndSec - nextStartSec < MIN_BLOCK_LENGTH_SEC) {
			return {
				startSec: current.startSec,
				endSec: current.endSec
			};
		}

		return {
			startSec: nextStartSec,
			endSec: nextEndSec
		};
	}

	function updateBlockTiming(
		id: string,
		startSec: number,
		endSec: number,
		mode: BlockTimingUpdateMode = 'free'
	) {
		const nextTiming = constrainBlockTiming(id, startSec, endSec, mode);
		phrases = phrases.map((phrase) => {
			if (phrase.id !== id) return phrase;

			return {
				...phrase,
				startSec: nextTiming.startSec,
				endSec: nextTiming.endSec
			};
		});
		return nextTiming;
	}

	function createBlockWithinGap(
		startSec: number,
		maxEndSec: number | null,
		text = '',
		desiredDurationSec = DEFAULT_BLOCK_LENGTH_SEC
	) {
		const safeStartSec = roundTime(startSec);
		if (maxEndSec !== null && maxEndSec - safeStartSec < MIN_BLOCK_LENGTH_SEC) {
			return null;
		}

		const targetEndSec =
			maxEndSec !== null
				? Math.min(safeStartSec + desiredDurationSec, maxEndSec)
				: safeStartSec + desiredDurationSec;

		return createEditorPhrase(safeStartSec, targetEndSec, text);
	}

	function updateSelectedText(nextText: string) {
		if (!selectedId) return;
		updatePhrase(selectedId, (phrase) => ({ ...phrase, text: nextText }));
	}

	function setSelectedBoundary(field: 'startSec' | 'endSec', rawValue: number) {
		if (!selectedId || !selectedPhrase) return;
		if (!Number.isFinite(rawValue)) return;

		if (field === 'startSec') {
			updateBlockTiming(selectedId, rawValue, selectedPhrase.endSec, 'resize-start');
			return;
		}

		updateBlockTiming(selectedId, selectedPhrase.startSec, rawValue, 'resize-end');
	}

	function nudgeSelectedBoundary(field: 'startSec' | 'endSec', deltaSec: number) {
		if (!selectedPhrase) return;
		if (field === 'startSec') {
			setSelectedBoundary(field, selectedPhrase.startSec + deltaSec);
			return;
		}
		setSelectedBoundary(field, selectedPhrase.endSec + deltaSec);
	}

	function setBoundaryFromPlayhead(field: 'startSec' | 'endSec') {
		setSelectedBoundary(field, currentTimeSec);
	}

	function moveSelectedInTime(deltaSec: number) {
		if (!selectedId || !selectedPhrase) return;
		const nextTiming = updateBlockTiming(
			selectedId,
			selectedPhrase.startSec + deltaSec,
			selectedPhrase.endSec + deltaSec,
			'move'
		);
		seekTo(currentTimeSec + (nextTiming.startSec - selectedPhrase.startSec));
	}

	function addBlockAtTime(targetTimeSec: number, sourceLabel = 'current playhead') {
		const orderedPhrases = getTimeOrderedPhrases();
		const requestedTimeSec = roundTime(Math.max(0, targetTimeSec));
		const blockingPhrase =
			orderedPhrases.find(
				(phrase) => requestedTimeSec >= phrase.startSec && requestedTimeSec < phrase.endSec
			) ?? null;
		const startSec = roundTime(
			blockingPhrase ? blockingPhrase.endSec + DEFAULT_INSERT_GAP_SEC : requestedTimeSec
		);
		const nextPhrase = orderedPhrases.find((phrase) => phrase.startSec >= startSec) ?? null;
		const nextPhraseBlock = createBlockWithinGap(startSec, nextPhrase?.startSec ?? null);
		if (!nextPhraseBlock) {
			errorMessage = `There is not enough free space near the ${sourceLabel} for a new block.`;
			return;
		}

		phrases = [...phrases, nextPhraseBlock].sort((left, right) => left.startSec - right.startSec);
		selectedId = nextPhraseBlock.id;
		seekTo(startSec);
		statusMessage = `Added a new lyric block near the ${sourceLabel}.`;
		clearMessages();
	}

	function addBlockAtPlayhead() {
		addBlockAtTime(currentTimeSec);
	}

	function addBlockAfterSelection() {
		if (selectedIndex < 0) {
			addBlockAtPlayhead();
			return;
		}

		const anchor = phrases[selectedIndex];
		const { next: nextPhrase } = getTimingNeighbors(anchor.id);
		const startSec = roundTime(anchor.endSec + DEFAULT_INSERT_GAP_SEC);
		const nextBlock = createBlockWithinGap(startSec, nextPhrase?.startSec ?? null);
		if (!nextBlock) {
			errorMessage = 'There is not enough room after the selected block to insert another one.';
			return;
		}

		phrases = [...phrases, nextBlock].sort((left, right) => left.startSec - right.startSec);
		selectedId = nextBlock.id;
		seekTo(startSec);
		statusMessage = 'Added a block after the current selection.';
		clearMessages();
	}

	function duplicateSelectedBlock() {
		if (selectedIndex < 0 || !selectedPhrase) return;
		const duration = Math.max(
			MIN_BLOCK_LENGTH_SEC,
			selectedPhrase.endSec - selectedPhrase.startSec
		);
		const { next: nextPhrase } = getTimingNeighbors(selectedPhrase.id);
		const startSec = roundTime(selectedPhrase.endSec + DEFAULT_INSERT_GAP_SEC);
		const duplicate = createBlockWithinGap(
			startSec,
			nextPhrase?.startSec ?? null,
			selectedPhrase.text,
			duration
		);
		if (!duplicate) {
			errorMessage = 'There is not enough room to duplicate the selected block here.';
			return;
		}

		phrases = [...phrases, duplicate].sort((left, right) => left.startSec - right.startSec);
		selectedId = duplicate.id;
		statusMessage = 'Duplicated the selected block.';
		clearMessages();
	}

	function removeSelectedBlock() {
		if (selectedIndex < 0) return;
		const nextSelection = phrases[selectedIndex + 1]?.id ?? phrases[selectedIndex - 1]?.id ?? null;
		phrases = phrases.filter((phrase) => phrase.id !== selectedId);
		selectedId = nextSelection;
		statusMessage = 'Removed the selected block.';
		clearMessages();
	}

	function moveSelectedBlock(direction: -1 | 1) {
		if (selectedIndex < 0) return;
		const targetIndex = selectedIndex + direction;
		if (targetIndex < 0 || targetIndex >= phrases.length) return;

		const nextPhrases = [...phrases];
		const [moved] = nextPhrases.splice(selectedIndex, 1);
		nextPhrases.splice(targetIndex, 0, moved);
		phrases = nextPhrases;
		selectedId = moved.id;
		statusMessage =
			direction < 0
				? 'Moved the selected block earlier in the list.'
				: 'Moved the selected block later in the list.';
		clearMessages();
	}

	function sortBlocksByStartTime() {
		phrases = [...phrases].sort((left, right) => left.startSec - right.startSec);
		statusMessage = 'Sorted blocks by start time.';
		clearMessages();
	}

	function resetWorkspace() {
		if (browser && !window.confirm('Clear the editor workspace and start fresh?')) return;
		title = '';
		tempoBpm = '';
		ticksPerQuarter = '';
		timingBasis = '';
		note = '';
		audioPath = '';
		lyricsPath = '';
		phrases = [];
		selectedId = null;
		currentTimeSec = 0;
		clearUploadedAudio();
		statusMessage = 'Workspace cleared.';
		errorMessage = '';
	}

	async function importLyricsText(text: string, sourceLabel: string) {
		const payload = JSON.parse(text);
		applyImportedPayload(payload, sourceLabel);
	}

	async function importLyricsFromClipboard() {
		if (!browser || !navigator.clipboard?.readText) {
			errorMessage = 'Clipboard access is not available in this browser.';
			return;
		}

		try {
			const text = await navigator.clipboard.readText();
			if (!text.trim()) {
				throw new Error('Clipboard is empty.');
			}
			await importLyricsText(text, 'clipboard');
			statusMessage = 'Imported lyric blocks from the clipboard.';
			clearMessages();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Clipboard import failed.';
		}
	}

	async function importLyricsFromFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		try {
			const text = await file.text();
			lyricsPath = file.name;
			await importLyricsText(text, file.name);
		} catch (error) {
			errorMessage =
				error instanceof Error ? error.message : 'The selected JSON file could not be parsed.';
		} finally {
			input.value = '';
		}
	}

	async function loadLyricsFromPath(pathValue = lyricsPath.trim()) {
		const trimmed = pathValue.trim();
		if (!trimmed) {
			errorMessage = 'Enter a lyrics path or URL first.';
			return;
		}

		loadingRemoteLyrics = true;
		clearMessages();
		try {
			const response = await fetch(resolveMediaLikeUrl(trimmed));
			if (!response.ok) {
				throw new Error(`Unable to load lyrics: ${response.status}`);
			}
			const payload = await response.json();
			lyricsPath = trimmed;
			applyImportedPayload(payload, trimmed);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'The lyric JSON could not be loaded.';
		} finally {
			loadingRemoteLyrics = false;
		}
	}

	function clearUploadedAudio() {
		if (!uploadedAudioUrl) return;
		URL.revokeObjectURL(uploadedAudioUrl);
		uploadedAudioUrl = '';
		uploadedAudioName = '';
	}

	function useSelectedLyricsPath(path: string) {
		lyricsPath = path;
		if (!path.trim()) return;
		void loadLyricsFromPath(path);
	}

	function useSelectedAudioPath(path: string) {
		audioPath = path;
		clearUploadedAudio();
		statusMessage = path.trim()
			? `Using audio from the karaoke folder: ${path}.`
			: 'Audio selection cleared.';
		clearMessages();
	}

	function handleAudioFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		clearUploadedAudio();
		uploadedAudioUrl = URL.createObjectURL(file);
		uploadedAudioName = file.name;
		currentTimeSec = 0;
		audioDurationSec = 0;
		statusMessage = `Using uploaded audio: ${file.name}.`;
		clearMessages();
		input.value = '';
	}

	async function copyExportJson() {
		if (!browser || !navigator.clipboard?.writeText) {
			errorMessage = 'Clipboard write access is not available in this browser.';
			return;
		}

		try {
			await navigator.clipboard.writeText(exportJson);
			statusMessage = 'Export JSON copied to the clipboard.';
			clearMessages();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Copying the export JSON failed.';
		}
	}

	function downloadExportJson() {
		if (!browser) return;
		const blob = new Blob([exportJson], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = downloadFileName;
		document.body.append(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(url);
		statusMessage = `Downloaded ${downloadFileName}.`;
		clearMessages();
	}

	function isEditableShortcutTarget(target: EventTarget | null) {
		if (!(target instanceof HTMLElement)) return false;
		if (target.isContentEditable) return true;

		const editableAncestor = target.closest(
			'input, textarea, select, option, button, a, summary, [contenteditable="true"]'
		);
		return editableAncestor !== null;
	}

	$effect(() => {
		const activeUrl = uploadedAudioUrl;
		return () => {
			if (activeUrl) URL.revokeObjectURL(activeUrl);
		};
	});

	$effect(() => {
		if (phrases.length === 0) {
			selectedId = null;
			return;
		}

		if (!selectedId || !phrases.some((phrase) => phrase.id === selectedId)) {
			selectedId = phrases[0].id;
		}
	});

	$effect(() => {
		if (!browser || !audioEl || !isPlaying) return;

		const node = audioEl;
		let rafId = 0;
		const tick = () => {
			const nextTime = Number(node.currentTime);
			currentTimeSec = Number.isFinite(nextTime) ? Math.max(0, nextTime) : currentTimeSec;
			rafId = requestAnimationFrame(tick);
		};

		rafId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafId);
	});

	$effect(() => {
		if (!browser) return;
		const src = audioSrc;
		if (!src) {
			waveformEnvelope = [];
			waveformLoading = false;
			waveformError = '';
			return;
		}

		let cancelled = false;
		waveformLoading = true;
		waveformError = '';

		void decodeAudioEnvelope(src)
			.then((envelope) => {
				if (cancelled) return;
				waveformEnvelope = envelope;
			})
			.catch((error) => {
				if (cancelled) return;
				waveformEnvelope = [];
				waveformError =
					error instanceof Error ? error.message : 'Waveform preview unavailable for this track.';
			})
			.finally(() => {
				if (!cancelled) waveformLoading = false;
			});

		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		if (!browser) return;

		const handleKeydown = (event: KeyboardEvent) => {
			if (event.defaultPrevented) return;
			if (event.repeat) return;
			if (event.ctrlKey || event.metaKey || event.altKey) return;
			if (isEditableShortcutTarget(event.target)) return;

			if (event.code === 'Space') {
				event.preventDefault();
				void togglePlayback();
				return;
			}

			if (event.key === 'Delete' || event.key === 'Backspace') {
				if (!selectedId) return;
				event.preventDefault();
				removeSelectedBlock();
			}
		};

		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});

	$effect(() => {
		if (!browser || booted) return;

		booted = true;
		const params = new URLSearchParams(location.search);
		const queryLyrics = params.get('lyrics')?.trim() ?? '';
		const queryAudio = params.get('audio')?.trim() ?? '';

		if (queryAudio) {
			audioPath = queryAudio;
		}

		if (queryLyrics) {
			lyricsPath = queryLyrics;
			void loadLyricsFromPath(queryLyrics);
			return;
		}

		try {
			const rawSnapshot = localStorage.getItem(STORAGE_KEY);
			if (!rawSnapshot) return;
			hydrateSnapshot(JSON.parse(rawSnapshot) as StoredSnapshot);
			statusMessage = 'Restored your last karaoke editing session.';
			clearMessages();
		} catch {
			statusMessage = 'Load a karaoke JSON file or add lyric blocks to start editing.';
		}
	});

	$effect(() => {
		if (!browser || !booted) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotWorkspace()));
			lastSavedAt = Date.now();
		} catch {
			// ignore storage failures
		}
	});
</script>

<svelte:head>
	<title>Karaoke Editor</title>
</svelte:head>

<div
	class="min-h-screen bg-[radial-gradient(circle_at_top,#3b2216,transparent_28%),linear-gradient(180deg,#120d0a,#050816_42%,#020617)] text-slate-50"
>
	<div class="mx-auto max-w-[1720px] px-3 py-5 lg:px-5">
		<header
			class="mb-3 rounded-[1rem] border border-white/10 bg-slate-950/55 px-4 py-4 shadow-[0_1.2rem_2.8rem_rgba(2,6,23,0.3)] backdrop-blur md:px-5"
		>
			<div class="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
				<div class="max-w-3xl">
					<p class="karaedit-kicker">Studio tools</p>
					<h1 class="text-3xl font-black tracking-tight text-amber-50 md:text-[3.35rem]">
						Karaoke lyrics editor
					</h1>
					<p class="mt-3 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
						Import a karaoke JSON file, scrub the song, then move, add, remove, and retime lyric
						blocks while watching a live preview.
					</p>
					<p class="mt-3 text-xs leading-5 text-slate-400">
						Quick start:
						<a
							class="text-amber-200 underline decoration-amber-400/45 underline-offset-4"
							href={hintLink}
						>
							{hintLink}
						</a>
					</p>
				</div>

				<div class="grid gap-2 sm:grid-cols-3 lg:w-[24rem]">
					<div class="rounded-xl border border-white/10 bg-white/5 px-3.5 py-3">
						<p class="text-xs font-bold tracking-[0.16em] text-slate-400 uppercase">Blocks</p>
						<p class="mt-2 text-2xl font-black text-slate-50">{phrases.length}</p>
					</div>
					<div class="rounded-xl border border-white/10 bg-white/5 px-3.5 py-3">
						<p class="text-xs font-bold tracking-[0.16em] text-slate-400 uppercase">Cursor</p>
						<p class="mt-2 text-2xl font-black text-amber-100">{formatClock(currentTimeSec)}</p>
					</div>
					<div class="rounded-xl border border-white/10 bg-white/5 px-3.5 py-3">
						<p class="text-xs font-bold tracking-[0.16em] text-slate-400 uppercase">Issues</p>
						<p class="mt-2 text-2xl font-black text-slate-50">{validationIssues.length}</p>
					</div>
				</div>
			</div>

			<div class="mt-5 flex flex-wrap gap-3">
				<button class={accentButtonClass} type="button" onclick={addBlockAtPlayhead}>
					Add block at playhead
				</button>
				<button class={softButtonClass} type="button" onclick={sortBlocksByStartTime}>
					Sort by start time
				</button>
				<button class={softButtonClass} type="button" onclick={() => seekTo(0)}>
					Back to start
				</button>
				<button class={dangerButtonClass} type="button" onclick={resetWorkspace}>
					Reset workspace
				</button>
				<div
					class="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-semibold text-slate-200"
				>
					{lastSavedLabel}
				</div>
			</div>
		</header>

		{#if errorMessage}
			<div
				class="mb-3 rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100"
			>
				{errorMessage}
			</div>
		{/if}

		{#if statusMessage}
			<div
				class="mb-3 rounded-xl border border-emerald-300/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100"
			>
				{statusMessage}
			</div>
		{/if}

		<div class="grid gap-3 xl:grid-cols-[16rem_minmax(0,1fr)]">
			<section class={`${panelClass} flex flex-col overflow-hidden xl:row-span-2`}>
				<div class="border-b border-white/10 px-5 py-4">
					<p class="text-xs font-black tracking-[0.16em] text-slate-400 uppercase">Sources</p>
				</div>

				<div class="space-y-5 p-5">
					<div>
						<label
							for="karaedit-lyrics-select"
							class="mb-2 block text-xs font-bold tracking-[0.16em] text-slate-400 uppercase"
						>
							Lyrics JSON in karaoke folder
						</label>
						<select
							id="karaedit-lyrics-select"
							class={fieldClass}
							value={lyricsPath}
							onchange={(event) => {
								const target = event.currentTarget as HTMLSelectElement;
								useSelectedLyricsPath(target.value);
							}}
						>
							<option value="">Choose a lyrics JSON...</option>
							{#each availableLyricsFiles as file}
								<option value={file}>{file}</option>
							{/each}
						</select>
						<p class="mt-2 text-xs leading-5 text-slate-400">
							Found {data.karaokeLyricsFiles.length} JSON file(s) in
							<code>static/media/karaoke</code>.
						</p>
					</div>

					<div>
						<label
							for="karaedit-lyrics-path"
							class="mb-2 block text-xs font-bold tracking-[0.16em] text-slate-400 uppercase"
						>
							Custom lyrics path or URL
						</label>
						<div class="flex gap-2">
							<input
								id="karaedit-lyrics-path"
								class={fieldClass}
								type="text"
								placeholder="karaoke/karaoke.json"
								bind:value={lyricsPath}
							/>
							<button
								class={softButtonClass}
								type="button"
								onclick={() => loadLyricsFromPath()}
								disabled={loadingRemoteLyrics}
							>
								{loadingRemoteLyrics ? 'Loading...' : 'Load'}
							</button>
						</div>
						<p class="mt-2 text-xs leading-5 text-slate-400">
							Relative paths are resolved from <code>/media/</code>.
						</p>
					</div>

					<div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
						<label
							class="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
						>
							<input
								class="hidden"
								type="file"
								accept=".json,application/json"
								onchange={importLyricsFromFile}
							/>
							Import JSON file
						</label>
						<button class={softButtonClass} type="button" onclick={importLyricsFromClipboard}>
							Import from clipboard
						</button>
					</div>

					<div>
						<label
							for="karaedit-audio-select"
							class="mb-2 block text-xs font-bold tracking-[0.16em] text-slate-400 uppercase"
						>
							Audio file in karaoke folder
						</label>
						<select
							id="karaedit-audio-select"
							class={fieldClass}
							value={audioPath}
							onchange={(event) => {
								const target = event.currentTarget as HTMLSelectElement;
								useSelectedAudioPath(target.value);
							}}
						>
							<option value="">Choose an audio file...</option>
							{#each availableAudioFiles as file}
								<option value={file}>{file}</option>
							{/each}
						</select>
						<p class="mt-2 text-xs leading-5 text-slate-400">
							Found {data.karaokeAudioFiles.length} audio file(s) in
							<code>static/media/karaoke</code>.
						</p>
					</div>

					<div>
						<label
							for="karaedit-audio-path"
							class="mb-2 block text-xs font-bold tracking-[0.16em] text-slate-400 uppercase"
						>
							Custom audio path or URL
						</label>
						<input
							id="karaedit-audio-path"
							class={fieldClass}
							type="text"
							placeholder="karaoke/karaoke.mp3"
							bind:value={audioPath}
						/>
					</div>

					<div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
						<label
							class="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
						>
							<input class="hidden" type="file" accept="audio/*" onchange={handleAudioFileChange} />
							Upload audio file
						</label>
						<button
							class={softButtonClass}
							type="button"
							onclick={clearUploadedAudio}
							disabled={!uploadedAudioUrl}
						>
							Use path audio
						</button>
					</div>

					{#if uploadedAudioName}
						<div
							class="rounded-xl border border-amber-300/15 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
						>
							Uploaded audio active: {uploadedAudioName}
						</div>
					{/if}
				</div>

				<div class="border-y border-white/10 px-5 py-4">
					<p class="text-xs font-black tracking-[0.16em] text-slate-400 uppercase">Workspace</p>
				</div>

				<div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
					<div class="grid gap-2">
						<button class={accentButtonClass} type="button" onclick={addBlockAtPlayhead}>
							Add block at playhead
						</button>
						<button class={softButtonClass} type="button" onclick={sortBlocksByStartTime}>
							Sort blocks by time
						</button>
						<button class={softButtonClass} type="button" onclick={() => seekTo(0)}>
							Jump to start
						</button>
					</div>

					<div class="rounded-xl border border-white/10 bg-white/5 p-4">
						<p class="text-xs font-bold tracking-[0.16em] text-slate-400 uppercase">
							Timeline selection
						</p>
						{#if selectedPhrase}
							<div class="mt-3 space-y-2">
								<p class="text-sm font-semibold text-amber-100">
									Block #{selectedIndex + 1}
								</p>
								<p class="text-xs font-semibold text-slate-300">
									{formatClock(selectedPhrase.startSec)} -> {formatClock(selectedPhrase.endSec)}
								</p>
								<p class="text-sm leading-6 text-slate-100">
									{phraseSummary(selectedPhrase.text)}
								</p>
							</div>
						{:else}
							<p class="mt-3 text-sm leading-6 text-slate-300">
								Use the timeline to pick a block, then edit its lyrics and timing in the editor above.
							</p>
						{/if}
					</div>

					<div class="rounded-xl border border-white/10 bg-white/5 p-4">
						<p class="text-xs font-bold tracking-[0.16em] text-slate-400 uppercase">
							Session status
						</p>
						<div class="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
							<div class="rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2.5">
								<p class="text-[0.68rem] font-bold tracking-[0.16em] text-slate-500 uppercase">
									Blocks
								</p>
								<p class="mt-1 text-lg font-black text-slate-50">{phrases.length}</p>
							</div>
							<div class="rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2.5">
								<p class="text-[0.68rem] font-bold tracking-[0.16em] text-slate-500 uppercase">
									Cursor
								</p>
								<p class="mt-1 text-lg font-black text-amber-100">
									{formatClock(currentTimeSec)}
								</p>
							</div>
							<div class="rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2.5">
								<p class="text-[0.68rem] font-bold tracking-[0.16em] text-slate-500 uppercase">
									Issues
								</p>
								<p class="mt-1 text-lg font-black text-slate-50">{validationIssues.length}</p>
							</div>
						</div>
					</div>
				</div>
			</section>

			<section class="space-y-4">
				<div class={`${panelClass} p-5`}>
					<div class="flex flex-col gap-5">
						<div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
							<div>
								<p class="text-xs font-black tracking-[0.16em] text-slate-400 uppercase">
									Timeline workspace
								</p>
								<h2 class="mt-1 text-xl font-black text-slate-50 md:text-[1.7rem]">
									Scrub, zoom, and retime against the track
								</h2>
								<p class="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
									The audio transport and waveform stay together so block timing edits take up more
									of the screen.
								</p>
							</div>

							<div class="flex flex-wrap gap-2">
								<button
									class={softButtonClass}
									type="button"
									onclick={() => seekTo(currentTimeSec - 1)}
								>
									-1s
								</button>
								<button class={accentButtonClass} type="button" onclick={togglePlayback}>
									{isPlaying ? 'Pause' : 'Play'}
								</button>
								<button
									class={softButtonClass}
									type="button"
									onclick={() => seekTo(currentTimeSec + 1)}
								>
									+1s
								</button>
							</div>
						</div>

						<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,29rem)]">
							<div class="space-y-4">
								<div class="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_17rem]">
									<div class="space-y-4">
										{#if audioSrc}
											<audio
												bind:this={audioEl}
												class="w-full"
												controls
												preload="metadata"
												src={audioSrc}
												onloadedmetadata={() => {
													audioDurationSec = Number.isFinite(audioEl?.duration)
														? Number(audioEl?.duration)
														: 0;
												}}
												ontimeupdate={() => {
													currentTimeSec = Math.max(0, Number(audioEl?.currentTime ?? 0));
												}}
												onplay={() => {
													isPlaying = true;
												}}
												onpause={() => {
													isPlaying = false;
												}}
												onended={() => {
													isPlaying = false;
													currentTimeSec = Math.max(0, Number(audioEl?.duration ?? currentTimeSec));
												}}
												onerror={() => {
													errorMessage = 'The current audio source could not be loaded.';
												}}
											></audio>
										{:else}
											<div
												class="rounded-xl border border-dashed border-white/15 bg-white/5 px-4 py-6 text-center text-sm leading-6 text-slate-300"
											>
												Add an audio path or upload a track to time lyrics against the song.
											</div>
										{/if}

										<div>
											<div class="mb-2 flex items-center justify-between gap-3 text-sm text-slate-300">
												<span>Playhead</span>
												<span class="font-semibold text-amber-100">
													{formatClock(currentTimeSec)} / {formatClock(previewDurationSec)}
												</span>
											</div>
											<input
												class="karaedit-range"
												type="range"
												min="0"
												max={previewDurationSec}
												step="0.01"
												value={currentTimeSec}
												oninput={(event) => {
													const input = event.currentTarget as HTMLInputElement;
													seekTo(Number(input.value));
												}}
											/>
										</div>
									</div>

									<div class="grid gap-2 sm:grid-cols-3 2xl:grid-cols-1">
										<div class="rounded-xl border border-white/10 bg-white/5 px-3.5 py-3">
											<p class="text-xs font-bold tracking-[0.16em] text-slate-400 uppercase">
												Track
											</p>
											<p class="mt-2 text-lg font-black text-slate-50">
												{formatClock(previewDurationSec)}
											</p>
										</div>
										<div class="rounded-xl border border-white/10 bg-white/5 px-3.5 py-3">
											<p class="text-xs font-bold tracking-[0.16em] text-slate-400 uppercase">
												Selected
											</p>
											<p class="mt-2 truncate text-sm font-semibold text-amber-100">
												{selectedPhrase ? phraseSummary(selectedPhrase.text) : 'No block'}
											</p>
										</div>
										<div class="rounded-xl border border-white/10 bg-white/5 px-3.5 py-3">
											<label
												for="karaedit-timeline-zoom"
												class="text-xs font-bold tracking-[0.16em] text-slate-400 uppercase"
											>
												Zoom
											</label>
											<input
												id="karaedit-timeline-zoom"
												class="mt-3 w-full accent-amber-400"
												type="range"
												min="24"
												max="180"
												step="4"
												bind:value={timelineZoomPxPerSec}
											/>
											<p class="mt-2 text-right text-sm font-semibold text-amber-100">
												{timelineZoomPxPerSec}px/sec
											</p>
										</div>
									</div>
								</div>
							</div>

							<div class="rounded-xl border border-white/10 bg-white/5 p-4">
								<div class="flex items-center justify-between gap-3">
									<div>
										<p class="text-xs font-black tracking-[0.16em] text-slate-400 uppercase">
											Selected block
										</p>
										<h2 class="mt-1 text-lg font-black text-slate-50">
											{selectedPhrase ? `Block #${selectedIndex + 1}` : 'No block selected'}
										</h2>
									</div>
									{#if selectedPhrase}
										<button
											class={softButtonClass}
											type="button"
											onclick={addBlockAfterSelection}
										>
											Add after
										</button>
									{/if}
								</div>

								{#if selectedPhrase}
									<div class="mt-4 space-y-4">
										<div>
											<label
												for="karaedit-block-text"
												class="mb-2 block text-xs font-bold tracking-[0.16em] text-slate-400 uppercase"
											>
												Lyrics
											</label>
											<textarea
												id="karaedit-block-text"
												class={`${fieldClass} min-h-44 resize-y`}
												value={selectedPhrase.text}
												placeholder="Use new lines or / to break the lyric block."
												spellcheck="false"
												oninput={(event) => {
													const target = event.currentTarget as HTMLTextAreaElement;
													updateSelectedText(target.value);
												}}
											></textarea>
										</div>

										<!-- <div class="grid gap-4 sm:grid-cols-2">
											<div class="space-y-3 rounded-xl border border-white/10 bg-slate-950/55 p-4">
												<div class="flex items-center justify-between gap-3">
													<label
														for="karaedit-block-start"
														class="text-xs font-bold tracking-[0.16em] text-slate-400 uppercase"
													>
														Start
													</label>
													<span class="text-sm font-semibold text-amber-100">
														{formatClock(selectedPhrase.startSec)}
													</span>
												</div>
												<input
													id="karaedit-block-start"
													class={fieldClass}
													type="number"
													min="0"
													step="0.01"
													value={selectedPhrase.startSec}
													oninput={(event) => {
														const target = event.currentTarget as HTMLInputElement;
														setSelectedBoundary('startSec', Number(target.value));
													}}
												/>
												<div class="grid grid-cols-3 gap-2">
													<button
														class={softButtonClass}
														type="button"
														onclick={() => nudgeSelectedBoundary('startSec', -TIME_STEP_SEC)}
													>
														-0.1s
													</button>
													<button
														class={accentButtonClass}
														type="button"
														onclick={() => setBoundaryFromPlayhead('startSec')}
													>
														Set
													</button>
													<button
														class={softButtonClass}
														type="button"
														onclick={() => nudgeSelectedBoundary('startSec', TIME_STEP_SEC)}
													>
														+0.1s
													</button>
												</div>
											</div>

											<div class="space-y-3 rounded-xl border border-white/10 bg-slate-950/55 p-4">
												<div class="flex items-center justify-between gap-3">
													<label
														for="karaedit-block-end"
														class="text-xs font-bold tracking-[0.16em] text-slate-400 uppercase"
													>
														End
													</label>
													<span class="text-sm font-semibold text-amber-100">
														{formatClock(selectedPhrase.endSec)}
													</span>
												</div>
												<input
													id="karaedit-block-end"
													class={fieldClass}
													type="number"
													min="0"
													step="0.01"
													value={selectedPhrase.endSec}
													oninput={(event) => {
														const target = event.currentTarget as HTMLInputElement;
														setSelectedBoundary('endSec', Number(target.value));
													}}
												/>
												<div class="grid grid-cols-3 gap-2">
													<button
														class={softButtonClass}
														type="button"
														onclick={() => nudgeSelectedBoundary('endSec', -TIME_STEP_SEC)}
													>
														-0.1s
													</button>
													<button
														class={accentButtonClass}
														type="button"
														onclick={() => setBoundaryFromPlayhead('endSec')}
													>
														Set
													</button>
													<button
														class={softButtonClass}
														type="button"
														onclick={() => nudgeSelectedBoundary('endSec', TIME_STEP_SEC)}
													>
														+0.1s
													</button>
												</div>
											</div>
										</div>

										<div class="rounded-xl border border-white/10 bg-slate-950/55 p-4">
											<p class="mb-3 text-xs font-bold tracking-[0.16em] text-slate-400 uppercase">
												Block actions
											</p>
											<div class="grid gap-2 sm:grid-cols-2">
												<button
													class={softButtonClass}
													type="button"
													onclick={() => moveSelectedInTime(-TIME_STEP_SEC)}
												>
													Move -0.1s
												</button>
												<button
													class={softButtonClass}
													type="button"
													onclick={() => moveSelectedInTime(TIME_STEP_SEC)}
												>
													Move +0.1s
												</button>
												<button
													class={softButtonClass}
													type="button"
													onclick={duplicateSelectedBlock}
												>
													Duplicate
												</button>
												<button
													class={dangerButtonClass}
													type="button"
													onclick={removeSelectedBlock}
												>
													Delete
												</button>
											</div>
										</div> -->
									</div>
								{:else}
									<div
										class="mt-4 rounded-xl border border-dashed border-white/15 bg-slate-950/45 px-4 py-6 text-sm leading-6 text-slate-300"
									>
										Pick a block directly on the timeline to edit its lyrics and timing here.
									</div>
								{/if}
							</div>
						</div>

						<div class="border-t border-white/10 pt-4">
							<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
								<div>
									<p class="text-xs font-black tracking-[0.16em] text-slate-400 uppercase">
										Waveform timeline
									</p>
									<p class="mt-1 text-sm leading-6 text-slate-300">
										Drag to retime, resize with the handles, and keep the whole track visible in
										one wide lane.
									</p>
								</div>
								<p class="text-xs font-semibold tracking-[0.08em] text-amber-100 uppercase">
									Double-click empty space to add a block
								</p>
							</div>

							<div class="mt-4">
								<KaraokeTimelineEditor
									durationSec={previewDurationSec}
									{currentTimeSec}
									{selectedId}
									blocks={phrases}
									{waveformEnvelope}
									{waveformLoading}
									{waveformError}
									zoomPxPerSec={timelineZoomPxPerSec}
									minBlockLengthSec={MIN_BLOCK_LENGTH_SEC}
									onSeek={seekTo}
									onSelect={(id) => {
										selectedId = id;
									}}
									onAddBlockAtTime={(timeSec) => {
										addBlockAtTime(timeSec, 'timeline click');
									}}
									onUpdateBlock={(id, startSec, endSec, mode) => {
										updateBlockTiming(id, startSec, endSec, mode);
									}}
								/>
							</div>
						</div>
					</div>
				</div>

				<div class={`${panelClass} min-h-[24rem] p-4 md:p-5`}>
					<KaraokeTimingPreview lyrics={lyricsDocument} {currentTimeSec} />
				</div>
			</section>

			<section class="space-y-4 xl:col-start-2">
				<div class={`${panelClass} p-5`}>
					<p class="text-xs font-black tracking-[0.16em] text-slate-400 uppercase">Song metadata</p>
					<div class="mt-4 grid gap-4">
						<input class={fieldClass} type="text" placeholder="Title" bind:value={title} />
						<div class="grid gap-4 sm:grid-cols-2">
							<input
								class={fieldClass}
								type="number"
								min="0"
								step="0.01"
								placeholder="Tempo BPM"
								bind:value={tempoBpm}
							/>
							<input
								class={fieldClass}
								type="number"
								min="0"
								step="1"
								placeholder="Ticks / quarter"
								bind:value={ticksPerQuarter}
							/>
						</div>
						<input
							class={fieldClass}
							type="text"
							placeholder="Timing basis"
							bind:value={timingBasis}
						/>
						<textarea
							class={`${fieldClass} min-h-28 resize-y`}
							placeholder="Optional note"
							bind:value={note}
						></textarea>
					</div>
				</div>

				<div class={`${panelClass} p-5 xl:col-span-2`}>
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div>
							<p class="text-xs font-black tracking-[0.16em] text-slate-400 uppercase">Export</p>
							<h2 class="mt-1 text-xl font-black text-slate-50 md:text-[1.7rem]">Ready to save</h2>
						</div>
						<div class="flex flex-wrap gap-2">
							<button class={softButtonClass} type="button" onclick={copyExportJson}>
								Copy JSON
							</button>
							<button class={accentButtonClass} type="button" onclick={downloadExportJson}>
								Download
							</button>
						</div>
					</div>

					<textarea
						class={`${fieldClass} mt-4 min-h-72 font-mono text-xs leading-6`}
						readonly
						spellcheck="false"
						value={exportJson}
					></textarea>

					{#if validationIssues.length}
						<div class="mt-4 rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 py-4">
							<p class="text-xs font-black tracking-[0.16em] text-rose-200 uppercase">
								Check before exporting
							</p>
							<ul class="mt-3 space-y-2 text-sm text-rose-100">
								{#each validationIssues as issue}
									<li>{issue}</li>
								{/each}
							</ul>
						</div>
					{:else}
						<div
							class="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-400/10 px-4 py-4 text-sm text-emerald-100"
						>
							No structural issues detected in the current block order.
						</div>
					{/if}
				</div>
			</section>
		</div>
	</div>
</div>

<style>
	.karaedit-kicker {
		margin: 0;
		font-size: 0.78rem;
		font-weight: 900;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: rgba(253, 230, 138, 0.78);
	}

	.karaedit-range {
		width: 100%;
		appearance: none;
		height: 0.7rem;
		border-radius: 999px;
		background:
			linear-gradient(90deg, rgba(245, 158, 11, 0.95), rgba(125, 211, 252, 0.95)),
			rgba(255, 255, 255, 0.06);
		outline: none;
	}

	.karaedit-range::-webkit-slider-thumb {
		appearance: none;
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		border: 2px solid rgba(255, 248, 220, 0.9);
		background: #fff7bf;
		box-shadow: 0 0 1rem rgba(245, 158, 11, 0.55);
		cursor: pointer;
	}

	.karaedit-range::-moz-range-thumb {
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		border: 2px solid rgba(255, 248, 220, 0.9);
		background: #fff7bf;
		box-shadow: 0 0 1rem rgba(245, 158, 11, 0.55);
		cursor: pointer;
	}

	code {
		font-family:
			'SFMono-Regular', 'Cascadia Mono', 'Roboto Mono', Consolas, 'Liberation Mono', monospace;
	}
</style>
