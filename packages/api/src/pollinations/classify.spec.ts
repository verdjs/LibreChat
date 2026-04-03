import axios from 'axios';

jest.mock('axios');

import { classifyIntent, enhanceImagePrompt } from './classify';
import { processPollinationsRequest, DEFAULT_TEXT_MODEL, IMAGE_MODEL } from './service';

const mockedAxios = axios as jest.Mocked<typeof axios>;

const TEST_API_KEY = 'sk-test-key';
const TEST_MESSAGE = 'Hello, tell me a joke';
const TEST_IMAGE_MESSAGE = 'Draw a cat in space';
const TEST_VIDEO_MESSAGE = 'Make a video of a sunset';

function makeChatResponse(content: string) {
  return { data: { choices: [{ message: { content } }] } };
}

function makeImageResponse(url: string) {
  return { data: { data: [{ url }] } };
}

function setupAxiosClientMock(): jest.Mock {
  const mockClientPost = jest.fn();
  mockedAxios.create.mockReturnValue({ post: mockClientPost } as ReturnType<typeof axios.create>);
  return mockClientPost;
}

// ─── classifyIntent ───────────────────────────────────────────────────────────

describe('classifyIntent', () => {
  let mockClientPost: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClientPost = setupAxiosClientMock();
  });

  it('returns "text" for a general text message', async () => {
    mockClientPost.mockResolvedValueOnce(makeChatResponse('text'));
    const result = await classifyIntent(TEST_MESSAGE, TEST_API_KEY);
    expect(result).toBe('text');
  });

  it('returns "image" when model responds with "image"', async () => {
    mockClientPost.mockResolvedValueOnce(makeChatResponse('image'));
    const result = await classifyIntent(TEST_IMAGE_MESSAGE, TEST_API_KEY);
    expect(result).toBe('image');
  });

  it('returns "video" when model responds with "video"', async () => {
    mockClientPost.mockResolvedValueOnce(makeChatResponse('video'));
    const result = await classifyIntent(TEST_VIDEO_MESSAGE, TEST_API_KEY);
    expect(result).toBe('video');
  });

  it('defaults to "text" for unrecognised model output', async () => {
    mockClientPost.mockResolvedValueOnce(makeChatResponse('unknown-intent'));
    const result = await classifyIntent(TEST_MESSAGE, TEST_API_KEY);
    expect(result).toBe('text');
  });

  it('calls Pollinations /v1/chat/completions with nova-fast model', async () => {
    mockClientPost.mockResolvedValueOnce(makeChatResponse('text'));
    await classifyIntent(TEST_MESSAGE, TEST_API_KEY);

    expect(mockClientPost).toHaveBeenCalledWith(
      '/v1/chat/completions',
      expect.objectContaining({ model: 'nova-fast' }),
    );
  });

  it('trims and lowercases the model response', async () => {
    mockClientPost.mockResolvedValueOnce(makeChatResponse('  IMAGE  '));
    const result = await classifyIntent(TEST_IMAGE_MESSAGE, TEST_API_KEY);
    expect(result).toBe('image');
  });
});

// ─── enhanceImagePrompt ───────────────────────────────────────────────────────

describe('enhanceImagePrompt', () => {
  let mockClientPost: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClientPost = setupAxiosClientMock();
  });

  it('returns the enhanced prompt from the model', async () => {
    const enhanced = 'A majestic cat floating in a vivid, star-filled outer space background';
    mockClientPost.mockResolvedValueOnce(makeChatResponse(enhanced));
    const result = await enhanceImagePrompt(TEST_IMAGE_MESSAGE, TEST_API_KEY);
    expect(result).toBe(enhanced);
  });

  it('falls back to the original message when model returns empty content', async () => {
    mockClientPost.mockResolvedValueOnce(makeChatResponse(''));
    const result = await enhanceImagePrompt(TEST_IMAGE_MESSAGE, TEST_API_KEY);
    expect(result).toBe(TEST_IMAGE_MESSAGE);
  });

  it('calls Pollinations /v1/chat/completions with nova-fast model', async () => {
    mockClientPost.mockResolvedValueOnce(makeChatResponse('enhanced prompt'));
    await enhanceImagePrompt(TEST_IMAGE_MESSAGE, TEST_API_KEY);

    expect(mockClientPost).toHaveBeenCalledWith(
      '/v1/chat/completions',
      expect.objectContaining({ model: 'nova-fast' }),
    );
  });
});

