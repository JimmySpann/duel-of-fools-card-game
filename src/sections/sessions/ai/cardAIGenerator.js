import { pipeline } from '@xenova/transformers';

export const AI_MODEL_PRESETS = [
    {
        id: 'onnx-community/Qwen2.5-0.5B-Instruct',
        label: 'Qwen 2.5 0.5B (Small)',
        family: 'qwen',
    },
    {
        id: 'onnx-community/Llama-3.2-1B-Instruct',
        label: 'Llama 3.2 1B (Small)',
        family: 'llama',
    },
    {
        id: 'onnx-community/SmolLM2-360M-Instruct',
        label: 'SmolLM2 360M (Tiny)',
        family: 'small',
    },
];

const generatorCache = new Map();

const getGenerator = async (modelId) => {
    if (generatorCache.has(modelId)) return generatorCache.get(modelId);

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

const runGeneration = async (modelId, prompt, maxNewTokens = 360) => {
    const generator = await getGenerator(modelId);
    const output = await generator(prompt, {
        max_new_tokens: maxNewTokens,
        temperature: 0.7,
        top_p: 0.92,
        do_sample: true,
        repetition_penalty: 1.08,
        return_full_text: false,
    });

    const text = normalizeOutputText(output);
    const parsed = extractJsonObject(text);

    if (!parsed) {
        throw new Error('Model returned malformed JSON. Try again or switch models.');
    }

    return parsed;
};

export const generateCardConcept = async ({ modelId, userPrompt }) => {
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

    return runGeneration(modelId, prompt, 280);
};

export const generateCardDraft = async ({ modelId, userPrompt, concept, officialAbilityNames }) => {
    const conceptText = concept ? JSON.stringify(concept) : '{}';
    const abilitiesList = (officialAbilityNames || []).join(', ');

    const prompt = `You are an assistant for a fantasy card game custom builder.
Create a full draft card from user request + concept.
Return ONLY JSON, no markdown.
Follow these constraints:
- attack, defense, evasion, agility are integers from 0 to 20
- health is integer from 1 to 30
- elements keys must include: fire, ice, electric, earth, death, water, air, normal (values 0..5)
- abilityNames: choose 1-3 names from this list only: ${abilitiesList}
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

    return runGeneration(modelId, prompt, 420);
};
