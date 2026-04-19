import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { AI_MODEL_PRESETS, generateCardConcept, generateCardDraft } from './ai/cardAIGenerator';
import { FEATURES } from '../../config/features';
import { authHeader } from '../../utils/api';

const clampInt = (value, min, max) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.round(n)));
};

const initialStats = {
    attack: 6,
    defense: 6,
    evasion: 6,
    agility: 6,
    health: 8,
};

const initialElements = {
    fire: 0,
    ice: 0,
    electric: 0,
    earth: 0,
    death: 0,
    water: 0,
    air: 0,
    normal: 0,
};

const TARGET_TYPES = ['self', 'enemyCard', 'allyCard', 'allEnemies', 'allAllies'];
const EFFECT_TYPES = ['damage', 'status', 'heal', 'healSelf', 'cleanse', 'resetCooldowns', 'selfDestruct'];
const STATUS_TYPES = ['burned', 'frozen', 'def_up', 'def_down', 'poisoned', 'bleeding', 'shielded', 'invulnerable', 'invisible', 'focused', 'damage_reduction', 'eva_up'];
const CLEANSE_DEBUFFS = ['burned', 'frozen', 'poisoned', 'bleeding', 'def_down'];
const MAX_CUSTOM_ABILITY_POWER = 26;
const MAX_TOTAL_CUSTOM_ABILITY_POWER = 54;
const MICROGAME_TYPES = ['qte', 'mash', 'pattern', 'rhythm', 'quiz', 'parry', 'route', 'sigil', 'arrow'];
const MICROGAME_DIFFICULTY = {
    qte: 'easy',
    pattern: 'easy',
    route: 'easy',
    mash: 'easy',
    quiz: 'medium',
    parry: 'medium',
    sigil: 'medium',
    arrow: 'medium',
    rhythm: 'hard',
};
const MICROGAME_POWER_REDUCTION = { easy: 1.2, medium: 2, hard: 3.1 };

const createDamageEffect = () => ({ type: 'damage', multiplier: 1 });
const createEmptyCustomAbility = () => ({
    name: '',
    targetType: 'enemyCard',
    limit: 2,
    effects: [createDamageEffect()],
    microevent: null,
});

const computePoints = (stats) =>
    Number(stats.attack) + Number(stats.defense) + Number(stats.evasion) + Number(stats.agility) + Math.round(Number(stats.health) * 1.4);

const validateCustomAbilityLocal = (ability, idx) => {
    const label = `Custom ability #${idx + 1}`;
    if (!String(ability?.name || '').trim()) return `${label}: name is required`;
    const effects = Array.isArray(ability?.effects) ? ability.effects : [];
    if (effects.length < 1 || effects.length > 3) return `${label}: choose 1-3 effects`;
    for (let i = 0; i < effects.length; i += 1) {
        const e = effects[i] || {};
        if (e.type === 'cleanse' && (!Array.isArray(e.debuffs) || e.debuffs.length < 1)) {
            return `${label}, effect #${i + 1}: pick at least one debuff`;
        }
    }
    if (ability?.microevent) {
        const mt = String(ability.microevent.type || '');
        const mo = String(ability.microevent.outcome || '');
        if (!MICROGAME_TYPES.includes(mt)) return `${label}: invalid microgame type`;
        if (!['binary', 'scaled'].includes(mo)) return `${label}: invalid microgame outcome`;
    }
    return null;
};

const TARGET_POWER_MULT = {
    self: 0.9,
    enemyCard: 1,
    allyCard: 1,
    allEnemies: 1.75,
    allAllies: 1.5,
};

const clampNum = (value, min, max, fallback = min) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
};

const getMicrogamePowerReduction = (microevent) => {
    const type = String(microevent?.type || '');
    if (!type) return 0;
    const tier = MICROGAME_DIFFICULTY[type] || 'medium';
    return MICROGAME_POWER_REDUCTION[tier] || 0;
};

const estimateCustomAbilityPower = (ability) => {
    const targetType = String(ability?.targetType || 'enemyCard');
    const effects = Array.isArray(ability?.effects) ? ability.effects : [];
    const limit = clampNum(ability?.limit, 1, 10, 1);
    let score = 0;

    for (const raw of effects) {
        const e = raw || {};
        if (e.type === 'damage') {
            score += (clampNum(e.multiplier, 0.5, 3, 1) * 4);
            score += Math.max(0, clampNum(e.flatBonus, -5, 8, 0)) * 0.8;
            score += clampNum(e.defPiercing, 0, 8, 0) * 0.7;
            score += (clampNum(e.repeat, 1, 5, 1) - 1) * 2;
            if (e.ignoreDef) score += 2;
            if (e.ignoreEvasion) score += 2;
            if (e.lifesteal) score += 2.5;
            if (e.randomTarget) score += 0.8;
            if (e.useBasicAttack) score -= 0.6;
        }
        if (e.type === 'status') {
            const status = String(e.status || '');
            const value = clampNum(e.value, 1, 8, 1);
            const duration = clampNum(e.duration, 1, 6, 1);
            score += value * duration * 0.85;
            if (status === 'invulnerable' || status === 'invisible') score += 2;
            if (status === 'shielded' || status === 'damage_reduction') score += 1.4;
        }
        if (e.type === 'heal' || e.type === 'healSelf') {
            score += clampNum(e.amount, 1, 12, 1) * 0.8;
        }
        if (e.type === 'cleanse') {
            score += Math.max(1, (Array.isArray(e.debuffs) ? e.debuffs.length : 0)) * 1.2;
        }
        if (e.type === 'resetCooldowns') score += 7;
        if (e.type === 'selfDestruct') score -= 2.2;
    }

    score *= TARGET_POWER_MULT[targetType] ?? 1;
    score *= (0.85 + Math.min(1.2, limit / 4.5));
    score -= getMicrogamePowerReduction(ability?.microevent);

    return Math.max(0, Number(score.toFixed(2)));
};

const powerFill = (value, max) => `${Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))}%`;

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const shuffle = (arr) => {
    const next = [...arr];
    for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
};

const randomStatsForBudget = (maxPoints) => {
    let best = { ...initialStats };
    let bestScore = computePoints(best);

    for (let attempt = 0; attempt < 450; attempt += 1) {
        const candidate = {
            attack: randomInt(0, 20),
            defense: randomInt(0, 20),
            evasion: randomInt(0, 20),
            agility: randomInt(0, 20),
            health: randomInt(1, 30),
        };

        let guard = 200;
        while (computePoints(candidate) > maxPoints && guard > 0) {
            const keys = shuffle(Object.keys(candidate));
            for (const key of keys) {
                const min = key === 'health' ? 1 : 0;
                if (candidate[key] > min) {
                    candidate[key] -= 1;
                    break;
                }
            }
            guard -= 1;
        }

        const score = computePoints(candidate);
        if (score <= maxPoints && score >= bestScore) {
            best = candidate;
            bestScore = score;
        }
        if (bestScore === maxPoints) break;
    }

    return best;
};

const fitStatsToBudget = (stats, maxPoints) => {
    const next = {
        attack: clampInt(stats?.attack, 0, 20),
        defense: clampInt(stats?.defense, 0, 20),
        evasion: clampInt(stats?.evasion, 0, 20),
        agility: clampInt(stats?.agility, 0, 20),
        health: clampInt(stats?.health, 1, 30),
    };

    let guard = 500;
    while (computePoints(next) > maxPoints && guard > 0) {
        const keys = shuffle(Object.keys(next));
        for (const key of keys) {
            const min = key === 'health' ? 1 : 0;
            if (next[key] > min) {
                next[key] -= 1;
                break;
            }
        }
        guard -= 1;
    }

    return next;
};

