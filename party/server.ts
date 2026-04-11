import type * as Party from "partykit/server";
import { QUESTIONS, TEAM_DEFINITIONS } from "../src/lib/quiz/config";
const QCM_OPTION_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

type Player = {
    id: string;
    name: string;
    score: number;
    enabled: boolean;
    connected: boolean;
    connId?: string;
    lastSeen: number; // epoch ms
};

type GameStatus = 'lobby' | 'reading' | 'question' | 'reveal' | 'review' | 'leaderboard' | 'finished';

type OptionRevealState = {
    placedOptionIndexes: number[];
    focusedOptionIndex: number | null;
    revealPhase: 'options' | 'questions' | 'answers';
};

type GameState = {
    status: GameStatus;
    questionIndex: number;
    timer: number;
    questionStartedAt: number | null;
    badgeOverlayTeamId: string | null;
    awaitingAdminAnswerSelection: boolean;
    selectedAnswerIndexes: number[];
    optionReveal: OptionRevealState;
    players: Record<string, Player>;
    lastRoundSummary?: {
        estimate?: {
            unit?: 'year' | 'number';
            guesses: Array<{ value: number; count: number; names: string[] }>;
        };
    };
    lastRoundResults: Record<
        string,
        {
            correct: boolean;
            points: number;
        }
    >;
    currentAnswers: Record<
        string,
        {
            answer: any;
            timeLeft: number;
            submittedAt: number;
        }
    >; // playerId -> latest submission for current question
};

function createInitialPlayers(): Record<string, Player> {
    return Object.fromEntries(
        TEAM_DEFINITIONS.map((team) => [
            team.id,
            {
                id: team.id,
                name: team.name,
                score: 0,
                enabled: true,
                connected: false,
                lastSeen: 0
            }
        ])
    );
}

export default class QuizServer implements Party.Server {
    constructor(readonly room: Party.Room) { }

    // Keep ephemeral connection->player mapping out of shared state.
    private connIdToPlayerId: Record<string, string> = {};

    private presenceInterval: ReturnType<typeof setInterval> | null = null;
    private lastAdminVibrateAt = 0;

    state: GameState = {
        status: 'lobby',
        questionIndex: -1,
        timer: 0,
        questionStartedAt: null,
        badgeOverlayTeamId: null,
        awaitingAdminAnswerSelection: false,
        selectedAnswerIndexes: [],
        optionReveal: {
            placedOptionIndexes: [],
            focusedOptionIndex: null,
            revealPhase: 'options'
        },
        players: createInitialPlayers(),
        lastRoundSummary: undefined,
        lastRoundResults: {},
        currentAnswers: {}
    };

    interval: ReturnType<typeof setInterval> | null = null;
    readonly DEFAULT_ROUND_TIME = 20; // seconds
    readonly PRESENCE_TIMEOUT_MS = 25_000;

    private clearPlayerConnection(playerId: string, options: { updateLastSeen?: boolean } = {}) {
        const player = this.state.players[playerId];
        if (!player) return;

        player.connected = false;
        player.connId = undefined;
        if (options.updateLastSeen !== false) {
            player.lastSeen = Date.now();
        }

        delete this.state.currentAnswers[playerId];

        for (const cid of Object.keys(this.connIdToPlayerId)) {
            if (this.connIdToPlayerId[cid] === playerId) {
                delete this.connIdToPlayerId[cid];
            }
        }
    }

    private resetAssignments() {
        for (const player of Object.values(this.state.players)) {
            player.connected = false;
            player.connId = undefined;
            player.lastSeen = Date.now();
        }

        this.connIdToPlayerId = {};
        this.state.currentAnswers = {};
        this.broadcastState();
    }

    private setTeamEnabled(teamId: string, enabled: boolean) {
        const player = this.state.players[teamId];
        if (!player) return;

        player.enabled = enabled;
        if (!enabled) {
            this.clearPlayerConnection(teamId);
        }

        this.broadcastState();
    }

    private setBadgeOverlayTeam(teamId: string | null) {
        if (teamId === null) {
            this.state.badgeOverlayTeamId = null;
            this.broadcastState();
            return;
        }

        const normalizedTeamId = String(teamId || '').trim();
        if (!normalizedTeamId || !this.state.players[normalizedTeamId]) return;

        this.state.badgeOverlayTeamId = this.state.badgeOverlayTeamId === normalizedTeamId ? null : normalizedTeamId;
        this.broadcastState();
    }

    private ensurePresenceWatchdog() {
        if (this.presenceInterval) return;

        this.presenceInterval = setInterval(() => {
            const now = Date.now();
            let changed = false;

            for (const p of Object.values(this.state.players)) {
                if (!p.connected) continue;
                if (now - (p.lastSeen || 0) > this.PRESENCE_TIMEOUT_MS) {
                    p.connected = false;
                    p.connId = undefined;
                    changed = true;
                }
            }

            if (changed) this.broadcastState();
        }, 5_000);
    }

    onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
        this.ensurePresenceWatchdog();

        // Let clients know their connection id so they can find themselves in state.players.
        conn.send(JSON.stringify({ type: "hello", id: conn.id }));

        // Send current state
        this.broadcastState();
    }

    private isMediaQuestion(q: any) {
        return q && String(q.type || '') === 'media';
    }

    private isPerfectMatchQuestion(q: any) {
        return q && String(q.type || '') === 'perfectmatch';
    }

    private isBurgerQuestion(q: any) {
        return q && String(q.type || '') === 'burger';
    }

    private isQcmLikeQuestion(q: any) {
        const type = String(q?.type || '');
        return type === 'qcm' || type === 'deblur' || type === 'perfectmatch';
    }

    private isPassiveQuestion(q: any) {
        const type = String(q?.type || '');
        return type === 'media' || type === 'karaoke' || type === 'burger';
    }

    private getBurgerQuestions(q: any) {
        return Array.isArray(q?.options) ? q.options.map(String) : [];
    }

    private getBurgerAnswers(q: any) {
        return Array.isArray(q?.answers) ? q.answers.map(String) : [];
    }

    private getRevealPhase(q: any): 'options' | 'questions' | 'answers' {
        if (!this.isBurgerQuestion(q)) return 'options';
        return this.state.optionReveal.revealPhase === 'answers' ? 'answers' : 'questions';
    }

    private getRevealValues(q: any, phase: 'options' | 'questions' | 'answers' = this.getRevealPhase(q)) {
        if (this.isBurgerQuestion(q)) {
            return phase === 'answers' ? this.getBurgerAnswers(q) : this.getBurgerQuestions(q);
        }

        return Array.isArray(q?.options) ? q.options.map(String) : [];
    }

    private getRevealOptionCount(q: any, phase: 'options' | 'questions' | 'answers' = this.getRevealPhase(q)) {
        return this.getRevealValues(q, phase).length;
    }

    private getInitialRevealPhase(q: any): 'options' | 'questions' | 'answers' | null {
        if (!this.isBurgerQuestion(q)) {
            return this.getQuestionOptionCount(q) > 0 ? 'options' : null;
        }

        if (this.getRevealOptionCount(q, 'questions') > 0) return 'questions';
        if (this.getRevealOptionCount(q, 'answers') > 0) return 'answers';
        return null;
    }

    private getQuestionOptionCount(q: any) {
        return Array.isArray(q?.options) ? q.options.length : 0;
    }

    private usesSeparateReveal(q: any) {
        if (!Boolean(q?.separateReveal ?? true)) return false;
        if (this.isBurgerQuestion(q)) {
            return this.getRevealOptionCount(q, 'questions') > 0 || this.getRevealOptionCount(q, 'answers') > 0;
        }
        return this.getQuestionOptionCount(q) > 0;
    }

    private resetOptionReveal() {
        this.state.optionReveal = {
            placedOptionIndexes: [],
            focusedOptionIndex: null,
            revealPhase: 'options'
        };
    }

    private resetAdminAnswerSelection() {
        this.state.awaitingAdminAnswerSelection = false;
        this.state.selectedAnswerIndexes = [];
    }

    private getQcmCorrectAnswers(q: any) {
        const options = Array.isArray(q?.options) ? q.options.map(String) : [];
        const rawAnswers = this.isPerfectMatchQuestion(q) ? this.state.selectedAnswerIndexes : q?.answers;
        return this.normalizeQcmAnswers(rawAnswers, options).sort((a, b) => a - b);
    }

    private selectPerfectMatchAnswer(index: number) {
        const currentQ = QUESTIONS[this.state.questionIndex];
        if (this.state.status !== 'review' || !this.isPerfectMatchQuestion(currentQ)) return;

        const totalOptions = this.getQuestionOptionCount(currentQ);
        if (!Number.isInteger(index) || index < 0 || index >= totalOptions) return;

        this.state.selectedAnswerIndexes = [index + 1];
        this.state.awaitingAdminAnswerSelection = false;
        this.calculateScores();
        this.broadcastState();
    }

    private getNextUnplacedOptionIndex(q: any, phase: 'options' | 'questions' | 'answers' = this.getRevealPhase(q)) {
        const total = this.getRevealOptionCount(q, phase);
        for (let index = 0; index < total; index++) {
            if (!this.state.optionReveal.placedOptionIndexes.includes(index)) {
                return index;
            }
        }
        return null;
    }

    private allOptionsPlaced(q: any, phase: 'options' | 'questions' | 'answers' = this.getRevealPhase(q)) {
        const total = this.getRevealOptionCount(q, phase);
        return this.state.optionReveal.placedOptionIndexes.length >= total;
    }

    private startRevealStage() {
        const currentQ = QUESTIONS[this.state.questionIndex];
        if (!this.usesSeparateReveal(currentQ)) {
            this.launchQuestion();
            return;
        }

        const initialPhase = this.getInitialRevealPhase(currentQ);
        if (!initialPhase) {
            if (this.isBurgerQuestion(currentQ)) {
                this.endRound();
            } else {
                this.launchQuestion();
            }
            return;
        }

        this.state.status = 'reveal';
        this.state.optionReveal = {
            placedOptionIndexes: [],
            focusedOptionIndex: this.getNextUnplacedOptionIndex(currentQ, initialPhase),
            revealPhase: initialPhase
        };
        this.broadcastState();
    }

    private startBurgerAnswerReveal() {
        const currentQ = QUESTIONS[this.state.questionIndex];
        if (this.state.status !== 'reveal' || !this.isBurgerQuestion(currentQ)) return;

        this.state.optionReveal = {
            placedOptionIndexes: [],
            focusedOptionIndex: this.getNextUnplacedOptionIndex(currentQ, 'answers'),
            revealPhase: 'answers'
        };
        this.broadcastState();
    }

    private revealNextOption() {
        const currentQ = QUESTIONS[this.state.questionIndex];
        if (this.state.status !== 'reveal' || !this.usesSeparateReveal(currentQ)) return;
        this.state.optionReveal.focusedOptionIndex = this.getNextUnplacedOptionIndex(currentQ);
        this.broadcastState();
    }

    private placeFocusedOption() {
        const currentQ = QUESTIONS[this.state.questionIndex];
        const focusedOptionIndex = this.state.optionReveal.focusedOptionIndex;
        if (this.state.status !== 'reveal' || !this.usesSeparateReveal(currentQ) || focusedOptionIndex === null) {
            return;
        }

        if (!this.state.optionReveal.placedOptionIndexes.includes(focusedOptionIndex)) {
            this.state.optionReveal.placedOptionIndexes = [...this.state.optionReveal.placedOptionIndexes, focusedOptionIndex]
                .sort((a, b) => a - b);
        }

        this.state.optionReveal.focusedOptionIndex = null;
        this.broadcastState();
    }

    private focusPlacedOption(index: number) {
        const currentQ = QUESTIONS[this.state.questionIndex];
        if (this.state.status !== 'reveal' || !this.usesSeparateReveal(currentQ)) return;
        if (!this.state.optionReveal.placedOptionIndexes.includes(index)) return;
        this.state.optionReveal.focusedOptionIndex = index;
        this.broadcastState();
    }

    onClose(conn: Party.Connection) {
        const playerId = this.connIdToPlayerId[conn.id];
        if (!playerId) return;

        delete this.connIdToPlayerId[conn.id];

        const player = this.state.players[playerId];
        // Only mark disconnected if this close corresponds to the latest connection.
        if (player && player.connId === conn.id) {
            this.clearPlayerConnection(playerId);
            this.broadcastState();
        }
    }

    async onMessage(message: string, sender: Party.Connection) {
        let event: any;
        try {
            event = JSON.parse(message);
        } catch {
            return;
        }

        if (event.type === 'join') {
            const teamId = String(event.teamId || '').trim();
            if (!teamId) return;

            const team = this.state.players[teamId];
            if (!team) {
                sender.send(JSON.stringify({ type: 'join_rejected', reason: 'unknown_team' }));
                return;
            }

            if (!team.enabled) {
                sender.send(JSON.stringify({ type: 'join_rejected', reason: 'disabled' }));
                return;
            }

            if (team.connected && team.connId !== sender.id) {
                sender.send(JSON.stringify({ type: 'join_rejected', reason: 'occupied' }));
                return;
            }

            const previousTeamId = this.connIdToPlayerId[sender.id];
            if (previousTeamId && previousTeamId !== teamId) {
                this.clearPlayerConnection(previousTeamId, { updateLastSeen: false });
            }

            team.connected = true;
            team.connId = sender.id;
            team.lastSeen = Date.now();

            this.connIdToPlayerId[sender.id] = teamId;
            sender.send(JSON.stringify({ type: 'join_ok', teamId }));
            this.broadcastState();
        }

        if (event.type === 'ping') {
            const playerId = this.connIdToPlayerId[sender.id];
            if (!playerId) return;
            const player = this.state.players[playerId];
            if (!player) return;
            player.lastSeen = Date.now();
            if (!player.connected || player.connId !== sender.id) {
                player.connected = true;
                player.connId = sender.id;
            }
            // no broadcast needed for every ping
        }

        if (event.type === 'admin_start') {
            this.startGame();
        }

        if (event.type === 'admin_reset') {
            this.resetGameToLobby();
        }

        if (event.type === 'admin_reset_assignments') {
            this.resetAssignments();
        }

        if (event.type === 'admin_set_team_enabled') {
            const teamId = String(event.teamId || '').trim();
            if (!teamId) return;
            this.setTeamEnabled(teamId, Boolean(event.enabled));
        }

        if (event.type === 'admin_vibrate') {
            const now = Date.now();
            // Basic throttling to prevent accidental spam.
            if (now - this.lastAdminVibrateAt < 800) return;
            this.lastAdminVibrateAt = now;
            this.room.broadcast(JSON.stringify({ type: 'vibrate' }));
        }

        if (event.type === 'admin_get_questions') {
            sender.send(
                JSON.stringify({
                    type: 'admin_questions',
                    data: QUESTIONS.map((q: any, index: number) => ({
                        index,
                        questionIndex: this.isMediaQuestion(q) ? null : QUESTIONS.slice(0, index).filter((qq: any) => !this.isMediaQuestion(qq)).length,
                        mediaIndex: this.isMediaQuestion(q) ? QUESTIONS.slice(0, index).filter((qq: any) => this.isMediaQuestion(qq)).length : null,
                        id: q?.id,
                        question: q?.question,
                        type: q?.type,
                        time: q?.time
                    }))
                })
            );
        }

        if (event.type === 'admin_jump') {
            const index = Number(event.index);
            if (!Number.isFinite(index)) return;
            this.jumpToQuestion(index);
        }

        if (event.type === 'admin_focus_option') {
            const index = Number(event.index);
            if (!Number.isInteger(index) || index < 0) return;
            this.focusPlacedOption(index);
        }

        if (event.type === 'admin_set_correct_answer') {
            const index = Number(event.index);
            if (!Number.isInteger(index) || index < 0) return;
            this.selectPerfectMatchAnswer(index);
        }

        if (event.type === 'admin_finish_round') {
            if (this.state.status !== 'question') return;
            const q = QUESTIONS[this.state.questionIndex];
            if (this.isMediaQuestion(q)) {
                this.nextQuestion();
            } else {
                this.finishRoundNow();
            }
        }

        if (event.type === 'admin_next') {
            if (this.state.status === 'reading') {
                const q: any = QUESTIONS[this.state.questionIndex];
                if (this.usesSeparateReveal(q)) {
                    this.startRevealStage();
                } else {
                    this.launchQuestion();
                }
                return;
            }

            if (this.state.status === 'review' && this.state.awaitingAdminAnswerSelection) {
                return;
            }

            // If currently answering, end the round. If in review, advance.
            if (this.state.status === 'question') {
                const q: any = QUESTIONS[this.state.questionIndex];
                if (this.isMediaQuestion(q)) {
                    this.nextQuestion();
                } else {
                    this.finishRoundNow();
                }
            } else if (this.state.status === 'reveal') {
                const q: any = QUESTIONS[this.state.questionIndex];
                if (!this.usesSeparateReveal(q)) {
                    this.launchQuestion();
                } else if (this.state.optionReveal.focusedOptionIndex !== null) {
                    this.placeFocusedOption();
                } else if (!this.allOptionsPlaced(q)) {
                    this.revealNextOption();
                } else if (this.isBurgerQuestion(q) && this.state.optionReveal.revealPhase !== 'answers') {
                    this.startBurgerAnswerReveal();
                } else if (this.isBurgerQuestion(q)) {
                    this.endRound();
                } else {
                    this.launchQuestion();
                }
            } else {
                this.nextQuestion();
            }
        }

        if (event.type === 'admin_remove_player') {
            const id = String(event.playerId || '').trim();
            if (!id) return;
            if (this.state.players[id]) {
                this.clearPlayerConnection(id);
                this.broadcastState();
            }
        }

        if (event.type === 'admin_toggle_badge_overlay') {
            const teamId = String(event.teamId || '').trim();
            if (!teamId) return;
            this.setBadgeOverlayTeam(teamId);
        }

        if (event.type === 'admin_hide_badge_overlay') {
            this.setBadgeOverlayTeam(null);
        }

        if (event.type === 'admin_remove_offline') {
            this.broadcastState();
        }

        if (event.type === 'admin_remove_all') {
            this.resetAssignments();
        }

        if (event.type === 'submit_answer') {
            if (this.state.status === 'question') {
                const currentQ = QUESTIONS[this.state.questionIndex];
                if (this.isPassiveQuestion(currentQ)) return;
                const playerId = this.connIdToPlayerId[sender.id];
                if (!playerId) return;

                const player = this.state.players[playerId];
                if (player) player.lastSeen = Date.now();
                // Record answer (by playerId, stable across reconnects)
                this.state.currentAnswers[playerId] = {
                    answer: event.answer,
                    timeLeft: this.state.timer,
                    submittedAt: Date.now()
                };

                // Ack the submitter (used by player UI for "submitted" state + timeLeft multiplier)
                const q: any = QUESTIONS[this.state.questionIndex];
                sender.send(
                    JSON.stringify({
                        type: 'answer_ack',
                        questionId: q?.id,
                        timeLeft: this.state.timer,
                        submittedAt: this.state.currentAnswers[playerId].submittedAt
                    })
                );

                // Broadcast so admin/projector update immediately
                this.broadcastState();
            }
        }

        if (event.type === 'media_finished' || event.type === 'passive_finished') {
            if (this.state.status !== 'question') return;
            const currentQ: any = QUESTIONS[this.state.questionIndex];
            if (!this.isPassiveQuestion(currentQ)) return;

            // Ignore stale signals.
            const qid = String(currentQ?.id ?? '');
            if (qid && typeof event.questionId === 'string' && event.questionId !== qid) return;

            this.nextQuestion();
        }
    }

    private resetGameToLobby() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }

        // Keep players connected, but reset game progress and scores.
        this.state.status = 'lobby';
        this.state.questionIndex = -1;
        this.state.timer = 0;
        this.state.questionStartedAt = null;
        this.resetAdminAnswerSelection();
        this.resetOptionReveal();
        this.state.currentAnswers = {};
        this.state.lastRoundResults = {};
        this.state.lastRoundSummary = undefined;

        this.broadcastState();
    }

    private jumpToQuestion(index: number) {
        const clamped = Math.max(0, Math.min(QUESTIONS.length - 1, Math.floor(index)));
        this.state.questionIndex = clamped;
        this.resetAdminAnswerSelection();
        this.resetOptionReveal();
        this.state.currentAnswers = {};
        this.state.lastRoundResults = {};

        const currentQ: any = QUESTIONS[this.state.questionIndex];
        if (currentQ?.noreading) {
             this.launchQuestion();
             return;
        }

        this.state.status = 'reading';
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.state.timer = 0;
        this.state.questionStartedAt = null;

        this.broadcastState();
    }

    private finishRoundNow() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.state.timer = 0;
        this.endRound();
    }

    startGame() {
        this.state.questionIndex = -1;
        this.nextQuestion();
    }

    nextQuestion() {
        if (this.state.status === 'finished') return;

        // If we were in review, go to next question
        if (this.state.questionIndex < QUESTIONS.length - 1) {
            this.state.questionIndex++;
            this.resetAdminAnswerSelection();
            this.resetOptionReveal();
            this.state.currentAnswers = {};
            this.state.lastRoundResults = {};
            
            const currentQ: any = QUESTIONS[this.state.questionIndex];
            if (currentQ?.noreading) {
                 this.launchQuestion();
                 return;
            }

            this.state.status = 'reading';
            if (this.interval) {
                clearInterval(this.interval);
                this.interval = null;
            }
            this.state.timer = 0;
            this.state.questionStartedAt = null;
        } else {
            this.state.status = 'finished';
            this.state.questionStartedAt = null;
        }
        this.broadcastState();
    }

    launchQuestion() {
        this.state.status = 'question';
        this.resetAdminAnswerSelection();
        this.resetOptionReveal();
        const currentQ: any = QUESTIONS[this.state.questionIndex];
        this.state.questionStartedAt = this.isPassiveQuestion(currentQ) ? Date.now() : null;

        if (this.isPassiveQuestion(currentQ)) {
            if (this.interval) {
                clearInterval(this.interval);
                this.interval = null;
            }
            this.state.timer = 0;
        } else {
            const roundTime = currentQ?.time ?? this.DEFAULT_ROUND_TIME;
            this.startTimer(roundTime);
        }
        this.broadcastState();
    }

    startTimer(seconds: number) {
        this.state.timer = seconds;
        if (this.interval) clearInterval(this.interval);

        this.interval = setInterval(() => {
            this.state.timer--;
            if (this.state.timer <= 0) {
                clearInterval(this.interval!);
                this.interval = null;

                const currentQ = QUESTIONS[this.state.questionIndex];
                if (this.isMediaQuestion(currentQ)) {
                    this.nextQuestion();
                } else {
                    this.endRound();
                }
            } else {
                // Optimize: maybe don't broadcast every second if latency is high, 
                // but for smooth UI, every second is fine for small groups.
                // Or just send start time and let client countdown.
                // For simplicity, broadcast tick.
                this.broadcastState();
            }
        }, 1000);
    }

    endRound() {
        const currentQ: any = QUESTIONS[this.state.questionIndex];
        this.state.status = 'review';
        this.state.questionStartedAt = null;
        this.state.optionReveal.focusedOptionIndex = null;

        if (this.isPerfectMatchQuestion(currentQ)) {
            this.state.awaitingAdminAnswerSelection = true;
            this.state.selectedAnswerIndexes = [];
            this.state.lastRoundResults = {};
            this.state.lastRoundSummary = undefined;
            this.broadcastState();
            return;
        }

        this.resetAdminAnswerSelection();
        this.calculateScores();
        this.broadcastState();
    }

    private normalizeQcmAnswer(value: unknown, options: string[]): number | null {
        if (typeof value === 'number' && Number.isInteger(value)) {
            return value >= 1 && value <= options.length ? value : null;
        }

        if (typeof value !== 'string') return null;

        const trimmed = value.trim();
        if (!trimmed) return null;

        const parsed = Number(trimmed);
        if (Number.isInteger(parsed) && parsed >= 1 && parsed <= options.length) {
            return parsed;
        }

        const upper = trimmed.toUpperCase();
        if (upper.length === 1) {
            const labelIndex = QCM_OPTION_LABELS.indexOf(upper);
            if (labelIndex >= 0 && labelIndex < options.length) {
                return labelIndex + 1;
            }
        }

        const optionIndex = options.findIndex((option) => option === trimmed);
        return optionIndex >= 0 ? optionIndex + 1 : null;
    }

    private normalizeQcmAnswers(value: unknown, options: string[]): number[] {
        const rawValues = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
        const normalized: number[] = [];

        for (const raw of rawValues) {
            const answerIndex = this.normalizeQcmAnswer(raw, options);
            if (answerIndex === null || normalized.includes(answerIndex)) continue;
            normalized.push(answerIndex);
        }

        return normalized;
    }

    private getQcmRoundBasePoints(q: any, submission: { timeLeft?: number } | undefined) {
        return String(q?.type || '') === 'deblur'
            ? Math.max(0, Math.floor(Number(submission?.timeLeft ?? 0)))
            : 10;
    }

    private scoreQcmLikeSubmission(q: any, submission: { answer?: unknown; timeLeft?: number }) {
        const options = Array.isArray(q?.options) ? q.options.map(String) : [];
        const correctAnswers = this.getQcmCorrectAnswers(q);
        if (correctAnswers.length === 0) {
            return { correct: false, points: 0 };
        }

        const playerAnswers = this.normalizeQcmAnswers(submission?.answer, options).sort((a, b) => a - b);
        const matchedAnswers = playerAnswers.filter((answerIndex) => correctAnswers.includes(answerIndex));
        const hasWrongSelection = playerAnswers.some((answerIndex) => !correctAnswers.includes(answerIndex));
        const isCorrect =
            !hasWrongSelection &&
            playerAnswers.length === correctAnswers.length &&
            matchedAnswers.length === correctAnswers.length;

        const basePoints = this.getQcmRoundBasePoints(q, submission);
        if (matchedAnswers.length === 0 || hasWrongSelection) {
            return { correct: isCorrect, points: 0 };
        }

        if (correctAnswers.length === 1) {
            return { correct: isCorrect, points: isCorrect ? basePoints : 0 };
        }

        const points = Math.max(0, Math.round((basePoints * matchedAnswers.length) / correctAnswers.length));
        return { correct: isCorrect, points };
    }

    private scoreEstimate(
                    guessRaw: unknown,
                    correctRaw: unknown,
                    estimateCfg: any
                ): { points: number; correct: boolean; guessValue: number | null; correctValue: number | null; distance: number | null } {
        const unit: 'year' | 'number' = estimateCfg?.unit === 'number' ? 'number' : 'year';

        const correctNum = Number((Array.isArray(correctRaw) ? correctRaw[0] : correctRaw) ?? NaN);
        const guessNum = Number(guessRaw ?? NaN);
        if (!Number.isFinite(correctNum) || !Number.isFinite(guessNum)) {
            return { points: 0, correct: false, guessValue: null, correctValue: null, distance: null };
        }

        const correctValue = unit === 'year' ? Math.round(correctNum) : correctNum;
        const guessValue = unit === 'year' ? Math.round(guessNum) : guessNum;
        const distance = Math.abs(guessValue - correctValue);

        const scoring = estimateCfg?.scoring ?? {};
        const maxPoints = Math.max(0, Math.floor(Number(scoring.maxPoints ?? 10)));
        const decay: 'linear' | 'exponential' = scoring.decay === 'exponential' ? 'exponential' : 'linear';
        const correctWithin = Math.max(0, Number(scoring.correctWithin ?? 0));

        let rawPoints = 0;
        if (maxPoints <= 0) {
            rawPoints = 0;
        } else if (decay === 'exponential') {
            const halfLife = Math.max(0.0001, Number(scoring.halfLife ?? 10));
            rawPoints = maxPoints * Math.exp((-Math.LN2 * distance) / halfLife);
        } else {
            const zeroAt = Math.max(0.0001, Number(scoring.zeroAt ?? 10));
            rawPoints = maxPoints * (1 - distance / zeroAt);
        }

        const points = Math.max(0, Math.round(rawPoints));
        const correct = distance <= correctWithin;
        return { points, correct, guessValue, correctValue, distance };
    }

    calculateScores() {
        const currentQ: any = QUESTIONS[this.state.questionIndex];
        if (!currentQ) return;

        for (const [pid, result] of Object.entries(this.state.lastRoundResults)) {
            const player = this.state.players[pid];
            if (!player) continue;
            const previousPoints = Number(result?.points ?? 0);
            if (!Number.isFinite(previousPoints) || previousPoints === 0) continue;
            player.score = Math.max(0, player.score - previousPoints);
        }

        if (this.isMediaQuestion(currentQ)) {
            // No scoring / summary for media interludes.
            this.state.lastRoundResults = {};
            this.state.lastRoundSummary = undefined;
            return;
        }

        if (this.isBurgerQuestion(currentQ)) {
            this.state.lastRoundResults = {};
            this.state.lastRoundSummary = undefined;
            return;
        }

        // Reset results for this round
        this.state.lastRoundResults = {};
        this.state.lastRoundSummary = undefined;

        Object.entries(this.state.currentAnswers).forEach(([pid, submission]) => {
            if (!this.state.players[pid]) return;

            const ans = submission?.answer;

            const type = String(currentQ.type || '');

            // QCM: accept numeric indices, letters, or legacy option labels.
            if (this.isQcmLikeQuestion(currentQ)) {
                const { correct, points } = this.scoreQcmLikeSubmission(currentQ, submission ?? {});
                this.state.players[pid].score += points;
                this.state.lastRoundResults[pid] = { correct, points };
                return;
            }

            // Sorting: strict order-insensitive equality against answers.
            if (type === 'sorting') {
                if (!Array.isArray(currentQ.answers)) return;

                const correctAnswers = currentQ.answers.map(String);
                const playerAns = Array.isArray(ans) ? ans.map(String) : [String(ans)];
                const isCorrect =
                    playerAns.length === correctAnswers.length &&
                    playerAns.every(a => correctAnswers.includes(a));

                const points = isCorrect ? 10 : 0;
                this.state.players[pid].score += points;
                this.state.lastRoundResults[pid] = { correct: isCorrect, points };
                return;
            }

            // Estimate: score based on closeness.
            if (type === 'estimate') {
                const scored = this.scoreEstimate(ans, currentQ.answers, currentQ.estimate);
                if (scored.guessValue === null || scored.correctValue === null) return;

                this.state.players[pid].score += scored.points;
                this.state.lastRoundResults[pid] = { correct: scored.correct, points: scored.points };
                return;
            }

            // Fast fingers: treat answer as tap count.
            if (type === 'fastFingers') {
                const steps: any[] = Array.isArray(currentQ?.fastFingers?.steps) ? currentQ.fastFingers.steps : [];
                const shuffle: boolean = currentQ?.fastFingers?.shuffle ?? true;

                const picksRaw =
                    Array.isArray(ans)
                        ? ans
                        : ans && typeof ans === 'object' && Array.isArray((ans as any).picks)
                            ? (ans as any).picks
                            : [];

                const picks: Array<'left' | 'right'> = picksRaw
                    .map((p: any) => (p === 'left' || p === 'right' ? p : null))
                    .filter(Boolean) as any;

                const count = Math.min(steps.length, picks.length);
                let correctCount = 0;
                for (let i = 0; i < count; i++) {
                    const goodIsLeft = !(shuffle && i % 2 === 1);
                    const isCorrect = picks[i] === (goodIsLeft ? 'left' : 'right');
                    if (isCorrect) correctCount++;
                }

                this.state.players[pid].score += correctCount;
                const perfect = steps.length > 0 && correctCount === steps.length;
                this.state.lastRoundResults[pid] = { correct: perfect, points: correctCount };
                return;
            }

            // VR whack: answer is the number of targets tapped during the timer.
            if (type === 'vrwhack') {
                const n = Number(ans ?? 0);
                const points = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
                this.state.players[pid].score += points;
                this.state.lastRoundResults[pid] = { correct: points > 0, points };
                return;
            }
        });

        // Build optional round summary for projector feedback (review-only broadcast)
        if (String(currentQ.type || '') === 'estimate') {
            const unit: 'year' | 'number' = currentQ?.estimate?.unit === 'number' ? 'number' : 'year';
            const byValue = new Map<number, { value: number; count: number; names: string[] }>();

            for (const [pid, submission] of Object.entries(this.state.currentAnswers)) {
                const p = this.state.players[pid];
                if (!p) continue;
                const n = Number(submission?.answer);
                if (!Number.isFinite(n)) continue;
                const v = unit === 'year' ? Math.round(n) : n;
                const existing = byValue.get(v);
                if (existing) {
                    existing.count += 1;
                    existing.names.push(p.name);
                } else {
                    byValue.set(v, { value: v, count: 1, names: [p.name] });
                }
            }

            const guesses = [...byValue.values()].sort((a, b) => a.value - b.value);
            this.state.lastRoundSummary = { estimate: { unit, guesses } };
        }
    }

    broadcastState() {
        const currentQ: any = QUESTIONS[this.state.questionIndex];
        const currentQcmAnswers = this.isQcmLikeQuestion(currentQ)
            ? this.getQcmCorrectAnswers(currentQ)
            : [];
        const burgerRevealPhase = this.getRevealPhase(currentQ);
        const shouldHideAnswers =
            (this.isBurgerQuestion(currentQ) &&
                (this.state.status === 'reading' || (this.state.status === 'reveal' && burgerRevealPhase !== 'answers'))) ||
            this.state.status === 'question' ||
            (this.isPerfectMatchQuestion(currentQ) && this.state.awaitingAdminAnswerSelection);

        // Create view for players (hide correct answers if active)
        const safeQ =
            currentQ
                ? {
                    ...currentQ,
                    ...(this.isQcmLikeQuestion(currentQ)
                        ? { multiple: currentQcmAnswers.length > 1 }
                        : {}),
                    answers: shouldHideAnswers
                        ? undefined
                        : this.isQcmLikeQuestion(currentQ)
                            ? currentQcmAnswers.length > 0
                                ? currentQcmAnswers
                                : undefined
                            : currentQ.answers
                }
                : currentQ;

        // Strip internal-only fields like connId, and add answered status.
        const playersSafe: Record<
            string,
            {
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
            }
        > = {};

        for (const [pid, p] of Object.entries(this.state.players)) {
            const submission = this.state.currentAnswers[pid];
            const res = this.state.lastRoundResults[pid];
            playersSafe[pid] = {
                id: p.id,
                name: p.name,
                score: p.score,
                enabled: p.enabled,
                connected: p.connected,
                lastSeen: p.lastSeen,
                answered: Boolean(submission),
                lastAnswerTimeLeft: submission?.timeLeft ?? null,
                lastAnswerSubmittedAt: submission?.submittedAt ?? null,
                lastCorrect: typeof res?.correct === 'boolean' ? res.correct : null,
                lastPoints: typeof res?.points === 'number' ? res.points : null
            };
        }

        let actualQuestionIndex = 0;
        for (let i = 0; i <= this.state.questionIndex; i++) {
            if (!this.isMediaQuestion(QUESTIONS[i])) {
                actualQuestionIndex++;
            }
        }

        const payload = {
            status: this.state.status,
            questionIndex: this.state.questionIndex,
            actualQuestionIndex: actualQuestionIndex,
            question: safeQ,
            totalActualQuestions: QUESTIONS.filter(q => !this.isMediaQuestion(q)).length,
            totalQuestions: QUESTIONS.length,
            timer: this.state.timer,
            serverNow: Date.now(),
            questionStartedAt: this.state.questionStartedAt,
            players: playersSafe,
            badgeOverlayTeamId: this.state.badgeOverlayTeamId,
            // Don't send all answers to everyone, maybe just count
            answerCount: Object.keys(this.state.currentAnswers).length,
            awaitingAdminAnswerSelection: this.state.awaitingAdminAnswerSelection,
            optionReveal: this.usesSeparateReveal(currentQ)
                ? {
                    placedOptionIndexes: [...this.state.optionReveal.placedOptionIndexes],
                    focusedOptionIndex: this.state.optionReveal.focusedOptionIndex,
                    totalOptions: this.getRevealOptionCount(currentQ),
                    revealPhase: this.getRevealPhase(currentQ)
                }
                : undefined,
            // Review-only summary used by projector to show clustered guesses
            roundSummary: this.state.status === 'review' ? this.state.lastRoundSummary : undefined
        };

        this.room.broadcast(JSON.stringify({ type: 'state', data: payload }));
    }
}
