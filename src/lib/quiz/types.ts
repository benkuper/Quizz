export type GameStatus = 'lobby' | 'reading' | 'question' | 'reveal' | 'review' | 'leaderboard' | 'finished';

export type QuizQuestionBase = {
	id: string;
	type: string;
	question: string | string[];
	separateReveal?: boolean;
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
	noreading?: boolean;
};

export type QuizOptionAnswer = number | string;

export type QuizQuestionQcm = QuizQuestionBase & {
	type: 'qcm';
	options: string[];
	multiple?: boolean;
	answers?: QuizOptionAnswer[];
};

export type QuizQuestionDeblur = QuizQuestionBase & {
	type: 'deblur';
	options: string[];
	multiple?: boolean;
	answers?: QuizOptionAnswer[];
};

export type QuizQuestionPerfectMatch = QuizQuestionBase & {
	type: 'perfectmatch';
	options: string[];
	multiple?: boolean;
	answers?: QuizOptionAnswer[];
};

export type QuizQuestionSorting = QuizQuestionBase & {
	type: 'sorting';
	options: string[];
	answers?: string[];
};

export type QuizQuestionBurger = QuizQuestionBase & {
	type: 'burger';
	options: string[];
	answers: string[];
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

export type QuizQuestionVrWhack = QuizQuestionBase & {
	type: 'vrwhack';
	vrwhack?: {
		// Optional list of images to use for the "mole".
		// If empty/missing, the UI falls back to an emoji target.
		targets?: Array<{ src: string; alt?: string }>;
		// Optional hint text shown under the counter.
		hint?: string;
		// Optional UI tuning.
		fovDeg?: number;
		verticalFovDeg?: number;
		targetSizeRem?: number;
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

export type QuizKaraokePhrase = {
	startSec: number;
	endSec?: number;
	text: string;
};

export type QuizKaraokeLyricsDocument = {
	tempoBpm?: number;
	ticksPerQuarter?: number;
	note?: string;
	phrases: QuizKaraokePhrase[];
};

export type QuizQuestionKaraoke = QuizQuestionBase & {
	type: 'karaoke';
	karaoke: {
		audio: string;
		lyrics: string;
		title?: string;
		artist?: string;
		offsetSec?: number;
	};
};

export type KaraokePlaybackSync = {
	serverNow: number | null;
	questionStartedAt: number | null;
};

export type QuizQuestion =
	| QuizQuestionQcm
	| QuizQuestionDeblur
	| QuizQuestionPerfectMatch
	| QuizQuestionSorting
	| QuizQuestionBurger
	| QuizQuestionEstimate
	| QuizQuestionFastFingers
	| QuizQuestionVrWhack
	| QuizQuestionMedia
	| QuizQuestionKaraoke
	| (QuizQuestionBase & Record<string, unknown>);

export type PlayerView = {
	id: string;
	name: string;
	score: number;
	enabled: boolean;
	connected: boolean;
	lastSeen: number;
	answered: boolean;
	lastAnswerTimeLeft: number | null;
	lastAnswerSubmittedAt: number | null;
	lastCorrect: boolean | null;
	lastPoints: number | null;
};

export type OptionRevealState = {
	placedOptionIndexes: number[];
	focusedOptionIndex: number | null;
	totalOptions: number;
	revealPhase?: 'options' | 'questions' | 'answers';
};

export type BroadcastState = {
	status: GameStatus;
	questionIndex: number;
	actualQuestionIndex?: number;
	question?: QuizQuestion;
	totalQuestions: number;
	totalActualQuestions?: number;
	timer: number;
	serverNow?: number;
	questionStartedAt?: number | null;
	players: Record<string, PlayerView>;
	answerCount: number;
	optionReveal?: OptionRevealState;
	badgeOverlayTeamId?: string | null;
	awaitingAdminAnswerSelection?: boolean;
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