const normalizeElements = (raw) => {
    const out = { ...initialElements };
    Object.keys(out).forEach((k) => {
        out[k] = clampInt(raw?.[k], 0, 5);
    });
    return out;
};

const normalizeAbilityNames = (suggested, officialAbilityNames) => {
    const official = Array.isArray(officialAbilityNames) ? officialAbilityNames : [];
    const officialLower = official.map((x) => String(x).toLowerCase());

    const requested = (Array.isArray(suggested) ? suggested : [])
        .map((x) => String(x || '').trim())
        .filter(Boolean);

    const matched = [];
    for (const req of requested) {
        const idxExact = officialLower.findIndex((name) => name === req.toLowerCase());
        const idxContains = idxExact >= 0 ? idxExact : officialLower.findIndex((name) => name.includes(req.toLowerCase()) || req.toLowerCase().includes(name));
        const finalIdx = idxContains;
        if (finalIdx >= 0) {
            const name = official[finalIdx];
            if (!matched.includes(name)) matched.push(name);
        }
        if (matched.length >= 3) break;
    }

    if (matched.length > 0) return matched.slice(0, 3);
    return official.slice(0, 1);
};

const NAME_PREFIXES = ['Storm', 'Iron', 'Arc', 'Frost', 'Shadow', 'Sun', 'Moon', 'Rune', 'Blaze', 'Echo'];
const NAME_CORES = ['Warden', 'Ranger', 'Sage', 'Drifter', 'Knight', 'Harrier', 'Seer', 'Vanguard', 'Strider', 'Sentinel'];
const DESCRIPTION_TEMPLATES = [
    'A wild build forged for a fast opening.',
    'Generated to hit the stat cap with balanced pressure.',
    'An unpredictable battler with a sharp edge.',
    'Drafted by chance, tuned for the current power budget.',
    'Built from chaos and ready for the arena.',
    'A randomized contender that thrives on momentum.',
];

const CUSTOM_ABILITY_NAME_PREFIXES = ['Arc', 'Rift', 'Ember', 'Tidal', 'Volt', 'Iron', 'Frost', 'Solar', 'Grave', 'Gale'];
const CUSTOM_ABILITY_NAME_CORES = ['Strike', 'Ward', 'Surge', 'Lance', 'Pulse', 'Shroud', 'Burst', 'Hook', 'Veil', 'Cascade'];

const pickOne = (arr, fallback = null) => {
    if (!Array.isArray(arr) || arr.length === 0) return fallback;
    return arr[Math.floor(Math.random() * arr.length)];
};

const sampleMany = (arr, count) => {
    if (!Array.isArray(arr) || arr.length === 0 || count <= 0) return [];
    return shuffle(arr).slice(0, Math.min(count, arr.length));
};

const createRandomEffect = () => {
    const roll = Math.random();
    if (roll < 0.45) {
        return {
            type: 'damage',
            multiplier: Number((0.8 + Math.random() * 1.5).toFixed(1)),
            flatBonus: randomInt(0, 5),
            defPiercing: randomInt(0, 4),
            repeat: randomInt(1, Math.random() < 0.7 ? 2 : 3),
            ignoreDef: Math.random() < 0.2,
            ignoreEvasion: Math.random() < 0.15,
            lifesteal: Math.random() < 0.18,
            randomTarget: Math.random() < 0.2,
            useBasicAttack: Math.random() < 0.3,
        };
    }
    if (roll < 0.68) {
        return {
            type: 'status',
            status: pickOne(STATUS_TYPES, 'burned'),
            value: randomInt(1, 4),
            duration: randomInt(1, 3),
        };
    }
    if (roll < 0.82) {
        return {
            type: Math.random() < 0.6 ? 'heal' : 'healSelf',
            amount: randomInt(2, 8),
        };
    }
    if (roll < 0.93) {
        return {
            type: 'cleanse',
            debuffs: sampleMany(CLEANSE_DEBUFFS, randomInt(1, 3)),
        };
    }
    return { type: Math.random() < 0.7 ? 'resetCooldowns' : 'selfDestruct' };
};

const createUniqueRandomAbilityName = (usedNames) => {
    const taken = usedNames instanceof Set ? usedNames : new Set();
    for (let i = 0; i < 30; i += 1) {
        const candidate = `${pickOne(CUSTOM_ABILITY_NAME_PREFIXES, 'Arc')} ${pickOne(CUSTOM_ABILITY_NAME_CORES, 'Strike')}`.trim();
        const key = candidate.toLowerCase();
        if (!taken.has(key)) return candidate;
    }
    let idx = 2;
    while (taken.has(`wild technique ${idx}`)) idx += 1;
    return `Wild Technique ${idx}`;
};

const createRandomCustomAbility = (usedNames) => {
    const targetType = pickOne(TARGET_TYPES, 'enemyCard');
    const effectsCountRoll = Math.random();
    const effectsCount = effectsCountRoll < 0.62 ? 1 : effectsCountRoll < 0.92 ? 2 : 3;
    const effects = Array.from({ length: effectsCount }, () => createRandomEffect());

    const includeMicrogame = Math.random() < 0.45;
    const microType = includeMicrogame ? pickOne(MICROGAME_TYPES, 'qte') : '';
    const microevent = microType
        ? {
            type: microType,
            outcome: Math.random() < 0.45 ? 'binary' : 'scaled',
        }
        : null;

    return {
        name: createUniqueRandomAbilityName(usedNames),
        targetType,
        limit: randomInt(1, 4),
        effects,
        microevent,
    };
};

const randomizeCustomAbilitiesWithinBudget = ({ slots, officialNames }) => {
    const maxCount = Math.max(0, Math.min(3, slots));
    if (maxCount < 1) return [];

    const usedNameKeys = new Set((officialNames || []).map((name) => String(name || '').trim().toLowerCase()).filter(Boolean));

    for (let attempt = 0; attempt < 220; attempt += 1) {
        const count = randomInt(1, maxCount);
        const next = [];
        const draftUsed = new Set(usedNameKeys);
        let valid = true;

        for (let i = 0; i < count; i += 1) {
            let chosen = null;
            for (let inner = 0; inner < 80; inner += 1) {
                const candidate = createRandomCustomAbility(draftUsed);
                const err = validateCustomAbilityLocal(candidate, i);
                const power = estimateCustomAbilityPower(candidate);
                if (!err && power <= MAX_CUSTOM_ABILITY_POWER) {
                    chosen = candidate;
                    break;
                }
            }
            if (!chosen) {
                valid = false;
                break;
            }
            next.push(chosen);
            draftUsed.add(String(chosen.name || '').trim().toLowerCase());
        }

        if (!valid) continue;
        const total = next.reduce((sum, ability) => sum + estimateCustomAbilityPower(ability), 0);
        if (total <= MAX_TOTAL_CUSTOM_ABILITY_POWER) return next;
    }

    return [{
        name: createUniqueRandomAbilityName(usedNameKeys),
        targetType: 'enemyCard',
        limit: 2,
        effects: [{ type: 'damage', multiplier: 1.2, flatBonus: 2, defPiercing: 1, repeat: 1 }],
        microevent: { type: 'qte', outcome: 'scaled' },
    }];
};

