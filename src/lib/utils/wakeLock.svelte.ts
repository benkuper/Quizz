export type ScreenWakeLockState = {
	supported: boolean;
	active: boolean;
	lastError: string | null;
	needsInteraction: boolean;
};

export type ScreenWakeLock = {
	state: ScreenWakeLockState;
	request: () => Promise<boolean>;
	release: () => void;
	startAuto: () => () => void;
};

export function createScreenWakeLock(): ScreenWakeLock {
	const state = $state<ScreenWakeLockState>({
		supported: typeof navigator !== 'undefined' && Boolean((navigator as any).wakeLock?.request),
		active: false,
		lastError: null,
		needsInteraction: false
	});

	let sentinel: any = null;
	let visibilityListener: (() => void) | null = null;

	async function request(): Promise<boolean> {
		state.lastError = null;
		state.needsInteraction = false;

		if (!state.supported) return false;
		if (typeof document === 'undefined') return false;
		if (document.visibilityState !== 'visible') return false;

		try {
			sentinel = await (navigator as any).wakeLock.request('screen');
			state.active = true;

			// Some browsers fire `release` when the lock is lost.
			try {
				sentinel.addEventListener?.('release', () => {
					state.active = false;
				});
			} catch {
				// ignore
			}

			return true;
		} catch (e) {
			state.active = false;
			state.lastError = e instanceof Error ? e.message : String(e);

			// Many browsers require a user gesture; mark so callers can retry on interaction.
			state.needsInteraction = true;
			return false;
		}
	}

	function release() {
		try {
			sentinel?.release?.();
		} catch {
			// ignore
		}
		sentinel = null;
		state.active = false;
	}

	function startAuto() {
		if (typeof document === 'undefined') return () => {};
		if (visibilityListener) return () => {};

		const onVisibility = () => {
			if (document.visibilityState === 'visible') {
				void request();
			} else {
				release();
			}
		};

		document.addEventListener('visibilitychange', onVisibility);
		visibilityListener = () => document.removeEventListener('visibilitychange', onVisibility);

		// Try immediately.
		void request();

		return () => {
			visibilityListener?.();
			visibilityListener = null;
			release();
		};
	}

	return { state, request, release, startAuto };
}
