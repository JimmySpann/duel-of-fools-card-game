export const RULES_SECTIONS = [
    {
        id: 'objective',
        title: 'Objective',
        brief: [
            'Defeat all enemy battlers, or reduce enemy player HP to 0.',
            'In team mode, your team wins when all opposing teams are eliminated.',
        ],
        deep: [
            'A battler duel can end in two ways: board control (all enemy battlers defeated) or direct player damage reducing opponents to 0 HP.',
            'In free-for-all, the last surviving player wins. In team mode, the last surviving team wins.',
        ],
    },
    {
        id: 'turnFlow',
        title: 'Turn Flow',
        brief: [
            'Start of turn: draw 1 card if your deck is not empty.',
            'Main phase: play up to 1 card, then act with ready battlers.',
            'End turn: cleanup defeated battlers, process status ticks, pass turn.',
        ],
        steps: [
            {
                title: 'Draw',
                detail: 'At turn start you draw one card if your deck has cards remaining.',
            },
            {
                title: 'Play (optional)',
                detail: 'You can play one battler card from hand per turn, respecting max in-play limits.',
            },
            {
                title: 'Act',
                detail: 'Each ready battler can perform exactly one action: basic attack or one ability.',
            },
            {
                title: 'End Turn',
                detail: 'Defeated cards are cleaned up, status durations tick, then turn advances to the next non-eliminated player.',
            },
        ],
    },
    {
        id: 'actions',
        title: 'Actions And Readiness',
        brief: [
            'Newly played battlers are Not Ready this turn.',
            'A battler marked Acted cannot act again until turn reset.',
            'Frozen battlers cannot act while the status is active.',
        ],
        deep: [
            'A battler cannot act if it has just entered play, has already acted this turn, or is frozen.',
            'Abilities consume usesRemaining, and depleted abilities cannot be selected until restored by effects.',
        ],
    },
    {
        id: 'combat',
        title: 'Combat Resolution',
        brief: [
            'Basic attacks check evasion first; a successful evade causes a miss.',
            'On hit, damage is based on attacker ATK vs defender DEF (minimum 1).',
            'Focused increases the next basic attack, then is consumed.',
        ],
        deep: [
            'Basic attack order: evasion check -> hit/miss -> damage calculation. Minimum hit damage is 1 on a successful hit.',
            'Many abilities modify this flow with piercing, ignore-defense, ignore-evasion, multi-hit, lifesteal, and on-hit statuses.',
        ],
    },
    {
        id: 'status',
        title: 'Status Effects',
        brief: [
            'Damage-over-time effects tick at turn processing and can defeat battlers.',
            'Most statuses have durations; duration 999 represents persistent effects.',
            'Cleanse effects remove key debuffs such as burn, poison, bleed, and freeze.',
        ],
        deep: [
            'Buffs include effects like shielded, focused, invulnerable, and stat-up modifiers. Debuffs include frozen, burned, poisoned, bleeding, and stat-down effects.',
            'Damage reduction and shielding alter incoming damage rules. Temporary statuses expire as their duration reaches zero.',
        ],
    },
    {
        id: 'directAttack',
        title: 'Direct Attack',
        brief: [
            'Direct attacks target player HP when opponents have no battlers in play.',
            'Direct attack damage scales from the attacker attack stat with a minimum floor.',
        ],
        deep: [
            'When valid targets have empty boards, direct attacks can bypass card combat and hit player HP directly.',
            'In multiplayer contexts, direct attack effects can apply across multiple opposing players based on targeting rules.',
        ],
    },
    {
        id: 'microevents',
        title: 'Microevents',
        brief: [
            'Some abilities trigger skill-based microevents before final effect resolution.',
            'Binary events are pass/fail; scaled events convert score into stronger or weaker outcomes.',
            'QTE: tap precisely when a projectile reaches the target zone.',
            'Mash: click as fast as possible to fill the meter before time runs out.',
            'Pattern: watch a Simon Says sequence, then reproduce it from memory.',
            'Rhythm: tap in time with the beat — Perfect, Good, and Miss windows affect scoring.',
            'Quiz: answer a trivia question correctly to pass.',
            'Parry: time your taps to block incoming strikes with Perfect or Good windows.',
            'Route: trace a highlighted path across a 3×3 node grid in order.',
            'Sigil: memorize and repeat a 4-sigil sequence (△ ○ □ ◇).',
            'Arrow: aim and shoot a moving target — hit rate determines the outcome.',
        ],
        deep: [
            'Microevent families include QTE, Mash, Pattern, Rhythm, Quiz, Parry, Route, Sigil, and Arrow.',
            'Ability effects can branch or scale from microevent results, affecting damage, utility, or reliability.',
        ],
        bullets: [
            'QTE: timed precision stop — click when the indicator is in the zone.',
            'Mash: rapid input meter race — spam clicks to maximize score.',
            'Pattern: memory reproduction sequence — repeat the order shown.',
            'Rhythm: hit-window timing accuracy — synced taps score higher.',
            'Quiz: correct answer for success branch — wrong answer or timeout fails.',
            'Parry: block incoming strikes by timing taps — chains reward higher scores.',
            'Route: trace the highlighted node path on a grid in the correct order.',
            'Sigil: memorize and replay a 4-symbol sigil sequence without error.',
            'Arrow: aim at a moving target and fire — hits per shot determine scaled result.',
        ],
    },
    {
        id: 'limits',
        title: 'Battle Limits',
        brief: [
            'Only 1 card can be played from hand each turn.',
            'Max in-play battlers scale by player count and settings.',
            'Ability uses are limited by per-ability limits.',
        ],
        deep: [
            'If your deck is empty, draw is skipped instead of causing a loss.',
            'Eliminated players are skipped in turn order until the match ends.',
        ],
    },
];

export const DEFAULT_BRIEF_SECTION_IDS = ['objective', 'turnFlow', 'actions', 'combat', 'directAttack', 'limits'];

export const DEFAULT_DEEP_SECTION_IDS = RULES_SECTIONS.map((section) => section.id);

export const getRuleSections = (sectionIds = DEFAULT_DEEP_SECTION_IDS) => {
    const allowed = new Set(sectionIds);
    return RULES_SECTIONS.filter((section) => allowed.has(section.id));
};
