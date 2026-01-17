export type VibrationPattern = number | number[];

export type HapticsConfig = {
	enabled: boolean;
	// Vibration pattern when a new question starts (in the player view).
	questionStart: VibrationPattern;
	// Vibration pattern when a question ends (question -> review).
	questionEnd: VibrationPattern;
	// Vibration pattern when the admin triggers a "buzz" for everyone.
	adminBroadcast: VibrationPattern;
};

// App-level haptics configuration.
// Adjust these values to taste (or set enabled=false to disable).
export const HAPTICS: HapticsConfig = {
	enabled: true,
	questionStart: [25],
	questionEnd: [40, 25, 40],
	adminBroadcast: [500, 40, 500]
};


// 2. Simple state using Svelte 5 Runes (if you need reactive toggling)
// You can import this state in your components to toggle haptics.
export const hapticState = $state({ enabled: true });

let lastVibrationAt = 0;

export function vibrate(pattern: VibrationPattern) {
    // 1. Check if we are in a browser environment
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
        return false;
    }

    // 2. Check global enable flag
    if (!hapticState.enabled) return false;

    // 3. Debounce (Prevent spamming)
    const now = Date.now();
    if (now - lastVibrationAt < 300) {
        return false; 
    }
    lastVibrationAt = now;

    try {
        console.log('Vibrating:', pattern);
        
        // 4. ✅ CRITICAL: Call vibrate directly on navigator to preserve 'this' context
        // Returns true if hardware supports it and call was successful
        return navigator.vibrate(pattern);
    } catch (e) {
        console.error('Vibration failed:', e);
        return false;
    }
}