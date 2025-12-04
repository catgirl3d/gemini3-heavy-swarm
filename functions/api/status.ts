interface Env {
  GEMINI_API_KEY: string;
  GEMINI_PROXY_MODE?: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context;
  
  return new Response(JSON.stringify({
    hasServerKey: !!env.GEMINI_API_KEY,
    proxyMode: env.GEMINI_PROXY_MODE || 'demo'
  }), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
};