import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { PageServerLoad } from './$types';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac']);

async function listKaraokeFiles() {
	const karaokeDir = join(process.cwd(), 'static', 'media', 'karaoke');

	try {
		const entries = await readdir(karaokeDir, { withFileTypes: true });
		const files = entries
			.filter((entry) => entry.isFile())
			.map((entry) => entry.name)
			.sort();

		return {
			karaokeLyricsFiles: files
				.filter((file) => file.toLowerCase().endsWith('.json'))
				.map((file) => `karaoke/${file}`),
			karaokeAudioFiles: files
				.filter((file) => AUDIO_EXTENSIONS.has(file.slice(file.lastIndexOf('.')).toLowerCase()))
				.map((file) => `karaoke/${file}`)
		};
	} catch {
		return {
			karaokeLyricsFiles: [] as string[],
			karaokeAudioFiles: [] as string[]
		};
	}
}

export const load: PageServerLoad = async () => {
	return listKaraokeFiles();
};
