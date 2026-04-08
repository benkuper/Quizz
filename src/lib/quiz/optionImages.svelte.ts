import { getMedia } from '$lib/url.svelte';

function loadable(src: string) {
	return new Promise<boolean>((resolve) => {
		const img = new Image();
		img.onload = () => resolve(true);
		img.onerror = () => resolve(false);
		img.src = src;
	});
}

export async function loadQuestionOptionImages(
	questionId: string | null | undefined,
	optionCount: number
) {
	const id = String(questionId ?? '').trim();
	if (!id || optionCount <= 0) return [] as Array<string | null>;

	const sources = Array.from({ length: optionCount }, (_, index) =>
		getMedia(`${id}/${index + 1}.png`)
	);

	return Promise.all(
		sources.map(async (src) => {
			const exists = await loadable(src);
			return exists ? src : null;
		})
	);
}