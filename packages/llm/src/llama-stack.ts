import type { HealthStatus, ServicesConfig } from '@empery/shared';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface RankedDocument {
  index: number;
  text: string;
  score: number;
}

export class LlamaStack {
  constructor(private readonly config: ServicesConfig['llama']) {}

  async healthCheck(): Promise<HealthStatus[]> {
    return Promise.all([
      this.checkEndpoint('llama-chat', `${this.config.chat.url.replace(/\/v1$/, '')}/health`),
      this.checkEndpoint('llama-embeddings', `${this.config.embeddings.url.replace(/\/v1$/, '')}/health`),
      this.checkEndpoint('llama-rerank', `${this.config.rerank.url}/health`),
    ]);
  }

  private async checkEndpoint(service: string, url: string): Promise<HealthStatus> {
    const started = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const ok = res.ok;
      return {
        service,
        ok,
        latencyMs: Date.now() - started,
        detail: ok ? 'ok' : `HTTP ${res.status}`,
      };
    } catch (err) {
      return {
        service,
        ok: false,
        latencyMs: Date.now() - started,
        detail: err instanceof Error ? err.message : 'unknown error',
      };
    }
  }

  async chat(messages: ChatMessage[], maxTokens = 512): Promise<string> {
    const res = await fetch(`${this.config.chat.url}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.chat.model,
        messages,
        max_tokens: maxTokens,
        stream: false,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      throw new Error(`LLM chat failed: HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return data.choices?.[0]?.message?.content?.trim() ?? '';
  }

  async embed(texts: string[]): Promise<number[][]> {
    try {
      const res = await fetch(`${this.config.embeddings.url}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.embeddings.model,
          input: texts,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        throw new Error(`Embeddings failed: HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        data?: Array<{ embedding?: number[] }>;
      };

      return (data.data ?? []).map((item) => item.embedding ?? []);
    } catch (err) {
      console.warn('[llm] embeddings unavailable, using empty vectors', err);
      return texts.map(() => []);
    }
  }

  async rerank(query: string, documents: string[], topN = 5): Promise<RankedDocument[]> {
    if (documents.length === 0) return [];

    try {
      const res = await fetch(`${this.config.rerank.url}/v1/rerank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.rerank.model,
          query,
          top_n: Math.min(topN, documents.length),
          documents,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        throw new Error(`Rerank failed: HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        results?: Array<{ index: number; relevance_score: number }>;
      };

      return (data.results ?? [])
        .map((item) => ({
          index: item.index,
          text: documents[item.index] ?? '',
          score: item.relevance_score,
        }))
        .sort((a, b) => b.score - a.score);
    } catch (err) {
      console.warn('[llm] rerank unavailable, returning documents as-is', err);
      return documents.slice(0, topN).map((text, index) => ({ index, text, score: 0 }));
    }
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export class LoreRAG {
  constructor(
    private readonly llm: LlamaStack,
    private readonly chunks: string[],
  ) {}

  async retrieve(query: string, topN = 5): Promise<string[]> {
    if (this.chunks.length === 0) return [];

    const [queryVec] = await this.llm.embed([query]);
    const chunkVecs = await this.llm.embed(this.chunks);

    const scored = this.chunks
      .map((text, index) => ({
        text,
        score: this.llm.cosineSimilarity(queryVec ?? [], chunkVecs[index] ?? []),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((item) => item.text);

    const reranked = await this.llm.rerank(query, scored, topN);
    return reranked.map((item) => item.text);
  }
}

export { LlamaStack as default };
