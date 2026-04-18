import { pipeline } from '@xenova/transformers';

const AI_DEBUG = process.env.NODE_ENV !== 'production';
const aiLog = (...args) => {
    if (!AI_DEBUG) return;
    console.log('[AI]', ...args);
};

export const AI_MODEL_PRESETS = [
    {
        id: 'onnx-community/Bonsai-1.7B-ONNX',
        label: 'Bonsai 1.7B (Small)',
        family: 'bonsai',
    },
    {
        id: 'zsjTiger/Llama-3.2-3B',
        label: 'Llama 3.2 3B (Small)',
        family: 'llama',
    },
    {
        id: 'HuggingFaceTB/SmolLM2-360M-Instruct',
        label: 'SmolLM2 360M (Tiny)',
        family: 'small',
    },
];

const generatorCache = new Map();

const getFallbackModelOrder = (primaryModelId) => {
    const all = AI_MODEL_PRESETS.map((m) => m.id);
    const ordered = [primaryModelId, ...all.filter((id) => id !== primaryModelId)];
    aiLog('Fallback model order:', ordered);
    return ordered.filter(Boolean);
};

const getGenerator = async (modelId) => {
    if (generatorCache.has(modelId)) {
        aiLog('Using cached generator for model:', modelId);
        return generatorCache.get(modelId);
    }

    aiLog('Loading generator for model:', modelId);
    const generatorPromise = pipeline('text-generation', modelId);
    generatorCache.set(modelId, generatorPromise);
    return generatorPromise;
};

const extractJsonObject = (text) => {
    if (!text) return null;

    const codeFenceMatch = text.match(/```json\s*([\s\S]*?)```/i);
    const candidate = codeFenceMatch ? codeFenceMatch[1] : text;

    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end < 0 || end <= start) return null;

    const raw = candidate.slice(start, end + 1);
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

const normalizeOutputText = (result) => {
    if (Array.isArray(result) && result[0]?.generated_text) {
        return String(result[0].generated_text);
    }
    if (typeof result?.generated_text === 'string') {
        return result.generated_text;
    }
    return '';
};

const runGeneration = async (modelId, prompt, options = {}) => {
    const {
        maxNewTokens = 360,
        temperature = 0.7,
        topP = 0.92,
        repetitionPenalty = 1.08,
    } = options;

    aiLog('runGeneration start', {
        modelId,
        promptLength: String(prompt || '').length,
        maxNewTokens,
        temperature,
        topP,
        repetitionPenalty,
    });

    const generator = await getGenerator(modelId);
    const output = await generator(prompt, {
        max_new_tokens: maxNewTokens,
        temperature,
        top_p: topP,
        do_sample: true,
        repetition_penalty: repetitionPenalty,
        return_full_text: false,
    });

    const text = normalizeOutputText(output);
    const parsed = extractJsonObject(text);
    aiLog('runGeneration output received', {
        modelId,
        outputTextLength: text.length,
        parsedJson: !!parsed,
    });

    if (!parsed) {
        aiLog('runGeneration failed JSON parse for model:', modelId);
        throw new Error('Model returned malformed JSON.');
    }

    aiLog('runGeneration success for model:', modelId);
    return parsed;
};

const runGenerationWithFallback = async ({ modelId, prompt, options }) => {
    const order = getFallbackModelOrder(modelId);
    const attempts = [];

    aiLog('runGenerationWithFallback start', {
        primaryModel: modelId,
        attemptsPlanned: order.length,
    });

    for (const currentModelId of order) {
        try {
            aiLog('Attempting generation with model:', currentModelId);
            const parsed = await runGeneration(currentModelId, prompt, options);
            aiLog('Generation succeeded with model:', currentModelId);
            return {
                parsed,
                usedModelId: currentModelId,
                attempts,
            };
        } catch (err) {
            aiLog('Generation failed with model:', currentModelId, err?.message || 'Generation failed');
            attempts.push({ modelId: currentModelId, reason: err?.message || 'Generation failed' });
        }
    }

    aiLog('All fallback attempts failed', attempts);
    throw new Error('All local models failed. Try again, reduce prompt size, or refresh the page.');
};

