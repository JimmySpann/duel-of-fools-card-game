/**
 * Feature flags — set to true to re-enable a feature globally.
 */
export const FEATURES = {
    showElements: false,
    showPassives: false,
};

/**
 * Background image groups.
 * Each key is a section name passed to useBackground(group).
 * Each array contains filenames (no extension) from public/img/background/.
 * To add a new background: drop the image in public/img/background/ and add its filename below.
 * To add a new group: add a key and call useBackground('yourGroup') in the target component.
 */
export const BACKGROUND_GROUPS = {
    /** Login and sign-up screens */
    auth: [
        'background-1',
        'background-4',
        'background-5',
        'background-6',
        'background-9',
    ],

    /** Sessions list, session creation, and pre-game lobby */
    sessions: [
        'background-1',
        'background-3',
        'background-4',
        'background-5',
        'background-6',
        'background-9',
        'background-10',
    ],

    /** In-game view */
    game: [
        'background-2',
        'background-7',
        'background-8',
        'background-4',
        'background-3',
    ],
};

/** Base public path for background images (no trailing slash needed on filenames). */
export const BACKGROUND_BASE = '/img/background/';
