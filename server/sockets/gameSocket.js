'use strict';

const { dispatch, getAbilityTarget } = require('../game/engine');
const Game = require('../models/Game');
const Session = require('../models/Session');

/**
 * Registers all game socket event handlers on `io`.
 *
 * @param {import('socket.io').Server} io
 * @param {object} gameActions
 */
module.exports = (io, gameActions) => {
    const {
        triggerMicroevent,
        enqueueGameAction,
        executeCpuTurnsIfNeeded,
        scheduleTimer,
        pendingMicroevents,
        sendTurnPush,
    } = gameActions;

    io.on('connection', (socket) => {

        // ── Join game room ────────────────────────────────────────────────────

        socket.on('game:join', async ({ gameId }) => {
            if (!gameId) return;
            socket.join(`game:${gameId}`);
            try {
                const game = await Game.findOne({ gameId }).lean();
                if (game) socket.emit('game:state', game.state);
            } catch (err) {
                console.error('game:join error:', err);
            }
        });

        // ── Game action ───────────────────────────────────────────────────────

        socket.on('game:action', async ({ gameId, type, payload = {} }) => {
            if (!gameId || !type) return;
            enqueueGameAction(gameId, async () => {
                try {
                    const game = await Game.findOne({ gameId });
                    if (!game) return socket.emit('game:error', { message: 'Game not found' });

                    // Microevent intercept
                    if (type === 'initiateAbility') {
                        const { casterCardIndex, abilityIndex } = payload;
                        const cp = game.state.players.find((p) => p.id === game.state.currentTurn);
                        const ability = cp?.inPlay[casterCardIndex]?.actions[abilityIndex];
                        if (ability?.microevent && game.state.phase === 'main') {
                            const targetType = getAbilityTarget(ability);
                            const isImmediate = ['self', 'allEnemies', 'allAllies'].includes(targetType);
                            if (isImmediate) {
                                await triggerMicroevent(gameId, game,
                                    { casterCardIndex, abilityIndex, targetCardIndex: null, targetPlayerId: null },
                                    ability, socket);
                                return;
                            }
                        }
                    }

                    if (type === 'resolveOnEnemyCard' || type === 'resolveOnAllyCard') {
                        const pa = game.state.pendingAction;
                        if (pa?.isAbility) {
                            const cp = game.state.players.find((p) => p.id === game.state.currentTurn);
                            const ability = cp?.inPlay[pa.casterCardIndex]?.actions[pa.abilityIndex];
                            if (ability?.microevent) {
                                const targetCardIndex = payload.targetCardIndex ?? null;
                                const targetPlayerId = payload.targetPlayerId ?? null;
                                await triggerMicroevent(gameId, game,
                                    { casterCardIndex: pa.casterCardIndex, abilityIndex: pa.abilityIndex, targetCardIndex, targetPlayerId },
                                    ability, socket);
                                return;
                            }
                        }
                    }

                    // Normal dispatch
                    const prevTurn = game.state.currentTurn;
                    const { state: nextState, error } = dispatch(game.state, type, payload);
                    if (error) return socket.emit('game:error', { message: error });

                    game.state = nextState;
                    game.markModified('state');
                    await game.save();

                    await Session.findOneAndUpdate(
                        { gameId },
                        { currentTurn: nextState.currentTurn, turnStartedAt: nextState.turnStartedAt ? new Date(nextState.turnStartedAt) : null }
                    ).catch(() => { });

                    io.to(`game:${gameId}`).emit('game:state', nextState);
                    scheduleTimer(gameId, nextState);

                    if (!nextState.gameOver && nextState.currentTurn !== prevTurn) {
                        const nextPlayer = nextState.players.find((p) => p.id === nextState.currentTurn);
                        if (nextPlayer && !nextPlayer.isBot) {
                            sendTurnPush(gameId, nextState.currentTurn).catch(() => { });
                        }
                    }

                    await executeCpuTurnsIfNeeded(gameId);
                } catch (err) {
                    console.error('game:action error:', err);
                    socket.emit('game:error', { message: 'Failed to process action' });
                }
            });
        });

        // ── Microevent relay ──────────────────────────────────────────────────

        socket.on('game:microevent:input', ({ gameId, ...inputPayload }) => {
            if (!gameId) return;
            socket.to(`game:${gameId}`).emit('game:microevent:input', inputPayload);
        });

        socket.on('game:microevent:result', async ({ gameId, success, score }) => {
            if (!gameId) return;
            const pending = pendingMicroevents.get(gameId);
            if (!pending) return;
            clearTimeout(pending.timeoutHandle);
            pendingMicroevents.delete(gameId);

            enqueueGameAction(gameId, async () => {
                try {
                    const game = await Game.findOne({ gameId });
                    if (!game || game.state.phase !== 'microevent') return;

                    const prevTurn = game.state.currentTurn;
                    const { state: nextState, error } = dispatch(game.state, 'applyAbilityWithMicroevent', {
                        microeventResult: { success: !!success, score: Math.max(0, Math.min(1, score ?? 0)) },
                    });
                    if (error) return socket.emit('game:error', { message: error });

                    game.state = nextState;
                    game.markModified('state');
                    await game.save();

                    await Session.findOneAndUpdate(
                        { gameId },
                        { currentTurn: nextState.currentTurn, turnStartedAt: nextState.turnStartedAt ? new Date(nextState.turnStartedAt) : null }
                    ).catch(() => { });

                    io.to(`game:${gameId}`).emit('game:state', nextState);
                    scheduleTimer(gameId, nextState);

                    if (!nextState.gameOver && nextState.currentTurn !== prevTurn) {
                        const nextPlayer = nextState.players.find((p) => p.id === nextState.currentTurn);
                        if (nextPlayer && !nextPlayer.isBot) {
                            sendTurnPush(gameId, nextState.currentTurn).catch(() => { });
                        }
                    }

                    await executeCpuTurnsIfNeeded(gameId);
                } catch (err) {
                    console.error('game:microevent:result error:', err);
                }
            });
        });
    });
};