// ─── processPollinationsRequest ───────────────────────────────────────────────

describe('processPollinationsRequest', () => {
  let mockClientPost: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClientPost = setupAxiosClientMock();
  });

  it('routes text intent to nova-fast and returns text result', async () => {
    mockClientPost.mockResolvedValueOnce(makeChatResponse('text'));
    mockedAxios.post.mockResolvedValueOnce({
      data: { choices: [{ message: { content: 'A joke!' } }] },
    });

    const result = await processPollinationsRequest({
      userMessage: TEST_MESSAGE,
      apiKey: TEST_API_KEY,
    });

    expect(result.type).toBe('text');
    if (result.type === 'text') {
      expect(result.content).toBe('A joke!');
      expect(result.model).toBe(DEFAULT_TEXT_MODEL); // 'nova-fast'
    }
  });

  it('respects caller-supplied model override for text intent', async () => {
    mockClientPost.mockResolvedValueOnce(makeChatResponse('text'));
    mockedAxios.post.mockResolvedValueOnce({
      data: { choices: [{ message: { content: 'Hi' } }] },
    });

    const result = await processPollinationsRequest({
      userMessage: TEST_MESSAGE,
      apiKey: TEST_API_KEY,
      model: 'openai-large',
    });

    expect(result.type).toBe('text');
    if (result.type === 'text') {
      expect(result.model).toBe('openai-large');
    }
  });

  it('routes image intent: enhances prompt then calls /v1/images/generations with zimage', async () => {
    const enhanced = 'A detailed cosmic cat';
    mockClientPost
      .mockResolvedValueOnce(makeChatResponse('image')) // classify
      .mockResolvedValueOnce(makeChatResponse(enhanced)); // enhance
    mockedAxios.post.mockResolvedValueOnce(makeImageResponse('https://cdn.pollinations.ai/cat.jpg'));

    const result = await processPollinationsRequest({
      userMessage: TEST_IMAGE_MESSAGE,
      apiKey: TEST_API_KEY,
    });

    expect(result.type).toBe('image');
    if (result.type === 'image') {
      expect(result.enhancedPrompt).toBe(enhanced);
      expect(result.url).toBe('https://cdn.pollinations.ai/cat.jpg');
    }

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/v1/images/generations'),
      expect.objectContaining({ model: IMAGE_MODEL, prompt: enhanced }),
      expect.any(Object),
    );
  });

  it('throws when image generation returns no URL', async () => {
    const enhanced = 'A detailed cosmic cat';
    mockClientPost
      .mockResolvedValueOnce(makeChatResponse('image'))
      .mockResolvedValueOnce(makeChatResponse(enhanced));
    mockedAxios.post.mockResolvedValueOnce({ data: { data: [] } });

    await expect(
      processPollinationsRequest({ userMessage: TEST_IMAGE_MESSAGE, apiKey: TEST_API_KEY }),
    ).rejects.toThrow('no URL');
  });

  it('throws when text completion returns no content', async () => {
    mockClientPost.mockResolvedValueOnce(makeChatResponse('text'));
    mockedAxios.post.mockResolvedValueOnce({ data: { choices: [] } });

    await expect(
      processPollinationsRequest({ userMessage: TEST_MESSAGE, apiKey: TEST_API_KEY }),
    ).rejects.toThrow('no content');
  });

  it('returns "coming soon" placeholder for video intent', async () => {
    mockClientPost.mockResolvedValueOnce(makeChatResponse('video'));

    const result = await processPollinationsRequest({
      userMessage: TEST_VIDEO_MESSAGE,
      apiKey: TEST_API_KEY,
    });

    expect(result.type).toBe('video');
    if (result.type === 'video') {
      expect(result.message).toMatch(/coming soon/i);
    }
  });

  it('passes the full conversation history for multi-turn text requests', async () => {
    const history = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: TEST_MESSAGE },
    ];

    mockClientPost.mockResolvedValueOnce(makeChatResponse('text'));
    mockedAxios.post.mockResolvedValueOnce({
      data: { choices: [{ message: { content: 'reply' } }] },
    });

    await processPollinationsRequest({
      userMessage: TEST_MESSAGE,
      apiKey: TEST_API_KEY,
      messages: history,
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/v1/chat/completions'),
      expect.objectContaining({ messages: history }),
      expect.any(Object),
    );
  });
});