const CustomCardModal = ({ onClose }) => {
    const token = useSelector((s) => s.auth.token);
    const username = useSelector((s) => s.auth.username);
    const censorAdultCards = useSelector((s) => s.profile.censorAdultCards !== false);
    const isAdmin = username === 'Acinder';

    const [cards, setCards] = useState([]);
    const [abilities, setAbilities] = useState([]);
    const [loading, setLoading] = useState(false);
    const [createLoading, setCreateLoading] = useState(false);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [editingCardId, setEditingCardId] = useState(null);
    const [versionsFor, setVersionsFor] = useState(null);
    const [versionItems, setVersionItems] = useState([]);
    const [versionLoading, setVersionLoading] = useState(false);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [image, setImage] = useState('');
    const [stats, setStats] = useState(initialStats);
    const [elements, setElements] = useState(initialElements);
    const [abilityNames, setAbilityNames] = useState([]);
    const [customAbilities, setCustomAbilities] = useState([]);
    const [abilitySearch, setAbilitySearch] = useState('');
    const [adultOnly, setAdultOnly] = useState(false);
    const [visibility, setVisibility] = useState('public');
    const [imagePreviewError, setImagePreviewError] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiModelId, setAiModelId] = useState(AI_MODEL_PRESETS[0]?.id || '');
    const [aiConcept, setAiConcept] = useState(null);
    const [aiLoadingConcept, setAiLoadingConcept] = useState(false);
    const [aiLoadingDraft, setAiLoadingDraft] = useState(false);
    const [aiError, setAiError] = useState('');
    const [aiStatus, setAiStatus] = useState('');
    const [aiCreativity, setAiCreativity] = useState(45);

    const maxPoints = 48;
    const usedPoints = computePoints(stats);

    const builtinImages = useMemo(
        () => [...new Set(cards.map((c) => c.image).filter(Boolean))],
        [cards]
    );

    useEffect(() => {
        setImagePreviewError(false);
    }, [image]);

    const filteredCards = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return cards;
        return cards.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    }, [cards, query]);

    const filteredAbilityExamples = useMemo(() => {
        const q = abilitySearch.trim().toLowerCase();
        if (!q) return abilities;
        return abilities.filter((a) =>
            String(a.name || '').toLowerCase().includes(q)
            || String(a.description || '').toLowerCase().includes(q)
            || String(a.target || '').toLowerCase().includes(q)
            || (a.effectTypes || []).some((e) => String(e).toLowerCase().includes(q))
        );
    }, [abilities, abilitySearch]);

    const officialAbilityNames = useMemo(
        () => abilities.filter((a) => !a.isCustom).map((a) => a.name).filter(Boolean),
        [abilities]
    );

    const totalAbilityCount = abilityNames.length + customAbilities.length;
    const customAbilityPowerScores = useMemo(
        () => customAbilities.map((ability) => estimateCustomAbilityPower(ability)),
        [customAbilities]
    );
    const customAbilityMicrogameDiscounts = useMemo(
        () => customAbilities.map((ability) => getMicrogamePowerReduction(ability?.microevent)),
        [customAbilities]
    );
    const totalCustomAbilityPower = useMemo(
        () => Number(customAbilityPowerScores.reduce((sum, score) => sum + score, 0).toFixed(2)),
        [customAbilityPowerScores]
    );
    const isPowerOverBudget =
        customAbilityPowerScores.some((score) => score > MAX_CUSTOM_ABILITY_POWER)
        || totalCustomAbilityPower > MAX_TOTAL_CUSTOM_ABILITY_POWER;

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            setLoading(true);
            setError('');
            try {
                const [cardsRes, abilitiesRes] = await Promise.all([
                    fetch('/api/cards', { headers: authHeader(token, false) }),
                    fetch('/api/cards/ability-options', { headers: authHeader(token, false) }),
                ]);

                const cardsJson = await cardsRes.json();
                const abilitiesJson = await abilitiesRes.json();

                if (!cardsRes.ok) throw new Error(cardsJson.error || 'Failed to load card library');
                if (!abilitiesRes.ok) throw new Error(abilitiesJson.error || 'Failed to load abilities');

                if (!mounted) return;
                setCards(cardsJson.cards || []);
                setAbilities(abilitiesJson.abilities || []);
            } catch (err) {
                if (mounted) setError(err.message || 'Failed to load custom card builder');
            } finally {
                if (mounted) setLoading(false);
            }
        };
        load();
        return () => { mounted = false; };
    }, [token]);

    const refreshCards = async () => {
        const res = await fetch('/api/cards', { headers: authHeader(token, false) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to refresh cards');
        setCards(data.cards || []);
    };

    const toggleAbility = (abilityName) => {
        setAbilityNames((prev) => {
            if (prev.includes(abilityName)) return prev.filter((x) => x !== abilityName);
            if (prev.length + customAbilities.length >= 3) return prev;
            return [...prev, abilityName];
        });
    };

    const updateElement = (key, value) => {
        setElements((prev) => ({ ...prev, [key]: clampInt(value, 0, 5) }));
    };

    const addCustomAbility = () => {
        setCustomAbilities((prev) => {
            if (abilityNames.length + prev.length >= 3) return prev;
            return [...prev, createEmptyCustomAbility()];
        });
    };

    const removeCustomAbility = (idx) => {
        setCustomAbilities((prev) => prev.filter((_, i) => i !== idx));
    };

    const updateCustomAbility = (idx, patch) => {
        setCustomAbilities((prev) => prev.map((ab, i) => (i === idx ? { ...ab, ...patch } : ab)));
    };

    const addEffect = (abilityIdx) => {
        setCustomAbilities((prev) => prev.map((ab, i) => {
            if (i !== abilityIdx) return ab;
            if ((ab.effects || []).length >= 3) return ab;
            return { ...ab, effects: [...(ab.effects || []), createDamageEffect()] };
        }));
    };

    const removeEffect = (abilityIdx, effectIdx) => {
        setCustomAbilities((prev) => prev.map((ab, i) => {
            if (i !== abilityIdx) return ab;
            const nextEffects = (ab.effects || []).filter((_, ei) => ei !== effectIdx);
            return { ...ab, effects: nextEffects.length ? nextEffects : [createDamageEffect()] };
        }));
    };

    const updateEffect = (abilityIdx, effectIdx, patch) => {
        setCustomAbilities((prev) => prev.map((ab, i) => {
            if (i !== abilityIdx) return ab;
            const nextEffects = (ab.effects || []).map((e, ei) => (ei === effectIdx ? { ...e, ...patch } : e));
            return { ...ab, effects: nextEffects };
        }));
    };

    const setEffectType = (abilityIdx, effectIdx, type) => {
        setCustomAbilities((prev) => prev.map((ab, i) => {
            if (i !== abilityIdx) return ab;
            const nextEffects = (ab.effects || []).map((e, ei) => {
                if (ei !== effectIdx) return e;
                if (type === 'damage') return { type: 'damage', multiplier: 1 };
                if (type === 'status') return { type: 'status', status: 'burned', value: 1, duration: 2 };
                if (type === 'heal' || type === 'healSelf') return { type, amount: 3 };
                if (type === 'cleanse') return { type: 'cleanse', debuffs: ['burned'] };
                if (type === 'resetCooldowns') return { type: 'resetCooldowns' };
                if (type === 'selfDestruct') return { type: 'selfDestruct' };
                return { type: 'damage', multiplier: 1 };
            });
            return { ...ab, effects: nextEffects };
        }));
    };

    const toggleEffectDebuff = (abilityIdx, effectIdx, debuff) => {
        setCustomAbilities((prev) => prev.map((ab, i) => {
            if (i !== abilityIdx) return ab;
            const nextEffects = (ab.effects || []).map((effect, ei) => {
                if (ei !== effectIdx || effect.type !== 'cleanse') return effect;
                const current = new Set(Array.isArray(effect.debuffs) ? effect.debuffs : []);
                if (current.has(debuff)) current.delete(debuff);
                else current.add(debuff);
                return { ...effect, debuffs: [...current] };
            });
            return { ...ab, effects: nextEffects };
        }));
    };

    const applyAbilityTemplate = (template) => {
        if (!template?.isCustom || !template.customConfig) return;
        setCustomAbilities((prev) => {
            if (abilityNames.length + prev.length >= 3) return prev;
            return [
                ...prev,
                {
                    name: template.name || '',
                    targetType: template.customConfig.targetType || 'enemyCard',
                    limit: clampInt(template.limit ?? 2, 1, 10),
                    effects: Array.isArray(template.customConfig.effects) && template.customConfig.effects.length
                        ? template.customConfig.effects.map((e) => ({ ...e }))
                        : [createDamageEffect()],
                    microevent: template.microevent || null,
                },
            ];
        });
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setCreateLoading(true);
        setError('');
        try {
            const duplicateNames = new Set();
            for (let i = 0; i < customAbilities.length; i += 1) {
                const err = validateCustomAbilityLocal(customAbilities[i], i);
                if (err) throw new Error(err);
                const key = String(customAbilities[i].name || '').trim().toLowerCase();
                if (duplicateNames.has(key)) throw new Error('Custom ability names must be unique');
                duplicateNames.add(key);
                if (abilityNames.some((n) => n.toLowerCase() === key)) throw new Error('Custom ability names cannot match selected official abilities');
            }

            const payload = {
                name,
                description,
                image,
                elements,
                attack: stats.attack,
                defense: stats.defense,
                evasion: stats.evasion,
                agility: stats.agility,
                health: stats.health,
                abilityNames,
                customAbilities,
                adultOnly,
                visibility,
            };
            const res = await fetch(editingCardId ? `/api/cards/${encodeURIComponent(editingCardId)}` : '/api/cards', {
                method: editingCardId ? 'PATCH' : 'POST',
                headers: { ...authHeader(token) },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Failed to ${editingCardId ? 'update' : 'create'} card`);

            if (editingCardId) {
                setCards((prev) => prev.map((c) => (c.id === editingCardId ? data.card : c)));
            } else {
                setCards((prev) => [data.card, ...prev]);
            }
            setName('');
            setDescription('');
            setStats(initialStats);
            setElements(initialElements);
            setAbilityNames([]);
            setCustomAbilities([]);
            setAdultOnly(false);
            setVisibility('public');
            setEditingCardId(null);
        } catch (err) {
            setError(err.message || 'Failed to save card');
        } finally {
            setCreateLoading(false);
        }
    };

    const startEditCard = (card) => {
        setEditingCardId(card.id);
        setName(card.name || '');
        setDescription(card.description || '');
        setImage(card.image || '');
        setStats({
            attack: Number(card.attack || 0),
            defense: Number(card.defense || 0),
            evasion: Number(card.evasion || 0),
            agility: Number(card.agility || 0),
            health: Number(card.health || 1),
        });
        setElements({ ...initialElements, ...(card.elements || {}) });
        const actions = card.actions || [];
        setAbilityNames(actions.filter((a) => !a.customConfig).map((a) => a.name).slice(0, 3));
        setCustomAbilities(actions
            .filter((a) => a.customConfig)
            .map((a) => ({
                name: a.name || '',
                targetType: a.customConfig?.targetType || 'enemyCard',
                limit: clampInt(a.limit ?? 2, 1, 10),
                effects: Array.isArray(a.customConfig?.effects) && a.customConfig.effects.length
                    ? a.customConfig.effects.map((e) => ({ ...e }))
                    : [createDamageEffect()],
                microevent: a.microevent || null,
            }))
            .slice(0, 3));
        setAdultOnly(!!card.adultOnly);
        setVisibility(card.visibility || 'public');
    };

    const cancelEdit = () => {
        setEditingCardId(null);
        setName('');
        setDescription('');
        setImage(cards[0]?.image || '');
        setStats(initialStats);
        setElements(initialElements);
        setAbilityNames([]);
        setCustomAbilities([]);
        setAdultOnly(false);
        setVisibility('public');
        setAiConcept(null);
        setAiError('');
    };

    const handleRandomizeCard = () => {
        const randomizedStats = randomStatsForBudget(maxPoints);
        const officialAbilities = abilities.filter((a) => !a.isCustom).map((a) => a.name).filter(Boolean);
        const abilityCount = officialAbilities.length ? randomInt(1, Math.min(3, officialAbilities.length)) : 0;
        const randomizedAbilities = shuffle(officialAbilities).slice(0, abilityCount);
        const randomizedName = `${NAME_PREFIXES[randomInt(0, NAME_PREFIXES.length - 1)]} ${NAME_CORES[randomInt(0, NAME_CORES.length - 1)]}`;
        const randomizedDescription = DESCRIPTION_TEMPLATES[randomInt(0, DESCRIPTION_TEMPLATES.length - 1)];

        const randomizedElements = Object.keys(initialElements).reduce((acc, key) => {
            acc[key] = randomInt(0, 5);
            return acc;
        }, {});

        const randomImage = builtinImages.length
            ? builtinImages[Math.floor(Math.random() * builtinImages.length)]
            : (cards[0]?.image || image);

        setStats(randomizedStats);
        setElements(randomizedElements);
        setAbilityNames(randomizedAbilities);
        setCustomAbilities([]);
        setImage(randomImage);
        setName(randomizedName);
        setDescription(randomizedDescription);
        setError('');
    };

    const handleRandomizeCustomAbilities = () => {
        const slots = Math.max(0, 3 - abilityNames.length);
        if (slots < 1) {
            setError('No custom ability slots left. Remove one selected official ability first.');
            return;
        }

        const generated = randomizeCustomAbilitiesWithinBudget({
            slots,
            officialNames: abilityNames,
        });

        setCustomAbilities(generated.slice(0, slots));
        setError('');
    };

    const handleGenerateConcept = async () => {
        if (!aiPrompt.trim()) {
            setAiError('Describe your card idea first.');
            return;
        }

        setAiError('');
        setAiStatus('');
        setAiLoadingConcept(true);
        try {
            const result = await generateCardConcept({
                modelId: aiModelId,
                userPrompt: aiPrompt.trim(),
                creativity: aiCreativity,
            });
            setAiConcept(result.concept);
            if (result.usedModelId && result.usedModelId !== aiModelId) {
                const fallback = AI_MODEL_PRESETS.find((m) => m.id === result.usedModelId);
                setAiStatus(`Primary model failed. Used fallback: ${fallback?.label || result.usedModelId}`);
            }
        } catch (err) {
            setAiError(err.message || 'Failed to generate concept. Try another model.');
        } finally {
            setAiLoadingConcept(false);
        }
    };

    const handleGenerateDraft = async () => {
        if (!aiPrompt.trim()) {
            setAiError('Describe your card idea first.');
            return;
        }

        setAiError('');
        setAiStatus('');
        setAiLoadingDraft(true);
        try {
            const result = await generateCardDraft({
                modelId: aiModelId,
                userPrompt: aiPrompt.trim(),
                concept: aiConcept,
                officialAbilityNames,
                creativity: aiCreativity,
            });
            const draft = result.draft;

            const safeStats = fitStatsToBudget(draft?.stats || {}, maxPoints);
            const safeElements = normalizeElements(draft?.elements || {});
            const safeAbilities = normalizeAbilityNames(draft?.abilityNames, officialAbilityNames);

            setName(String(draft?.name || '').slice(0, 60) || 'Generated Card');
            setDescription(String(draft?.description || '').slice(0, 500));
            setStats(safeStats);
            setElements(safeElements);
            setAbilityNames(safeAbilities);
            setCustomAbilities([]);
            if (result.usedModelId && result.usedModelId !== aiModelId) {
                const fallback = AI_MODEL_PRESETS.find((m) => m.id === result.usedModelId);
                setAiStatus(`Primary model failed. Used fallback: ${fallback?.label || result.usedModelId}`);
            }
        } catch (err) {
            setAiError(err.message || 'Failed to generate draft. Try again.');
        } finally {
            setAiLoadingDraft(false);
        }
    };

    const handleDelete = async (cardId) => {
        const ok = window.confirm('Delete this custom card? This cannot be undone.');
        if (!ok) return;
        setError('');
        try {
            const res = await fetch(`/api/cards/${encodeURIComponent(cardId)}`, {
                method: 'DELETE',
                headers: authHeader(token, false),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete card');
            }
            setCards((prev) => prev.filter((c) => c.id !== cardId));
            if (editingCardId === cardId) cancelEdit();
        } catch (err) {
            setError(err.message || 'Failed to delete card');
        }
    };

    const handleFork = async (cardId) => {
        setError('');
        try {
            const res = await fetch(`/api/cards/${encodeURIComponent(cardId)}/fork`, {
                method: 'POST',
                headers: authHeader(token, false),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fork card');
            setCards((prev) => [data.card, ...prev]);
        } catch (err) {
            setError(err.message || 'Failed to fork card');
        }
    };

    const handleVerify = async (cardId) => {
        setError('');
        try {
            const res = await fetch(`/api/cards/${encodeURIComponent(cardId)}/verify`, {
                method: 'PATCH',
                headers: authHeader(token, false),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update verification');
            setCards((prev) => prev.map((c) => (c.id === cardId ? data.card : c)));
        } catch (err) {
            setError(err.message || 'Failed to update verification');
        }
    };

    const handleReport = async (cardId) => {
        const reason = window.prompt('Report reason (required):');
        if (!reason || !reason.trim()) return;
        setError('');
        try {
            const res = await fetch(`/api/cards/${encodeURIComponent(cardId)}/report`, {
                method: 'POST',
                headers: { ...authHeader(token) },
                body: JSON.stringify({ reason: reason.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to report card');
            await refreshCards();
        } catch (err) {
            setError(err.message || 'Failed to report card');
        }
    };

    const openVersions = async (card) => {
        setVersionLoading(true);
        setVersionsFor(card);
        setVersionItems([]);
        setError('');
        try {
            const res = await fetch(`/api/cards/${encodeURIComponent(card.id)}/versions`, {
                headers: authHeader(token, false),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load versions');
            setVersionItems(data.versions || []);
        } catch (err) {
            setError(err.message || 'Failed to load versions');
        } finally {
            setVersionLoading(false);
        }
    };

    return (
        <div className="custom-card-overlay" onClick={onClose}>
            <div className="custom-card-modal" onClick={(e) => e.stopPropagation()}>
                <div className="custom-card-header">
                    <h2 className="custom-card-title">Custom Card Builder</h2>
                    <button className="custom-card-close" onClick={onClose}>✕</button>
                </div>

                <div className="custom-card-body">
                    <form className="custom-card-form" onSubmit={handleCreate}>
                        <label className="custom-card-label">
                            Name
                            <input className="custom-card-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required title="Card name shown in deck and battle UI (max 60 chars)." />
                        </label>

                        <label className="custom-card-label">
                            Description
                            <textarea className="custom-card-textarea" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} title="Flavor text and card notes (max 500 chars)." />
                        </label>

                        <label className="custom-card-label">
                            Image URL
                            <input className="custom-card-input" value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://..." required title="Direct image URL used for card art." />
                        </label>

                        <label className="custom-card-label">
                            Built-in Art
                            <select className="custom-card-input" value={image} onChange={(e) => setImage(e.target.value)} title="Quickly pick artwork from official card art." >
                                {builtinImages.map((img, i) => (
                                    <option key={i} value={img}>{`Built-in #${i + 1}`}</option>
                                ))}
                            </select>
                        </label>

                        <div className="custom-card-image-preview-wrap">
                            <div className="custom-card-preview-head">
                                <span>Card Art Preview</span>
                                <button
                                    type="button"
                                    className="custom-card-row-btn"
                                    onClick={handleRandomizeCard}
                                    title="Generate a random build that stays within max stat budget."
                                >
                                    Randomize Card
                                </button>
                            </div>
                            {!imagePreviewError ? (
                                <img
                                    src={image}
                                    alt="Card preview"
                                    className="custom-card-image-preview"
                                    onError={() => setImagePreviewError(true)}
                                />
                            ) : (
                                <div className="custom-card-image-preview-fallback">
                                    Preview unavailable. Check image URL.
                                </div>
                            )}
                        </div>

                        <div className="custom-card-ai-box">
                            <div className="custom-card-preview-head">
                                <span>AI Card Assistant</span>
                            </div>
                            <label className="custom-card-label">
                                Describe Your Card
                                <textarea
                                    className="custom-card-textarea"
                                    rows={3}
                                    value={aiPrompt}
                                    onChange={(e) => setAiPrompt(e.target.value)}
                                    placeholder="Example: A wind assassin that trades defense for speed and precision strikes."
                                    title="Describe your concept in plain language, then generate concept and draft."
                                />
                            </label>
                            <label className="custom-card-label">
                                Local Model
                                <select
                                    className="custom-card-input"
                                    value={aiModelId}
                                    onChange={(e) => setAiModelId(e.target.value)}
                                    title="Select which browser-local model to use."
                                >
                                    {AI_MODEL_PRESETS.map((m) => (
                                        <option key={m.id} value={m.id}>{m.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="custom-card-label">
                                Creativity vs Balance
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={aiCreativity}
                                    onChange={(e) => setAiCreativity(clampInt(e.target.value, 0, 100))}
                                    title="Lower values enforce stricter balance. Higher values allow more creative variance."
                                />
                                <div className="custom-card-ai-scale">
                                    <span>Balance</span>
                                    <strong>{aiCreativity <= 45 ? 'Strict' : aiCreativity >= 70 ? 'Creative' : 'Balanced'}</strong>
                                    <span>Creativity</span>
                                </div>
                            </label>
                            <div className="custom-card-ai-actions">
                                <button
                                    type="button"
                                    className="custom-card-row-btn"
                                    onClick={handleGenerateConcept}
                                    disabled={aiLoadingConcept || aiLoadingDraft || !aiPrompt.trim()}
                                    title="Step 1: Generate concept summary from your prompt."
                                >
                                    {aiLoadingConcept ? 'Generating Concept…' : 'Generate Concept'}
                                </button>
                                <button
                                    type="button"
                                    className="custom-card-row-btn"
                                    onClick={handleGenerateDraft}
                                    disabled={aiLoadingConcept || aiLoadingDraft || !aiPrompt.trim()}
                                    title="Step 2: Generate and apply a full draft to this form."
                                >
                                    {aiLoadingDraft ? 'Generating Draft…' : 'Generate Full Draft'}
                                </button>
                            </div>
                            {aiStatus && <div className="custom-card-ai-status">{aiStatus}</div>}
                            {aiError && <div className="custom-card-ai-error">{aiError}</div>}
                            {aiConcept && (
                                <div className="custom-card-ai-concept">
                                    <div className="custom-card-ai-concept-title">Concept Preview</div>
                                    <div className="custom-card-ai-summary-grid">
                                        <div>
                                            <span className="custom-card-ai-key">Title</span>
                                            <p>{String(aiConcept.title || 'Untitled concept')}</p>
                                        </div>
                                        <div>
                                            <span className="custom-card-ai-key">Theme</span>
                                            <p>{String(aiConcept.theme || 'No theme provided')}</p>
                                        </div>
                                        <div>
                                            <span className="custom-card-ai-key">Playstyle</span>
                                            <p>{String(aiConcept.playstyle || 'No playstyle provided')}</p>
                                        </div>
                                    </div>
                                    <div className="custom-card-ai-list-wrap">
                                        <span className="custom-card-ai-key">Strengths</span>
                                        <ul>
                                            {(Array.isArray(aiConcept.strengths) ? aiConcept.strengths : []).slice(0, 4).map((item, idx) => (
                                                <li key={`str-${idx}`}>{String(item)}</li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="custom-card-ai-list-wrap">
                                        <span className="custom-card-ai-key">Weaknesses</span>
                                        <ul>
                                            {(Array.isArray(aiConcept.weaknesses) ? aiConcept.weaknesses : []).slice(0, 3).map((item, idx) => (
                                                <li key={`weak-${idx}`}>{String(item)}</li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="custom-card-ai-list-wrap">
                                        <span className="custom-card-ai-key">Ability Ideas</span>
                                        <ul>
                                            {(Array.isArray(aiConcept.abilityIdeas) ? aiConcept.abilityIdeas : []).slice(0, 4).map((item, idx) => (
                                                <li key={`idea-${idx}`}>{String(item)}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="custom-card-stats-grid">
                            {Object.keys(initialStats).map((key) => (
                                <label key={key} className="custom-card-label">
                                    {key.toUpperCase()}
                                    <input
                                        className="custom-card-input"
                                        type="number"
                                        min={key === 'health' ? 1 : 0}
                                        max={key === 'health' ? 30 : 20}
                                        value={stats[key]}
                                        onChange={(e) => setStats((prev) => ({
                                            ...prev,
                                            [key]: clampInt(e.target.value, key === 'health' ? 1 : 0, key === 'health' ? 30 : 20),
                                        }))}
                                        title={`Set ${key.toUpperCase()} stat. This contributes to the overall stat budget.`}
                                    />
                                </label>
                            ))}
                        </div>

                        <div className={`custom-card-points${usedPoints > maxPoints ? ' over' : ''}`} title="Card stat budget. Keep total at or below the cap.">
                            Budget: {usedPoints} / {maxPoints}
                        </div>

                        {FEATURES.showElements && (
                            <div className="custom-card-elements-grid">
                                {Object.keys(initialElements).map((el) => (
                                    <label key={el} className="custom-card-label">
                                        {el}
                                        <input
                                            className="custom-card-input"
                                            type="number"
                                            min={0}
                                            max={5}
                                            value={elements[el]}
                                            onChange={(e) => updateElement(el, e.target.value)}
                                            title="Element affinity from 0 to 5."
                                        />
                                    </label>
                                ))}
                            </div>
                        )}

                        <div className="custom-card-abilities">
                            <div className="custom-card-subtitle" title="Each card can equip up to 3 abilities total (official + custom).">Abilities (pick up to 3 total)</div>
                            <input
                                className="custom-card-input"
                                placeholder="Search ability examples..."
                                value={abilitySearch}
                                onChange={(e) => setAbilitySearch(e.target.value)}
                                title="Search official and community ability examples by name, description, target, or effect type."
                            />
                            <div className="custom-card-ability-list">
                                {filteredAbilityExamples.filter((a) => !a.isCustom).map((a) => (
                                    <button
                                        key={a.name}
                                        type="button"
                                        className={`custom-card-ability${abilityNames.includes(a.name) ? ' selected' : ''}`}
                                        onClick={() => toggleAbility(a.name)}
                                        title={a.description}
                                    >
                                        <span>{a.name}</span>
                                        <small>{a.actionInfo} {a.microeventType ? `· ${a.microeventType}` : ''}</small>
                                    </button>
                                ))}
                            </div>
                            <div className="custom-card-subtitle" style={{ marginTop: '0.6rem' }} title="Templates shared by other players. Use one to prefill a custom ability.">Community Examples</div>
                            <div className="custom-card-ability-list">
                                {filteredAbilityExamples.filter((a) => a.isCustom).slice(0, 20).map((a, idx) => (
                                    <button
                                        key={`${a.name}-${a.createdBy}-${idx}`}
                                        type="button"
                                        className="custom-card-ability"
                                        onClick={() => applyAbilityTemplate(a)}
                                        title={a.description}
                                        disabled={totalAbilityCount >= 3}
                                    >
                                        <span>{a.name}</span>
                                        <small>{a.target} · By {a.createdBy || 'Unknown'}</small>
                                    </button>
                                ))}
                            </div>
                            <div className="custom-card-subtitle" style={{ marginTop: '0.6rem' }} title="Compose your own effects and targets. Power budget must stay within limits.">Build Custom Abilities</div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-0.1rem' }}>
                                <button
                                    type="button"
                                    className="custom-card-row-btn"
                                    onClick={handleRandomizeCustomAbilities}
                                    disabled={totalAbilityCount >= 3 && customAbilities.length === 0}
                                    title="Generate randomized custom abilities that stay within custom ability power limits."
                                >
                                    Randomize Custom Abilities
                                </button>
                            </div>
                            <div className={`custom-card-power-box${isPowerOverBudget ? ' over' : ''}`}>
                                <div className="custom-card-power-row">
                                    <span>Total custom power</span>
                                    <strong>{totalCustomAbilityPower} / {MAX_TOTAL_CUSTOM_ABILITY_POWER}</strong>
                                </div>
                                <div className="custom-card-power-track">
                                    <div className="custom-card-power-fill" style={{ width: powerFill(totalCustomAbilityPower, MAX_TOTAL_CUSTOM_ABILITY_POWER) }} />
                                </div>
                                <small>Keep each custom ability under {MAX_CUSTOM_ABILITY_POWER} and total under {MAX_TOTAL_CUSTOM_ABILITY_POWER}.</small>
                            </div>
                            {customAbilities.map((ability, abilityIdx) => (
                                <div key={`ca-${abilityIdx}`} className="custom-card-ability custom-card-ability-editor selected" style={{ marginTop: '0.45rem' }}>
                                    <div className={`custom-card-power-box${customAbilityPowerScores[abilityIdx] > MAX_CUSTOM_ABILITY_POWER ? ' over' : ''}`}>
                                        <div className="custom-card-power-row">
                                            <span>Ability power</span>
                                            <strong>{customAbilityPowerScores[abilityIdx] || 0} / {MAX_CUSTOM_ABILITY_POWER}</strong>
                                        </div>
                                        <div className="custom-card-power-track">
                                            <div className="custom-card-power-fill" style={{ width: powerFill(customAbilityPowerScores[abilityIdx] || 0, MAX_CUSTOM_ABILITY_POWER) }} />
                                        </div>
                                        {!!customAbilityMicrogameDiscounts[abilityIdx] && (
                                            <small>
                                                Microgame discount: -{customAbilityMicrogameDiscounts[abilityIdx].toFixed(1)} power
                                            </small>
                                        )}
                                    </div>
                                    <div className="custom-card-stats-grid" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
                                        <label className="custom-card-label">
                                            Name
                                            <input
                                                className="custom-card-input"
                                                value={ability.name}
                                                maxLength={60}
                                                onChange={(e) => updateCustomAbility(abilityIdx, { name: e.target.value })}
                                                title="Unique ability name for this card."
                                            />
                                        </label>
                                        <label className="custom-card-label">
                                            Target
                                            <select
                                                className="custom-card-input"
                                                value={ability.targetType}
                                                onChange={(e) => updateCustomAbility(abilityIdx, { targetType: e.target.value })}
                                                title="Choose who this ability can affect."
                                            >
                                                {TARGET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </label>
                                        <label className="custom-card-label">
                                            Uses
                                            <input
                                                className="custom-card-input"
                                                type="number"
                                                min={1}
                                                max={10}
                                                value={ability.limit}
                                                onChange={(e) => updateCustomAbility(abilityIdx, { limit: clampInt(e.target.value, 1, 10) })}
                                                title="Uses per battle before cooldown reset effects."
                                            />
                                        </label>
                                    </div>
                                    <div className="custom-card-stats-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                        <label className="custom-card-label">
                                            Microgame
                                            <select
                                                className="custom-card-input"
                                                value={ability.microevent?.type || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (!val) updateCustomAbility(abilityIdx, { microevent: null });
                                                    else updateCustomAbility(abilityIdx, {
                                                        microevent: {
                                                            type: val,
                                                            outcome: ability.microevent?.outcome || 'scaled',
                                                        },
                                                    });
                                                }}
                                                title="Attach a skill check minigame. Harder microgames grant larger power discount."
                                            >
                                                <option value="">None</option>
                                                {MICROGAME_TYPES.map((t) => (
                                                    <option key={t} value={t}>
                                                        {t} ({MICROGAME_DIFFICULTY[t]})
                                                    </option>
                                                ))}
                                            </select>
                                            <small className="custom-card-help">Harder microgames reduce power more.</small>
                                        </label>
                                        <label className="custom-card-label">
                                            Microgame Outcome
                                            <select
                                                className="custom-card-input"
                                                value={ability.microevent?.outcome || 'scaled'}
                                                disabled={!ability.microevent}
                                                onChange={(e) => updateCustomAbility(abilityIdx, {
                                                    microevent: ability.microevent
                                                        ? { ...ability.microevent, outcome: e.target.value }
                                                        : null,
                                                })}
                                                title="Scaled = partial success scales effect. Binary = pass/fail effect."
                                            >
                                                <option value="scaled">Scaled</option>
                                                <option value="binary">Binary</option>
                                            </select>
                                        </label>
                                    </div>

                                    {(ability.effects || []).map((effect, effectIdx) => (
                                        <div key={`ef-${abilityIdx}-${effectIdx}`} className="custom-card-elements-grid" style={{ gridTemplateColumns: '1.2fr 1fr 1fr 1fr', marginTop: '0.35rem' }}>
                                            <label className="custom-card-label">
                                                Effect
                                                <select
                                                    className="custom-card-input"
                                                    value={effect.type}
                                                    onChange={(e) => setEffectType(abilityIdx, effectIdx, e.target.value)}
                                                    title="Choose what this effect does."
                                                >
                                                    {EFFECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </label>

                                            {effect.type === 'damage' && (
                                                <>
                                                    <label className="custom-card-label">
                                                        Multiplier
                                                        <input className="custom-card-input" type="number" min={0.5} max={3} step={0.1} value={effect.multiplier ?? 1}
                                                            onChange={(e) => updateEffect(abilityIdx, effectIdx, { multiplier: Number(e.target.value) })}
                                                            title="Damage multiplier applied to attack stat." />
                                                        <small className="custom-card-help">Higher values raise power quickly.</small>
                                                    </label>
                                                    <label className="custom-card-label">
                                                        Flat Bonus
                                                        <input className="custom-card-input" type="number" min={-5} max={8} value={effect.flatBonus ?? 0}
                                                            onChange={(e) => updateEffect(abilityIdx, effectIdx, { flatBonus: clampInt(e.target.value, -5, 8) })}
                                                            title="Adds fixed damage before defense calculation." />
                                                        <small className="custom-card-help">Adds fixed damage before mitigation.</small>
                                                    </label>
                                                    <label className="custom-card-label">
                                                        DEF Pierce
                                                        <input className="custom-card-input" type="number" min={0} max={8} value={effect.defPiercing ?? 0}
                                                            onChange={(e) => updateEffect(abilityIdx, effectIdx, { defPiercing: clampInt(e.target.value, 0, 8) })}
                                                            title="Ignores this much target defense." />
                                                        <small className="custom-card-help">Ignores target defense by this amount.</small>
                                                    </label>
                                                    <label className="custom-card-label">
                                                        Repeat
                                                        <input className="custom-card-input" type="number" min={1} max={5} value={effect.repeat ?? 1}
                                                            onChange={(e) => updateEffect(abilityIdx, effectIdx, { repeat: clampInt(e.target.value, 1, 5) })}
                                                            title="Number of repeated hits from this effect." />
                                                        <small className="custom-card-help">Multiple hits scale power sharply.</small>
                                                    </label>
                                                    <div className="custom-card-flag-grid">
                                                        <label className="custom-card-toggle-row" title="Use normal attack hit/evasion resolution for this effect."><input type="checkbox" checked={!!effect.useBasicAttack} onChange={(e) => updateEffect(abilityIdx, effectIdx, { useBasicAttack: e.target.checked })} />Basic attack roll</label>
                                                        <label className="custom-card-toggle-row" title="Bypass defense mitigation."><input type="checkbox" checked={!!effect.ignoreDef} onChange={(e) => updateEffect(abilityIdx, effectIdx, { ignoreDef: e.target.checked })} />Ignore DEF</label>
                                                        <label className="custom-card-toggle-row" title="Bypass evasion checks."><input type="checkbox" checked={!!effect.ignoreEvasion} onChange={(e) => updateEffect(abilityIdx, effectIdx, { ignoreEvasion: e.target.checked })} />Ignore EVA</label>
                                                        <label className="custom-card-toggle-row" title="Heals caster for a portion of damage dealt."><input type="checkbox" checked={!!effect.lifesteal} onChange={(e) => updateEffect(abilityIdx, effectIdx, { lifesteal: e.target.checked })} />Lifesteal</label>
                                                        <label className="custom-card-toggle-row" title="For multi-target patterns, each hit can choose a random target."><input type="checkbox" checked={!!effect.randomTarget} onChange={(e) => updateEffect(abilityIdx, effectIdx, { randomTarget: e.target.checked })} />Random target</label>
                                                    </div>
                                                </>
                                            )}

                                            {effect.type === 'status' && (
                                                <>
                                                    <label className="custom-card-label">
                                                        Status
                                                        <select className="custom-card-input" value={effect.status || 'burned'}
                                                            onChange={(e) => updateEffect(abilityIdx, effectIdx, { status: e.target.value })}
                                                            title="Status effect applied to target.">
                                                            {STATUS_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                                                        </select>
                                                    </label>
                                                    <label className="custom-card-label">
                                                        Value
                                                        <input className="custom-card-input" type="number" min={1} max={8} value={effect.value ?? 1}
                                                            onChange={(e) => updateEffect(abilityIdx, effectIdx, { value: clampInt(e.target.value, 1, 8) })}
                                                            title="How strong the status is each turn/tick." />
                                                        <small className="custom-card-help">Status intensity per tick.</small>
                                                    </label>
                                                    <label className="custom-card-label">
                                                        Duration
                                                        <input className="custom-card-input" type="number" min={1} max={6} value={effect.duration ?? 2}
                                                            onChange={(e) => updateEffect(abilityIdx, effectIdx, { duration: clampInt(e.target.value, 1, 6) })}
                                                            title="Number of turns this status lasts." />
                                                        <small className="custom-card-help">Long duration can exceed budget fast.</small>
                                                    </label>
                                                </>
                                            )}

                                            {(effect.type === 'heal' || effect.type === 'healSelf') && (
                                                <label className="custom-card-label">
                                                    Amount
                                                    <input className="custom-card-input" type="number" min={1} max={12} value={effect.amount ?? 3}
                                                        onChange={(e) => updateEffect(abilityIdx, effectIdx, { amount: clampInt(e.target.value, 1, 12) })}
                                                        title="Amount of HP restored." />
                                                    <small className="custom-card-help">Large heals cost more budget.</small>
                                                </label>
                                            )}

                                            {effect.type === 'cleanse' && (
                                                <div className="custom-card-label" style={{ gridColumn: 'span 3' }}>
                                                    Debuffs
                                                    <div className="custom-card-chip-list">
                                                        {CLEANSE_DEBUFFS.map((d) => {
                                                            const active = (effect.debuffs || []).includes(d);
                                                            return (
                                                                <button
                                                                    key={d}
                                                                    type="button"
                                                                    className={`custom-card-chip${active ? ' active' : ''}`}
                                                                    onClick={() => toggleEffectDebuff(abilityIdx, effectIdx, d)}
                                                                >
                                                                    {d}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            <button
                                                type="button"
                                                className="custom-card-row-btn danger"
                                                onClick={() => removeEffect(abilityIdx, effectIdx)}
                                                title="Delete this effect from the custom ability."
                                            >
                                                Remove Effect
                                            </button>
                                        </div>
                                    ))}

                                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.45rem' }}>
                                        <button type="button" className="custom-card-row-btn" onClick={() => addEffect(abilityIdx)} title="Add another effect (max 3 per ability).">
                                            + Effect
                                        </button>
                                        <button type="button" className="custom-card-row-btn danger" onClick={() => removeCustomAbility(abilityIdx)} title="Remove this entire custom ability.">
                                            Remove Ability
                                        </button>
                                    </div>
                                </div>
                            ))}
                            <button
                                type="button"
                                className="custom-card-row-btn"
                                onClick={addCustomAbility}
                                disabled={totalAbilityCount >= 3}
                                title="Add a blank custom ability. Max 3 total abilities per card."
                                style={{ marginTop: '0.55rem' }}
                            >
                                + Add Custom Ability
                            </button>
                        </div>

                        <label className="custom-card-toggle-row">
                            <input type="checkbox" checked={adultOnly} onChange={(e) => setAdultOnly(e.target.checked)} title="Marks this card as 18+ and hides it for users with adult content filtering." />
                            Adults-only card
                        </label>

                        <label className="custom-card-label">
                            Visibility
                            <select
                                className="custom-card-input"
                                value={visibility}
                                onChange={(e) => setVisibility(e.target.value)}
                                title="Public cards appear in the gallery. Private cards are only visible to you."
                            >
                                <option value="public">Public</option>
                                <option value="private">Private (only you)</option>
                            </select>
                        </label>

                        {error && <p className="custom-card-error">{error}</p>}

                        <button
                            className="custom-card-create-btn"
                            type="submit"
                            disabled={createLoading || usedPoints > maxPoints || totalAbilityCount < 1 || isPowerOverBudget}
                            title="Save this card. Disabled if stat budget or custom ability power budget is exceeded, or if no ability is selected."
                        >
                            <svg className="custom-card-btn-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <rect x="4" y="5" width="16" height="14" rx="2" ry="2" />
                                <path d="M12 8v8M8 12h8" />
                            </svg>
                            <span>{createLoading ? 'Saving…' : editingCardId ? 'Update Card' : 'Create Cards'}</span>
                        </button>
                        {editingCardId && (
                            <button className="custom-card-cancel-edit-btn" type="button" onClick={cancelEdit} title="Discard edits and return to create mode.">
                                Cancel Edit
                            </button>
                        )}
                    </form>

                    <div className="custom-card-library">
                        <div className="custom-card-library-head">
                            <h3>Library</h3>
                            <input
                                className="custom-card-input"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search by name or id"
                                title="Search your card library by card name or ID."
                            />
                        </div>
                        {loading ? (
                            <p className="custom-card-empty">Loading cards…</p>
                        ) : filteredCards.length === 0 ? (
                            <p className="custom-card-empty">No cards found.</p>
                        ) : (
                            <div className="custom-card-list">
                                {filteredCards.map((card) => (
                                    <div key={card.id} className="custom-card-row">
                                        <img src={card.adultOnly && censorAdultCards ? (cards[0]?.image || '') : card.image} alt={card.name} className="custom-card-thumb" />
                                        <div className="custom-card-row-info">
                                            <div className="custom-card-row-name">
                                                {card.adultOnly && censorAdultCards ? 'Adults-only Card' : card.name}
                                                {card.visibility === 'private' && <span className="custom-card-private-badge">🔒 Private</span>}
                                                {!card.official && card.verified && <span className="custom-card-verified-badge">✓ Verified</span>}
                                                {!card.official && !card.verified && <span className="custom-card-unverified-badge">⚠ Unverified</span>}
                                            </div>
                                            <div className="custom-card-row-meta">
                                                {card.official ? 'Official' : `By ${card.createdBy || 'Unknown'}`}
                                                {card.adultOnly ? ' · Adults-only' : ''}
                                                {card.createdBy === username ? ' · Yours' : ''}
                                                {card.reportCount > 0 ? ` · Reports: ${card.reportCount}` : ''}
                                            </div>
                                        </div>
                                        <div className="custom-card-row-actions">
                                            <button className="custom-card-row-btn" onClick={() => openVersions(card)} title="View edit history for this card.">Versions</button>
                                            {!card.official && card.createdBy === username && (
                                                <>
                                                    <button className="custom-card-row-btn" onClick={() => startEditCard(card)} title="Load this card into the editor.">Edit</button>
                                                    <button className="custom-card-row-btn danger" onClick={() => handleDelete(card.id)} title="Delete this card permanently.">Delete</button>
                                                </>
                                            )}
                                            {card.createdBy !== username && (
                                                <button className="custom-card-row-btn" onClick={() => handleReport(card.id)} title="Report card for moderation review.">Report</button>
                                            )}
                                            {isAdmin && !card.official && (
                                                <button
                                                    className={`custom-card-row-btn${card.verified ? ' danger' : ''}`}
                                                    onClick={() => handleVerify(card.id)}
                                                    title={card.verified ? 'Remove verification from this card.' : 'Mark this card as verified.'}
                                                >
                                                    {card.verified ? 'Unverify' : 'Verify'}
                                                </button>
                                            )}
                                            <button className="custom-card-row-btn" onClick={() => handleFork(card.id)} title="Create an editable copy under your account.">Fork</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {versionsFor && (
                    <div className="custom-card-versions-overlay" onClick={() => setVersionsFor(null)}>
                        <div className="custom-card-versions-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="custom-card-versions-head">
                                <h3>Versions: {versionsFor.name}</h3>
                                <button className="custom-card-close" onClick={() => setVersionsFor(null)}>✕</button>
                            </div>
                            {versionLoading ? (
                                <p className="custom-card-empty">Loading versions…</p>
                            ) : versionItems.length === 0 ? (
                                <p className="custom-card-empty">No version history yet.</p>
                            ) : (
                                <div className="custom-card-version-list">
                                    {versionItems.map((v) => (
                                        <div key={`${v.index}-${v.editedAt}`} className="custom-card-version-row">
                                            <div className="custom-card-version-time">{new Date(v.editedAt).toLocaleString()}</div>
                                            <div className="custom-card-version-meta">By {v.editedBy}</div>
                                            <div className="custom-card-version-stats">
                                                ATK {v.snapshot?.attack} · DEF {v.snapshot?.defense} · EVA {v.snapshot?.evasion} · AGI {v.snapshot?.agility} · HP {v.snapshot?.health}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CustomCardModal;
