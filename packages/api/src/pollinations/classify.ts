import axios from 'axios';

const DEFAULT_BASE_URL = 'https://gen.pollinations.ai';

/** Classifier model — Amazon Nova Micro via Pollinations */
const CLASSIFIER_MODEL = 'nova-fast';

/** System prompt for intent classification */
const CLASSIFY_SYSTEM =
  'You are an intent classifier. Given a user message, respond with exactly one lowercase word:\n' +
  '- "image" if the user wants to generate an image, picture, photo, or illustration\n' +
  '- "video" if the user wants to generate a video, animation, or clip\n' +
  '- "text" for all other requests (questions, coding, analysis, conversation, etc.)';

/** System prompt for image prompt enhancement */
const ENHANCE_SYSTEM =
  'You are an image prompt enhancer. Given a user image request, rewrite it as a detailed, ' +
  'high-quality image generation prompt. Be concise but descriptive. Return only the enhanced ' +
  'prompt with no explanation.';

export type IntentType = 'text' | 'image' | 'video';

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

function buildClient(baseURL: string, apiKey: string) {
  return axios.create({
    baseURL,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Classifies a user message's intent as 'text', 'image', or 'video'
 * using Pollinations `nova-fast` model.
 */
export async function classifyIntent(userMessage: string, apiKey: string): Promise<IntentType> {
  const baseURL = process.env.POLLINATIONS_BASE_URL ?? DEFAULT_BASE_URL;
  const client = buildClient(baseURL, apiKey);

  const response = await client.post<ChatCompletionResponse>('/v1/chat/completions', {
    model: CLASSIFIER_MODEL,
    messages: [
      { role: 'system', content: CLASSIFY_SYSTEM },
      { role: 'user', content: userMessage },
    ],
    temperature: 0,
  });

  const raw = response.data.choices[0]?.message?.content?.trim().toLowerCase() ?? 'text';
  if (raw === 'image' || raw === 'video') return raw;
  return 'text';
}

/**
 * Enhances a user's image description into a detailed image generation prompt
 * using Pollinations `nova-fast` model.
 */
export async function enhanceImagePrompt(userMessage: string, apiKey: string): Promise<string> {
  const baseURL = process.env.POLLINATIONS_BASE_URL ?? DEFAULT_BASE_URL;
  const client = buildClient(baseURL, apiKey);

  const response = await client.post<ChatCompletionResponse>('/v1/chat/completions', {
    model: CLASSIFIER_MODEL,
    messages: [
      { role: 'system', content: ENHANCE_SYSTEM },
      { role: 'user', content: userMessage },
    ],
    temperature: 0.7,
  });

  return response.data.choices[0]?.message?.content?.trim() ?? userMessage;
}
