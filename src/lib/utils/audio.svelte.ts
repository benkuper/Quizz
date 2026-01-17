import { resolveAppAssetUrl } from '$lib/utils/paths.svelte';

export type PlayAudioOptions = {
	volume?: number;
	restart?: boolean;
};

export type AudioPlayer = {
	play: (src: string, options?: PlayAudioOptions) => Promise<boolean>;
	stop: () => void;
};

function clamp01(n: number) {
	if (!Number.isFinite(n)) return 1;
	return Math.min(1, Math.max(0, n));
}

// Creates a tiny reusable audio player that can be used across different UI events.
// It lazily creates the underlying Audio element on the first successful play.
export function createAudioPlayer(): AudioPlayer {
	let audio: HTMLAudioElement | null = null;

	return {
		play: async (src: string, options: PlayAudioOptions = {}) => {
			const trimmed = src.trim();
			if (!trimmed) return false;
			if (typeof Audio === 'undefined') return false;

			const url = resolveAppAssetUrl(trimmed);
			if (!url) return false;

			try {
				if (!audio) {
					audio = new Audio();
					audio.preload = 'auto';
				}

				const restart = options.restart ?? true;
				if (restart) {
					audio.pause();
					try {
						audio.currentTime = 0;
					} catch {
						// ignore
					}
				}

				audio.src = url;
				if (typeof options.volume === 'number') {
					audio.volume = clamp01(options.volume);
				}

				await audio.play();
				return true;
			} catch {
				// Autoplay is often blocked until a user interaction; fail silently.
				return false;
			}
		},
		stop: () => {
			if (!audio) return;
			try {
				audio.pause();
			} catch {
				// ignore
			}
		}
	};
}
