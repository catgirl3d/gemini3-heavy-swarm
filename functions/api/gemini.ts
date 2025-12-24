import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env, GeminiRequest } from '../_types';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  
  try {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error: API key missing' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let body: GeminiRequest;
    try {
      body = await request.json() as GeminiRequest;
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { model, contents, generationConfig, systemInstruction, tools } = body;

    // Validation: GeminiRequest requires contents
    if (!contents || !Array.isArray(contents) || contents.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing or invalid "contents" in request body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Determine model based on proxy mode
    // If GEMINI_PROXY_MODE is 'demo' OR not set, enforce flash-lite to prevent abuse
    // Only if GEMINI_PROXY_MODE is 'private', allow the requested model
    const isPrivateMode = env.GEMINI_PROXY_MODE === 'private';
    const targetModel = isPrivateMode ? (model || 'gemini-2.5-flash-lite') : 'gemini-2.5-flash-lite';

    // Construct the Google API URL
    // Note: Using the streamGenerateContent endpoint for streaming
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:streamGenerateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents,
        generationConfig,
        systemInstruction,
        tools
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: `Gemini API error: ${response.status}`, details: errorText }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Proxy the stream directly
    // The Google API returns a stream of JSON objects (SSE-like but just concatenated JSONs in an array structure usually, 
    // or specifically for streamGenerateContent, it returns a stream of partial JSON responses)
    // We will pass the raw stream to the client to handle parsing
    return new Response(response.body, {
      headers: {
        'Content-Type': 'application/json',
      }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
