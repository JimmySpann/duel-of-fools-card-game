'use strict';

/**
 * Game action helpers that depend on `io` (Socket.IO server).
 * Call this factory once after `io` is created.
 *
 * @param {import('socket.io').Server} io
 * @returns {{ triggerMicroevent, enqueueGameAction, executeCpuTurnsIfNeeded, scheduleTimer,
 *             isUserActiveInGame, sendPushToUser, sendTurnPush }}
 */
module.exports = (io) => {
    const https = require('https');
    const webpush = require('web-push');
    const { dispatch, computeCpuTurn, getAbilityTarget } = require('./game/engine');
    const Game = require('./models/Game');
    const Session = require('./models/Session');
    const User = require('./models/User');

    const VAPID_PUSH_ENABLED = !!(
        process.env.VAPID_PUBLIC_KEY &&
        process.env.VAPID_PRIVATE_KEY &&
        process.env.VAPID_SUBJECT
    );

    // ── OpenTDB helper ────────────────────────────────────────────────────────

    const fetchTrivia = (params = {}) => new Promise((resolve, reject) => {
        const qs = new URLSearchParams({
            amount: String(params.amount ?? 1),
            encode: 'url3986',
            ...(params.difficulty && { difficulty: params.difficulty }),
            ...(params.category && { category: String(params.category) }),
            ...(params.questionType && { type: params.questionType }),
        }).toString();
        https.get(`https://opentdb.com/api.php?${qs}`, (res) => {
            let raw = '';
            res.on('data', (c) => { raw += c; });
            res.on('end', () => {
                try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });

    // ── Math problem generator ────────────────────────────────────────────────

    const generateMathProblem = (difficulty) => {
        let question, answer;
        const r = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

        if (difficulty <= 1) {
            const a = r(1, 20), b = r(1, 20);
            if (Math.random() < 0.5) { question = `${a} + ${b} = ?`; answer = a + b; }
            else { const big = Math.max(a, b), small = Math.min(a, b); question = `${big} - ${small} = ?`; answer = big - small; }
        } else if (difficulty === 2) {
            const a = r(2, 12), b = r(2, 12);
            if (Math.random() < 0.5) { question = `${a} × ${b} = ?`; answer = a * b; }
            else { const prod = a * b; question = `${prod} ÷ ${a} = ?`; answer = b; }
        } else if (difficulty === 3) {
            const a = r(5, 30), b = r(2, 15), c = r(1, 10);
            const ops = [
                () => { question = `${a} + ${b} - ${c} = ?`; answer = a + b - c; },
                () => { question = `${a} - ${b} + ${c} = ?`; answer = a - b + c; },
                () => { question = `${a} × ${b} + ${c} = ?`; answer = a * b + c; },
            ];
            ops[r(0, ops.length - 1)]();
        } else {
            const pcts = [10, 20, 25, 50];
            const pct = pcts[r(0, pcts.length - 1)];
            const base = r(2, 20) * (100 / pct);
            question = `${pct}% of ${base} = ?`;
            answer = Math.round((pct / 100) * base);
        }

        const spread = Math.max(3, Math.abs(answer) * 0.3);
        const wrongs = new Set();
        while (wrongs.size < 3) {
            const candidate = answer + (Math.random() < 0.5 ? 1 : -1) * Math.floor(Math.random() * spread + 1);
            if (candidate !== answer) wrongs.add(candidate);
        }
        const choices = [String(answer), ...[...wrongs].map(String)];
        for (let i = choices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [choices[i], choices[j]] = [choices[j], choices[i]];
        }
        return { question, choices, correctIndex: choices.indexOf(String(answer)) };
    };

    // ── Pending microevents ───────────────────────────────────────────────────

    const pendingMicroevents = new Map(); // gameId → { timeoutHandle }

    const MICROEVENT_TIMEOUT_MS = {
        qte: 4000,
        pattern: 22000,
        quiz: 28000,
        rhythm: 26000,
        mash: 6000,
        parry: 12000,
        route: 16000,
        sigil: 14000,
        arrow: 14000,
    };

    const TRACK_BPMS = [120, 80, 135, 95, 128];

    // ── Per-game action queue ─────────────────────────────────────────────────

    const gameQueues = new Map(); // gameId → Promise

    const enqueueGameAction = (gameId, fn) => {
        const prev = gameQueues.get(gameId) ?? Promise.resolve();
        const next = prev.then(fn).catch(() => { });
        gameQueues.set(gameId, next);
        return next;
    };

    // ── Push helpers ──────────────────────────────────────────────────────────

    const isUserActiveInGame = (gameId, username) => {
        const room = io.sockets.adapter.rooms.get(`game:${gameId}`);
        if (!room) return false;
        for (const socketId of room) {
            const s = io.sockets.sockets.get(socketId);
            if (s?.user?.username === username) return true;
        }
        return false;
    };

    const sendPushToUser = async (username, payload) => {
        if (!VAPID_PUSH_ENABLED) return;
        const user = await User.findOne({ username }).select('pushSubscriptions').lean();
        if (!user?.pushSubscriptions?.length) return;
        const message = JSON.stringify(payload);
        const stale = [];
        await Promise.all(user.pushSubscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification(sub, message);
            } catch (err) {
                if (err.statusCode === 410 || err.statusCode === 404) stale.push(sub.endpoint);
                else console.warn('[Push] send error:', err.statusCode, String(err.body ?? '').slice(0, 80));
            }
        }));
        if (stale.length) {
            await User.updateOne(
                { username },
                { $pull: { pushSubscriptions: { endpoint: { $in: stale } } } }
            ).catch(() => { });
        }
    };

    const sendTurnPush = async (gameId, turnPlayerId) => {
        try {
            const session = await Session.findOne({ gameId }).lean();
            if (!session) return;
            const slot = session.players.find((p) => p.slot === turnPlayerId);
            if (!slot) return;
            const { username } = slot;
            if (isUserActiveInGame(gameId, username)) return;
            await sendPushToUser(username, {
                title: '⚔️ Your Turn!',
                body: `It's your move in ${session.name}`,
                tag: `turn-${gameId}`,
                url: `/?session=${session._id}&game=${gameId}`,
            });
        } catch (err) {
            console.error('[Push] sendTurnPush error:', err);
        }
    };

    const sendWarnPush = async (gameId, turnPlayerId) => {
        try {
            const session = await Session.findOne({ gameId }).lean();
            if (!session) return;
            const slot = session.players.find((p) => p.slot === turnPlayerId);
            if (!slot) return;
            const { username } = slot;
            if (isUserActiveInGame(gameId, username)) return;
            await sendPushToUser(username, {
                title: '⏱ Time Running Out!',
                body: `~5 minutes left in ${session.name}`,
                tag: `timer-warn-${gameId}`,
                url: `/?session=${session._id}&game=${gameId}`,
            });
        } catch (err) {
            console.error('[Push] sendWarnPush error:', err);
        }
    };

    // ── Turn timer ────────────────────────────────────────────────────────────

    const gameTimers = new Map();
    const warnTimers = new Map();

    const scheduleTimer = (gameId, state) => {
        if (gameTimers.has(gameId)) { clearTimeout(gameTimers.get(gameId)); gameTimers.delete(gameId); }
        if (warnTimers.has(gameId)) { clearTimeout(warnTimers.get(gameId)); warnTimers.delete(gameId); }

        if (state.gameOver) return;
        const limitSec = state.settings?.turnTimeLimit;
        if (!limitSec) return;

        const player = state.players.find((p) => p.id === state.currentTurn);
        if (!player || player.isBot) return;

        const elapsed = Date.now() - (state.turnStartedAt ?? Date.now());
        const remaining = Math.max(0, limitSec * 1000 - elapsed);

        const WARN_MS = 5 * 60 * 1000;
        if (remaining > WARN_MS + 60_000) {
            const warnDelay = remaining - WARN_MS;
            const warnTimerId = setTimeout(() => {
                warnTimers.delete(gameId);
                sendWarnPush(gameId, state.currentTurn).catch(() => { });
            }, warnDelay);
            warnTimers.set(gameId, warnTimerId);
        }

        const timerId = setTimeout(() => {
            gameTimers.delete(gameId);
            enqueueGameAction(gameId, async () => {
                try {
                    const game = await Game.findOne({ gameId });
                    if (!game || game.state.gameOver) return;
                    if (game.state.currentTurn !== state.currentTurn) return;

                    const { state: nextState } = dispatch(game.state, 'forfeitCurrentPlayer', {});
                    game.state = nextState;
                    game.markModified('state');
                    await game.save();

                    await Session.findOneAndUpdate(
                        { gameId },
                        { currentTurn: nextState.currentTurn, turnStartedAt: nextState.turnStartedAt ? new Date(nextState.turnStartedAt) : null, ...(nextState.gameOver ? { status: 'finished' } : {}) }
                    ).catch(() => { });

                    io.to(`game:${gameId}`).emit('game:state', nextState);
                    scheduleTimer(gameId, nextState);
                    if (!nextState.gameOver) await executeCpuTurnsIfNeeded(gameId);
                } catch (err) {
                    console.error('turn timeout error:', err);
                }
            });
        }, remaining);

        gameTimers.set(gameId, timerId);
    };

    // ── CPU auto-play ─────────────────────────────────────────────────────────

    const executeCpuTurnsIfNeeded = async (gameId) => {
        let game = await Game.findOne({ gameId });
        if (!game) return;

        while (!game.state.gameOver) {
            const player = game.state.players.find((p) => p.id === game.state.currentTurn);
            if (!player?.isBot) break;

            await new Promise((r) => setTimeout(r, 1500));

            const cpuState = computeCpuTurn(game.state);

            game = await Game.findOne({ gameId });
            if (!game) return;
            game.state = cpuState;
            game.markModified('state');
            await game.save();

            await Session.findOneAndUpdate(
                { gameId },
                { currentTurn: cpuState.currentTurn, turnStartedAt: cpuState.turnStartedAt ? new Date(cpuState.turnStartedAt) : null }
            ).catch(() => { });
            io.to(`game:${gameId}`).emit('game:state', cpuState);

            scheduleTimer(gameId, cpuState);
            if (cpuState.gameOver) break;
        }

        if (!game.state.gameOver) {
            const humanPlayer = game.state.players.find(
                (p) => p.id === game.state.currentTurn && !p.isBot
            );
            if (humanPlayer) {
                sendTurnPush(gameId, game.state.currentTurn).catch(() => { });
            }
        }
    };

    // ── Microevent trigger ────────────────────────────────────────────────────

    const triggerMicroevent = async (gameId, game, context, ability, socket) => {
        const { casterCardIndex, abilityIndex, targetCardIndex, targetPlayerId } = context;
        const me = ability.microevent;

        const { state: heldState, error: holdErr } = dispatch(game.state, 'holdMicroevent', {
            casterCardIndex, abilityIndex,
            targetCardIndex: targetCardIndex ?? null,
            targetPlayerId: targetPlayerId ?? null,
        });
        if (holdErr) { socket.emit('game:error', { message: holdErr }); return; }

        game.state = heldState;
        game.markModified('state');
        await game.save();

        const casterPlayer = heldState.players.find((p) => p.id === heldState.currentTurn);
        const casterCard = casterPlayer?.inPlay[casterCardIndex];

        const timesUsed = (ability.limit ?? 0) - (ability.usesRemaining ?? 0);
        const globalDiff = heldState.settings?.microgameDifficulty ?? 1;
        const effectiveDifficulty = Math.min(4, (globalDiff - 1) + Math.floor(timesUsed / 2));

        const startPayload = {
            type: me.type, outcome: me.outcome,
            abilityName: ability.name,
            casterName: casterCard?.name ?? '?',
            casterPlayerId: heldState.currentTurn,
            casterCardIndex, abilityIndex, targetCardIndex, targetPlayerId,
            difficulty: effectiveDifficulty,
        };

        if (me.type === 'quiz') {
            if (me.mathProblem) {
                const { question, choices, correctIndex } = generateMathProblem(effectiveDifficulty);
                startPayload.question = question;
                startPayload.choices = choices;
                startPayload.correctIndex = correctIndex;
            } else {
                try {
                    const data = await fetchTrivia({
                        difficulty: me.difficulty,
                        category: me.category,
                        questionType: me.questionType,
                    });
                    if (data.response_code === 0 && data.results?.[0]) {
                        const q = data.results[0];
                        const decode = (s) => decodeURIComponent(s);
                        const correct = decode(q.correct_answer);
                        const choices = [correct, ...(q.incorrect_answers || []).map(decode)];
                        for (let i = choices.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [choices[i], choices[j]] = [choices[j], choices[i]];
                        }
                        startPayload.question = decode(q.question);
                        startPayload.choices = choices;
                        startPayload.correctIndex = choices.indexOf(correct);
                    }
                } catch (err) {
                    console.error('[Microevent] OpenTDB fetch failed:', err.message);
                }
            }
        }

        if (me.type === 'rhythm') {
            const currentTrackIndex = heldState._currentTrackIndex ?? 0;
            const baseBpm = TRACK_BPMS[currentTrackIndex] ?? 120;
            const baseBeats = me.beats ?? 4;
            const scaledBeats = baseBeats + [0, 0, 1, 1, 2][effectiveDifficulty];
            const beatIntervalMs = (60 / baseBpm) * 1000;
            const leadIn = 3000;
            startPayload.bpm = baseBpm;
            startPayload.beats = scaledBeats;
            startPayload.beatStartTime = Date.now() + leadIn;
            startPayload.timeoutMs = leadIn + scaledBeats * beatIntervalMs + 1500;
        }

        if (me.type === 'parry') {
            const strikes = me.strikes ?? (5 + Math.min(2, effectiveDifficulty));
            const leadIn = 1300;
            const now = Date.now();
            const minGap = [900, 800, 740, 680, 620][effectiveDifficulty];
            const maxGap = [1300, 1180, 1060, 980, 900][effectiveDifficulty];
            let t = now + leadIn;
            const strikeTimes = [];
            for (let i = 0; i < strikes; i++) {
                t += Math.floor(minGap + Math.random() * (maxGap - minGap));
                strikeTimes.push(t);
            }
            startPayload.strikeTimes = strikeTimes;
            startPayload.timeoutMs = (strikeTimes[strikeTimes.length - 1] - now) + 1600;
        }

        if (me.type === 'route') {
            const len = me.routeLen ?? (effectiveDifficulty <= 1 ? 4 : effectiveDifficulty <= 3 ? 5 : 6);
            const route = [];
            const neighbors = (idx) => {
                const x = idx % 3;
                const y = Math.floor(idx / 3);
                const out = [];
                if (x > 0) out.push(idx - 1);
                if (x < 2) out.push(idx + 1);
                if (y > 0) out.push(idx - 3);
                if (y < 2) out.push(idx + 3);
                return out;
            };
            route.push(Math.floor(Math.random() * 9));
            while (route.length < len) {
                const last = route[route.length - 1];
                const options = neighbors(last).filter((n) => n !== route[route.length - 2]);
                route.push(options[Math.floor(Math.random() * options.length)]);
            }
            startPayload.route = route;
            startPayload.timeoutMs = 16000;
        }

        if (me.type === 'sigil') {
            const len = me.seqLen ?? (effectiveDifficulty <= 1 ? 4 : effectiveDifficulty <= 3 ? 5 : 6);
            startPayload.sequence = Array.from({ length: len }, () => Math.floor(Math.random() * 4));
            startPayload.timeoutMs = 14000;
        }

        if (me.type === 'pattern') {
            const seqLen = effectiveDifficulty <= 1 ? 3 : effectiveDifficulty <= 3 ? 4 : 5;
            startPayload.seed = Array.from({ length: seqLen }, () => Math.floor(Math.random() * 4));
            startPayload.seqLen = seqLen;
        }

        if (me.type === 'arrow') {
            startPayload.shots = Math.max(1, Number(me.shots ?? 3));
            startPayload.targetRadius = [0.125, 0.112, 0.098, 0.086, 0.074][effectiveDifficulty];
            startPayload.crosshairRadius = [0.14, 0.124, 0.108, 0.094, 0.082][effectiveDifficulty];
            startPayload.speed = [0.16, 0.205, 0.255, 0.315, 0.39][effectiveDifficulty];
            startPayload.centerBias = [0.62, 0.52, 0.42, 0.32, 0.24][effectiveDifficulty];
            startPayload.retargetMinMs = [520, 470, 420, 360, 320][effectiveDifficulty];
            startPayload.retargetMaxMs = [980, 900, 790, 700, 620][effectiveDifficulty];
            startPayload.timeoutMs = 14000;
        }

        const timeoutMs = startPayload.timeoutMs ?? MICROEVENT_TIMEOUT_MS[me.type] ?? 10000;
        const timeoutHandle = setTimeout(() => {
            pendingMicroevents.delete(gameId);
            enqueueGameAction(gameId, async () => {
                try {
                    const g = await Game.findOne({ gameId });
                    if (!g || g.state.phase !== 'microevent') return;
                    const { state: ns } = dispatch(g.state, 'applyAbilityWithMicroevent', {
                        microeventResult: { success: false, score: 0 },
                    });
                    g.state = ns; g.markModified('state'); await g.save();
                    io.to(`game:${gameId}`).emit('game:microevent:timeout', {});
                    io.to(`game:${gameId}`).emit('game:state', ns);
                    scheduleTimer(gameId, ns);
                    await executeCpuTurnsIfNeeded(gameId);
                } catch (err) { console.error('[Microevent] timeout error:', err); }
            });
        }, timeoutMs);

        pendingMicroevents.set(gameId, { timeoutHandle });

        await Session.findOneAndUpdate(
            { gameId },
            { currentTurn: heldState.currentTurn }
        ).catch(() => { });
        io.to(`game:${gameId}`).emit('game:state', heldState);
        io.to(`game:${gameId}`).emit('game:microevent:start', startPayload);
    };

    return {
        triggerMicroevent,
        enqueueGameAction,
        executeCpuTurnsIfNeeded,
        scheduleTimer,
        pendingMicroevents,
        isUserActiveInGame,
        sendPushToUser,
        sendTurnPush,
    };
};
