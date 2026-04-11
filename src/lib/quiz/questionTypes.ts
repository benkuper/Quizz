export function isPassiveQuestionType(type: unknown) {
	const normalized = String(type ?? '');
	return normalized === 'media' || normalized === 'karaoke' || normalized === 'burger';
}

export function isQcmLikeQuestionType(type: unknown) {
	const normalized = String(type ?? '');
	return normalized === 'qcm' || normalized === 'deblur' || normalized === 'perfectmatch';
}

export function isPerfectMatchQuestionType(type: unknown) {
	return String(type ?? '') === 'perfectmatch';
}

export function isBurgerQuestionType(type: unknown) {
	return String(type ?? '') === 'burger';
}

export function isKaraokeQuestionType(type: unknown) {
	return String(type ?? '') === 'karaoke';
}

export function isPassiveQuestion(question: { type?: unknown } | null | undefined) {
	return isPassiveQuestionType(question?.type);
}