const buildGenerationOptions = (creativity = 50) => {
    const c = Math.max(0, Math.min(100, Number(creativity) || 0));
    return {
        maxNewTokens: 380,
        temperature: Number((0.35 + (c / 100) * 0.65).toFixed(2)),
        topP: Number((0.78 + (c / 100) * 0.2).toFixed(2)),
        repetitionPenalty: Number((1.12 - (c / 100) * 0.12).toFixed(2)),
    };
};

export const generateCardConcept = async ({ modelId, userPrompt, creativity = 50 }) => {
    aiLog('generateCardConcept start', {
        requestedModel: modelId,
        promptLength: String(userPrompt || '').length,
        creativity,
    });

    const prompt = `You are an assistant for a fantasy card game custom builder.
Return ONLY JSON, no markdown.
JSON schema:
{
  "title": "short concept title",
  "theme": "1 sentence",
  "playstyle": "1 sentence",
  "strengths": ["item1", "item2", "item3"],
  "weaknesses": ["item1", "item2"],
  "abilityIdeas": ["idea1", "idea2", "idea3"]
}
User request: ${userPrompt}`;

    const result = await runGenerationWithFallback({
        modelId,
        prompt,
        options: {
            ...buildGenerationOptions(creativity),
            maxNewTokens: 280,
        },
    });

    aiLog('generateCardConcept complete', {
        usedModelId: result.usedModelId,
        fallbackCount: result.attempts.length,
    });

    return {
        concept: result.parsed,
        usedModelId: result.usedModelId,
        attempts: result.attempts,
    };
};

export const generateCardDraft = async ({
    modelId,
    userPrompt,
    concept,
    officialAbilityNames,
    creativity = 50,
}) => {
    aiLog('generateCardDraft start', {
        requestedModel: modelId,
        promptLength: String(userPrompt || '').length,
        hasConcept: !!concept,
        officialAbilityCount: Array.isArray(officialAbilityNames) ? officialAbilityNames.length : 0,
        creativity,
    });

    const conceptText = concept ? JSON.stringify(concept) : '{}';
    const abilitiesList = (officialAbilityNames || []).join(', ');
    const clampedCreativity = Math.max(0, Math.min(100, Number(creativity) || 0));
    const strictBudgetRule = clampedCreativity <= 45
        ? 'Be strict: keep total stat budget conservative and close to balanced, avoid extreme values.'
        : 'Creativity mode: flavorful variance is allowed, but still obey hard numeric constraints.';

    const prompt = `You are an assistant for a fantasy card game custom builder.
Create a full draft card from user request + concept.
Return ONLY JSON, no markdown.
Follow these constraints:
- attack, defense, evasion, agility are integers from 0 to 20
- health is integer from 1 to 30
- elements keys must include: fire, ice, electric, earth, death, water, air, normal (values 0..5)
- abilityNames: choose 1-3 names from this list only: ${abilitiesList}
${strictBudgetRule}
JSON schema:
{
  "name": "card name",
  "description": "short flavor description",
  "stats": { "attack": 0, "defense": 0, "evasion": 0, "agility": 0, "health": 1 },
  "elements": { "fire":0, "ice":0, "electric":0, "earth":0, "death":0, "water":0, "air":0, "normal":0 },
  "abilityNames": ["Ability A", "Ability B"]
}
User request: ${userPrompt}
Concept: ${conceptText}`;

    const result = await runGenerationWithFallback({
        modelId,
        prompt,
        options: {
            ...buildGenerationOptions(clampedCreativity),
            maxNewTokens: 420,
        },
    });

    aiLog('generateCardDraft complete', {
        usedModelId: result.usedModelId,
        fallbackCount: result.attempts.length,
    });

    return {
        draft: result.parsed,
        usedModelId: result.usedModelId,
        attempts: result.attempts,
    };
};
