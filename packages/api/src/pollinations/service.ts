import axios from 'axios';
import { classifyIntent, enhanceImagePrompt } from './classify';
import type { IntentType } from './classify';

const DEFAULT_BASE_URL = 'https://gen.pollinations.ai';

/** Default text model — also used for intent classification */
export const DEFAULT_TEXT_MODEL = 'nova-fast';
/** Image generation model */
export const IMAGE_MODEL = 'zimage';

export interface PollinationsTextResult {
  type: 'text';
  content: string;
  model: string;
}

export interface PollinationsImageResult {
  type: 'image';
  url: string;
  enhancedPrompt: string;
}

export interface PollinationsVideoResult {
  type: 'video';
  message: string;
}

export type PollinationsResult =
  | PollinationsTextResult
  | PollinationsImageResult
  | PollinationsVideoResult;

export interface PollinationsMessage {
  role: string;
  content: string;
}

export interface PollinationsRequest {
  /** The user's most recent message */
  userMessage: string;
  /** Pollinations API key (`sk_` prefix for server-side use) */
  apiKey: string;
  /** Override the text model (defaults to `nova-fast`) */
  model?: string;
  /** Full conversation history for multi-turn text requests */
  messages?: PollinationsMessage[];
}

interface ImageGenerationResponse {
  data: Array<{ url?: string; b64_json?: string }>;
}

/**
 * Processes a Pollinations request by:
 * 1. Calling `nova-fast` to classify the user's intent (text / image / video).
 * 2. Routing to the appropriate generation flow:
 *    - **image** → enhance prompt with `nova-fast`, generate with `zimage`
 *    - **text**  → chat completion with `nova-fast` (or caller-supplied model)
 *    - **video** → placeholder "coming soon" response
 */
export async function processPollinationsRequest({
  userMessage,
  apiKey,
  model,
  messages = [],
}: PollinationsRequest): Promise<PollinationsResult> {
  const baseURL = process.env.POLLINATIONS_BASE_URL ?? DEFAULT_BASE_URL;
  const intent: IntentType = await classifyIntent(userMessage, apiKey);

  if (intent === 'video') {
    return {
      type: 'video',
      message: 'Video generation is coming soon! Stay tuned.',
    };
  }

  if (intent === 'image') {
    const enhancedPrompt = await enhanceImagePrompt(userMessage, apiKey);

    const response = await axios.post<ImageGenerationResponse>(
      `${baseURL}/v1/images/generations`,
      {
        model: IMAGE_MODEL,
        prompt: enhancedPrompt,
        size: '1024x1024',
        response_format: 'url',
        n: 1,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const url = response.data.data[0]?.url;
    if (!url) {
      throw new Error('Pollinations image generation returned no URL.');
    }

    return { type: 'image', url, enhancedPrompt };
  }

  // text
  const textModel = model ?? DEFAULT_TEXT_MODEL;
  const allMessages: PollinationsMessage[] =
    messages.length > 0 ? messages : [{ role: 'user', content: userMessage }];

  const response = await axios.post<{ choices: Array<{ message: { content: string } }> }>(
    `${baseURL}/v1/chat/completions`,
    { model: textModel, messages: allMessages },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    },
  );

  const content = response.data.choices[0]?.message?.content;
  if (content == null) {
    throw new Error('Pollinations text completion returned no content.');
  }

  return { type: 'text', content, model: textModel };
}
