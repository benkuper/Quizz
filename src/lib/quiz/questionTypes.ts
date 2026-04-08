export function isPassiveQuestionType(type: unknown) {
	const normalized = String(type ?? '');
	return normalized === 'media' || normalized === 'karaoke';
}

export function isKaraokeQuestionType(type: unknown) {
	return String(type ?? '') === 'karaoke';
}

export function isPassiveQuestion(question: { type?: unknown } | null | undefined) {
	return isPassiveQuestionType(question?.type);
}
