import { useEffect, useRef, useState } from 'react';

const QUIZ_DURATION_S = 20;

/**
 * Quiz (OpenTDB trivia) — answer correctly for full effect.
 * Binary: correct = success, wrong or timeout = failure.
 * Spectators see which choice the active player selected.
 */
const QuizEvent = ({ context, isSpectator, liveInputs, onComplete, onInput }) => {
    const { question, choices, correctIndex } = context;
    const [timeLeft, setTimeLeft] = useState(QUIZ_DURATION_S);
    const [selected, setSelected] = useState(null); // index
    const [done, setDone] = useState(false);
    const [spectatorPick, setSpectatorPick] = useState(null);
    const prevSpectatorRef = useRef(0);

    // Spectator: mirror selection
    useEffect(() => {
        if (!isSpectator) return;
        const picks = liveInputs.filter((i) => i.inputType === 'quizSelect');
        if (picks.length > prevSpectatorRef.current) {
            prevSpectatorRef.current = picks.length;
            setSpectatorPick(picks[picks.length - 1].choiceIndex);
        }
    }, [liveInputs, isSpectator]);

    // Countdown timer
    useEffect(() => {
        if (done || isSpectator) return;
        if (timeLeft <= 0) {
            setDone(true);
            onComplete({ success: false, score: 0 });
            return;
        }
        const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
        return () => clearTimeout(t);
    }, [timeLeft, done, isSpectator]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSelect = (idx) => {
        if (done || isSpectator) return;
        setSelected(idx);
        setDone(true);
        const correct = idx === correctIndex;
        onInput({ inputType: 'quizSelect', choiceIndex: idx });
        onComplete({ success: correct, score: correct ? 1 : 0 });
    };

    const choiceClass = (idx) => {
        if (isSpectator) return spectatorPick === idx ? 'me-quiz-choice spectator-selected' : 'me-quiz-choice';
        if (!done || selected === null) return 'me-quiz-choice';
        if (idx === correctIndex) return 'me-quiz-choice selected-correct';
        if (idx === selected) return 'me-quiz-choice selected-wrong';
        return 'me-quiz-choice';
    };

    if (!question || !choices) {
        return (
            <div className="me-quiz-container">
                <div className="me-quiz-fallback">
                    Trivia unavailable — ability fires at reduced power.
                </div>
            </div>
        );
    }

    return (
        <div className="me-quiz-container">
            <div className={`me-quiz-timer${timeLeft <= 5 ? ' urgent' : ''}`}>
                {isSpectator ? '⏱' : `${timeLeft}s`}
            </div>
            <div
                className="me-quiz-question"
                dangerouslySetInnerHTML={{ __html: question }}
            />
            <div className="me-quiz-choices">
                {choices.map((choice, idx) => (
                    <button
                        key={idx}
                        className={choiceClass(idx)}
                        disabled={done || isSpectator}
                        onClick={() => handleSelect(idx)}
                    >
                        {choice}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default QuizEvent;
