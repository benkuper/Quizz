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

type GameStatus = 'lobby' | 'reading' | 'question' | 'review' | 'leaderboard' | 'finished';

type GameState = {
    status: GameStatus;
    questionIndex: number;
    timer: number;
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
                this.launchQuestion();
                return;
            }

            // If currently answering, end the round. If in review, advance.
            if (this.state.status === 'question') {
                const q = QUESTIONS[this.state.questionIndex];
                if (this.isMediaQuestion(q)) {
                    this.nextQuestion();
                } else {
                    this.endRound();
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

        if (event.type === 'admin_remove_offline') {
            this.broadcastState();
        }

        if (event.type === 'admin_remove_all') {
            this.resetAssignments();
        }

        if (event.type === 'submit_answer') {
            if (this.state.status === 'question') {
                const currentQ = QUESTIONS[this.state.questionIndex];
                if (this.isMediaQuestion(currentQ)) return;
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
                const q = QUESTIONS[this.state.questionIndex];
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

        if (event.type === 'media_finished') {
            if (this.state.status !== 'question') return;
            const currentQ = QUESTIONS[this.state.questionIndex];
            if (!this.isMediaQuestion(currentQ)) return;

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
        this.state.currentAnswers = {};
        this.state.lastRoundResults = {};
        this.state.lastRoundSummary = undefined;

        this.broadcastState();
    }

    private jumpToQuestion(index: number) {
        const clamped = Math.max(0, Math.min(QUESTIONS.length - 1, Math.floor(index)));
        this.state.questionIndex = clamped;
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
        } else {
            this.state.status = 'finished';
        }
        this.broadcastState();
    }

    launchQuestion() {
        this.state.status = 'question';
        const currentQ: any = QUESTIONS[this.state.questionIndex];

        if (this.isMediaQuestion(currentQ)) {
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
        this.state.status = 'review';
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
        const currentQ = QUESTIONS[this.state.questionIndex];
        if (!currentQ) return;

        if (this.isMediaQuestion(currentQ)) {
            // No scoring / summary for media interludes.
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
            if (type === 'qcm') {
                if (!Array.isArray(currentQ.answers)) return;

                const options = Array.isArray(currentQ.options) ? currentQ.options.map(String) : [];
                const correctAnswers = this.normalizeQcmAnswers(currentQ.answers, options).sort((a, b) => a - b);
                const playerAns = this.normalizeQcmAnswers(ans, options).sort((a, b) => a - b);
                const isCorrect =
                    playerAns.length === correctAnswers.length &&
                    playerAns.every((answerIndex, index) => answerIndex === correctAnswers[index]);

                const points = isCorrect ? 10 : 0;
                this.state.players[pid].score += points;
                this.state.lastRoundResults[pid] = { correct: isCorrect, points };
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
        const currentQ = QUESTIONS[this.state.questionIndex];

        // Create view for players (hide correct answers if active)
        const safeQ =
            this.state.status === 'question' && currentQ
                ? {
                    ...currentQ,
                    multiple: Array.isArray(currentQ.answers) && currentQ.answers.length > 1,
                    answers: undefined // Hide answers during question phase
                }
                : currentQ;

        // Strip internal-only fields like connId, and add answered status.
        const playersSafe: Record<
            string,
            {
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
            players: playersSafe,
            // Don't send all answers to everyone, maybe just count
            answerCount: Object.keys(this.state.currentAnswers).length,
            // Review-only summary used by projector to show clustered guesses
            roundSummary: this.state.status === 'review' ? this.state.lastRoundSummary : undefined
        };

        this.room.broadcast(JSON.stringify({ type: 'state', data: payload }));
    }
}
