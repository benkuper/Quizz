export type GameStatus = 'lobby' | 'question' | 'review' | 'leaderboard' | 'finished';

export type QuizQuestionBase = {
	id: string;
	type: string;
	question: string | string[];
	// Optional audio cue played on players' phones when the question appears.
	// Recommended: a relative URL like "media/my-sound.mp3" so subfolder deploys work.
	introSound?: string;
	// Optional vibration patterns.
	// If set, the player will vibrate with this pattern when the question appears.
	// If not set, the question appearance will not vibrate.
	vibration?: import('$lib/config/haptics.svelte').VibrationPattern;
	// Optional vibration when leaving the question (question -> review).
	vibrationEnd?: import('$lib/config/haptics.svelte').VibrationPattern;
	time?: number;
};

export type QuizQuestionQcm = QuizQuestionBase & {
	type: 'qcm';
	options: string[];
	multiple?: boolean;
	answers?: string[];
};

export type QuizQuestionSorting = QuizQuestionBase & {
	type: 'sorting';
	options: string[];
	answers?: string[];
};

export type EstimateUnit = 'year' | 'number';
export type EstimateDecay = 'linear' | 'exponential';

export type EstimateScoringConfig = {
	maxPoints?: number;
	decay?: EstimateDecay;
	// Distance at which score reaches 0 (linear)
	zeroAt?: number;
	// Distance at which score halves (exponential)
	halfLife?: number;
	// Distance threshold to consider the answer "correct"
	correctWithin?: number;
};

export type EstimateConfig = {
	min?: number;
	max?: number;
	step?: number;
	unit?: EstimateUnit;
	scoring?: EstimateScoringConfig;
};

export type QuizQuestionEstimate = QuizQuestionBase & {
	type: 'estimate';
	answers?: number[];
	estimate?: EstimateConfig;
};

export type QuizQuestionFastFingers = QuizQuestionBase & {
	type: 'fastFingers';
	fastFingers?: {
		shuffle?: boolean;
		steps: Array<{
			good: { src: string; alt?: string };
			bad: { src: string; alt?: string };
		}>;
	};
};

export type QuizMediaKind = 'video' | 'image';

export type QuizMediaItem = {
	kind: QuizMediaKind;
	src: string;
	alt?: string;
	poster?: string;
	autoplay?: boolean;
	controls?: boolean;
	loop?: boolean;
	muted?: boolean;
	startAt?: number;
};

export type QuizQuestionMedia = QuizQuestionBase & {
	type: 'media';
	media: QuizMediaItem | QuizMediaItem[];
};

export type QuizQuestion =
	| QuizQuestionQcm
	| QuizQuestionSorting
	| QuizQuestionEstimate
	| QuizQuestionFastFingers
	| QuizQuestionMedia
	| (QuizQuestionBase & Record<string, unknown>);

export type PlayerView = {
	id: string;
	name: string;
	score: number;
	connected: boolean;
	lastSeen: number;
	answered: boolean;
	lastAnswerTimeLeft: number | null;
	lastAnswerSubmittedAt: number | null;
	lastCorrect: boolean | null;
	lastPoints: number | null;
};

export type BroadcastState = {
	status: GameStatus;
	questionIndex: number;
	question?: QuizQuestion;
	totalQuestions: number;
	timer: number;
	players: Record<string, PlayerView>;
	answerCount: number;
	roundSummary?: {
		estimate?: {
			unit?: EstimateUnit;
			guesses: Array<{
				value: number;
				count: number;
				names: string[];
			}>;
		};
	};
};
