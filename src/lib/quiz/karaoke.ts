import { resolveAppAssetUrl } from '$lib/utils/paths.svelte';

export type KaraokeWord = {
	text: string;
	startSec: number;
	endSec: number;
};

export type KaraokePhrase = {
	startSec: number;
	endSec: number;
	text: string;
	lines: string[];
	lineWords: KaraokeWord[][];
	words: KaraokeWord[];
};

export type KaraokeLyricsDocument = {
	version?: number;
	title?: string;
	tempoBpm?: number;
	ticksPerQuarter?: number;
	timingBasis?: string;
	note?: string;
	phrases: KaraokePhrase[];
	durationSec: number;
};

type KaraokeRawWord = {
	text?: unknown;
	start?: unknown;
	end?: unknown;
};

type KaraokeRawPhrase = {
	start_sec?: unknown;
	end_sec?: unknown;
	text?: unknown;
};

type KaraokeRawCue = {
	id?: unknown;
	start?: unknown;
	end?: unknown;
	text?: unknown;
	words?: KaraokeRawWord[];
};

type KaraokeRawDocument = {
	version?: unknown;
	title?: unknown;
	timing_basis?: unknown;
	tempo_bpm?: unknown;
	ticks_per_quarter?: unknown;
	note?: unknown;
	tempo_map?: Array<{ bpm?: unknown }>;
	cues?: KaraokeRawCue[];
	phrases?: KaraokeRawPhrase[];
};

const lyricsCache = new Map<string, Promise<KaraokeLyricsDocument>>();

function toFiniteNumber(value: unknown, fallback = 0) {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

export function splitKaraokeText(text: string) {
	return text
		.split(/\r?\n|\/+/)
		.map((line) => line.trim())
		.filter(Boolean);
}

function wordWeight(word: Pick<KaraokeWord, 'text'>) {
	return Math.max(1, String(word.text).replace(/\s+/g, '').length);
}

function tokenizeLine(line: string) {
	return line
		.split(/\s+/)
		.map((part) => part.trim())
		.filter(Boolean);
}

function distributeWordsToExplicitLines(lines: string[], words: KaraokeWord[][] | KaraokeWord[]) {
	const flatWords = Array.isArray(words[0])
		? (words as KaraokeWord[][]).flat()
		: (words as KaraokeWord[]);
	if (!flatWords.length) return lines.map(() => [] as KaraokeWord[]);

	let cursor = 0;
	return lines.map((line, index) => {
		const remainingLines = lines.length - index;
		const remainingWords = flatWords.length - cursor;
		if (remainingLines <= 1) return flatWords.slice(cursor);

		const desiredCount = Math.max(1, tokenizeLine(line).length);
		const maxAllowed = Math.max(1, remainingWords - (remainingLines - 1));
		const takeCount = Math.min(desiredCount, maxAllowed);
		const slice = flatWords.slice(cursor, cursor + takeCount);
		cursor += takeCount;
		return slice;
	});
}

function autoSplitWordsIntoLines(words: KaraokeWord[]) {
	if (!words.length) return { lines: [] as string[], lineWords: [] as KaraokeWord[][] };

	const totalWeight = words.reduce((sum, word) => sum + wordWeight(word), 0);
	const targetLineWeight = 13;
	const lineCount = Math.min(
		words.length,
		Math.max(1, Math.min(4, Math.ceil(totalWeight / targetLineWeight)))
	);
	if (lineCount === 1) {
		return {
			lines: [words.map((word) => word.text).join(' ')],
			lineWords: [words]
		};
	}

	const groups: KaraokeWord[][] = [];
	let start = 0;
	let remainingWeight = totalWeight;

	for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
		const remainingLines = lineCount - lineIndex;
		if (remainingLines === 1) {
			groups.push(words.slice(start));
			break;
		}

		const targetWeight = remainingWeight / remainingLines;
		let bestEnd = start + 1;
		let accumulated = 0;
		let bestDiff = Number.POSITIVE_INFINITY;
		const maxEnd = words.length - (remainingLines - 1);

		for (let end = start + 1; end <= maxEnd; end++) {
			accumulated += wordWeight(words[end - 1]);
			const diff = Math.abs(accumulated - targetWeight);
			if (diff <= bestDiff) {
				bestDiff = diff;
				bestEnd = end;
			}
			if (accumulated >= targetWeight && end > start + 1) break;
		}

		const group = words.slice(start, bestEnd);
		groups.push(group);
		remainingWeight -= group.reduce((sum, word) => sum + wordWeight(word), 0);
		start = bestEnd;
	}

	return {
		lines: groups.map((group) => group.map((word) => word.text).join(' ')),
		lineWords: groups
	};
}

