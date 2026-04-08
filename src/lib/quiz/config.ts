import data from '$lib/assets/data.json';

type RawQuizData = {
	teams?: Record<string, string>;
	questions?: unknown[];
};

const quizData = data as RawQuizData;

export type TeamDefinition = {
	id: string;
	name: string;
};

export const TEAM_DEFINITIONS: TeamDefinition[] = Object.entries(quizData.teams ?? {}).map(
	([id, name]) => ({ id, name: String(name) })
);

export const TEAM_NAME_BY_ID = Object.fromEntries(
	TEAM_DEFINITIONS.map((team) => [team.id, team.name])
) as Record<string, string>;

export const QUESTIONS = Array.isArray(quizData.questions) ? quizData.questions : [];