function buildPhraseLines(text: string, words: KaraokeWord[]) {
	const explicitLines = splitKaraokeText(text);
	if (explicitLines.length > 1) {
		return {
			lines: explicitLines,
			lineWords: distributeWordsToExplicitLines(explicitLines, words)
		};
	}

	if (words.length > 0) return autoSplitWordsIntoLines(words);

	return {
		lines: explicitLines.length ? explicitLines : [text],
		lineWords: (explicitLines.length ? explicitLines : [text]).map(() => [] as KaraokeWord[])
	};
}

function normalizeWords(
	sourceWords: KaraokeRawWord[] | undefined,
	startSec: number,
	endSec: number
) {
	const rawWords = Array.isArray(sourceWords) ? sourceWords : [];
	const words = rawWords
		.map((word, index) => {
			const text = String(word?.text ?? '').trim();
			if (!text) return null;

			const wordStartSec = Math.max(startSec, toFiniteNumber(word?.start, startSec));
			const nextWordStartSec = toFiniteNumber(rawWords[index + 1]?.start, endSec);
			const candidateEndSec = toFiniteNumber(word?.end, nextWordStartSec);
			const wordEndSec = Math.max(wordStartSec, candidateEndSec || nextWordStartSec || endSec);

			return {
				text,
				startSec: wordStartSec,
				endSec: wordEndSec
			};
		})
		.filter(Boolean) as KaraokeWord[];

	return words;
}

function normalizePhrase(
	phrase: KaraokeRawPhrase | undefined,
	index: number,
	source: KaraokeRawPhrase[]
): KaraokePhrase | null {
	if (!phrase) return null;

	const startSec = Math.max(0, toFiniteNumber(phrase.start_sec));
	const nextStartSec = toFiniteNumber(source[index + 1]?.start_sec, startSec + 4);
	const candidateEndSec = toFiniteNumber(phrase.end_sec, nextStartSec);
	const endSec = Math.max(startSec, candidateEndSec || nextStartSec || startSec);
	const text = String(phrase.text ?? '').trim();
	if (!text) return null;
	const { lines, lineWords } = buildPhraseLines(text, []);

	return {
		startSec,
		endSec,
		text,
		lines,
		lineWords,
		words: []
	};
}

function normalizeCue(cue: KaraokeRawCue | undefined, index: number, source: KaraokeRawCue[]) {
	if (!cue) return null;

	const startSec = Math.max(0, toFiniteNumber(cue.start));
	const nextStartSec = toFiniteNumber(source[index + 1]?.start, startSec + 4);
	const candidateEndSec = toFiniteNumber(cue.end, nextStartSec);
	const endSec = Math.max(startSec, candidateEndSec || nextStartSec || startSec);
	const text = String(cue.text ?? '').trim();
	if (!text) return null;
	const words = normalizeWords(cue.words, startSec, endSec);
	const { lines, lineWords } = buildPhraseLines(text, words);

	return {
		startSec,
		endSec,
		text,
		lines,
		lineWords,
		words
	} satisfies KaraokePhrase;
}

export function normalizeKaraokeLyrics(payload: unknown): KaraokeLyricsDocument {
	const raw = (payload ?? {}) as KaraokeRawDocument;
	const sourceCues = Array.isArray(raw.cues) ? raw.cues : [];
	const sourcePhrases = Array.isArray(raw.phrases) ? raw.phrases : [];
	const phrases =
		sourceCues.length > 0
			? (sourceCues
					.map((cue, index) => normalizeCue(cue, index, sourceCues))
					.filter(Boolean) as KaraokePhrase[])
			: (sourcePhrases
					.map((phrase, index) => normalizePhrase(phrase, index, sourcePhrases))
					.filter(Boolean) as KaraokePhrase[]);

	const durationSec = phrases.reduce((max, phrase) => Math.max(max, phrase.endSec), 0) || 0;
	const tempoFromMap = Array.isArray(raw.tempo_map)
		? raw.tempo_map.map((point) => Number(point?.bpm)).find((bpm) => Number.isFinite(bpm))
		: undefined;

	return {
		version: Number.isFinite(Number(raw.version)) ? Number(raw.version) : undefined,
		title: typeof raw.title === 'string' ? raw.title : undefined,
		tempoBpm: Number.isFinite(Number(raw.tempo_bpm))
			? Number(raw.tempo_bpm)
			: Number.isFinite(Number(tempoFromMap))
				? Number(tempoFromMap)
				: undefined,
		ticksPerQuarter: Number.isFinite(Number(raw.ticks_per_quarter))
			? Number(raw.ticks_per_quarter)
			: undefined,
		timingBasis: typeof raw.timing_basis === 'string' ? raw.timing_basis : undefined,
		note: typeof raw.note === 'string' ? raw.note : undefined,
		phrases,
		durationSec
	};
}

function toMediaUrl(path: string) {
	const trimmed = path.trim();
	if (!trimmed) return '';
	if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
	if (trimmed.startsWith('/')) return resolveAppAssetUrl(trimmed);
	return resolveAppAssetUrl(`/media/${trimmed}`);
}

export function loadKaraokeLyrics(path: string) {
	const key = path.trim();
	if (!key) return Promise.resolve(normalizeKaraokeLyrics({ phrases: [] }));
	const cached = lyricsCache.get(key);
	if (cached) return cached;

	const pending = fetch(toMediaUrl(key))
		.then(async (response) => {
			if (!response.ok) {
				throw new Error(`Unable to load karaoke lyrics: ${response.status}`);
			}
			return response.json();
		})
		.then((payload) => normalizeKaraokeLyrics(payload));

	lyricsCache.set(key, pending);
	return pending;
}

export function clamp01(value: number) {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

export function getPhraseRevealPercent(
	phrase: KaraokePhrase | null | undefined,
	currentTimeSec: number,
	fallbackProgress = 0
) {
	return getWordRevealPercent(phrase?.words ?? [], currentTimeSec, fallbackProgress);
}

export function getWordRevealPercent(
	words: KaraokeWord[],
	currentTimeSec: number,
	fallbackProgress = 0
) {
	if (!words.length) return clamp01(fallbackProgress) * 100;

	const totalWeight = words.reduce(
		(sum, word) => sum + Math.max(1, word.text.replace(/\s+/g, '').length),
		0
	);
	if (totalWeight <= 0) return clamp01(fallbackProgress) * 100;

	let revealedWeight = 0;
	for (const word of words) {
		const weight = Math.max(1, word.text.replace(/\s+/g, '').length);
		if (currentTimeSec >= word.endSec) {
			revealedWeight += weight;
			continue;
		}
		if (currentTimeSec > word.startSec) {
			const duration = Math.max(0.001, word.endSec - word.startSec);
			revealedWeight += weight * clamp01((currentTimeSec - word.startSec) / duration);
		}
		break;
	}

	return clamp01(revealedWeight / totalWeight) * 100;
}

export function getKaraokeState(lyrics: KaraokeLyricsDocument | null, currentTimeSec: number) {
	const phrases = lyrics?.phrases ?? [];
	const currentTime = Math.max(0, currentTimeSec);
	let activeIndex = -1;

	for (let i = 0; i < phrases.length; i++) {
		const phrase = phrases[i];
		if (currentTime >= phrase.startSec && currentTime <= phrase.endSec) {
			activeIndex = i;
			break;
		}
	}

	let previousPhrase: KaraokePhrase | null = null;
	let activePhrase: KaraokePhrase | null = null;
	let nextPhrase: KaraokePhrase | null = null;
	let waitUntilNextSec: number | null = null;
	let progress = 0;

	if (activeIndex >= 0) {
		activePhrase = phrases[activeIndex];
		previousPhrase = phrases[activeIndex - 1] ?? null;
		nextPhrase = phrases[activeIndex + 1] ?? null;
		const duration = Math.max(0.001, activePhrase.endSec - activePhrase.startSec);
		progress = clamp01((currentTime - activePhrase.startSec) / duration);
	} else {
		for (let i = phrases.length - 1; i >= 0; i--) {
			if (phrases[i].endSec < currentTime) {
				previousPhrase = phrases[i];
				break;
			}
		}

		nextPhrase = phrases.find((phrase) => phrase.startSec > currentTime) ?? null;
		if (nextPhrase) {
			waitUntilNextSec = Math.max(0, nextPhrase.startSec - currentTime);
		}
	}

	return {
		activeIndex,
		activePhrase,
		previousPhrase,
		nextPhrase,
		waitUntilNextSec,
		progress,
		afterLastPhrase: phrases.length > 0 && currentTime > phrases[phrases.length - 1].endSec
	};
}
