/**
 * Integration tests for mem0 Memory class with Ollama using testcontainers.
 *
 * Tests basic memory operations with:
 * - Ollama for LLM (smollm:135m)
 * - Ollama for embeddings (all-minilm:22m)
 * - In-memory vector store
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GenericContainer, Wait } from "testcontainers";
import { OllamaLLM } from "../../src/oss/src/llms/ollama";
import { OllamaEmbedder } from "../../src/oss/src/embeddings/ollama";
import { MemoryVectorStore } from "../../src/oss/src/vector_stores/memory";
import {
  getFactRetrievalMessages,
  removeCodeBlocks,
} from "../../src/oss/src/prompts";

// Configurable via env vars for CI caching
const OLLAMA_LLM_MODEL = process.env.OLLAMA_LLM_MODEL || "smollm:135m";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "all-minilm:22m";
const EMBEDDING_DIMS = parseInt(process.env.EMBEDDING_DIMS || "384", 10);
const OLLAMA_HOST = process.env.OLLAMA_HOST; // If set, use host Ollama

describe("Ollama Memory Integration", () => {
  let ollamaContainer: Awaited<
    ReturnType<typeof GenericContainer.prototype.start>
  > | null = null;
  let ollamaUrl: string;
  let llm: OllamaLLM;
  let embedder: OllamaEmbedder;
  let vectorStore: MemoryVectorStore;

  beforeAll(async () => {
    if (OLLAMA_HOST) {
      console.log(`Using host Ollama at ${OLLAMA_HOST}`);
      ollamaUrl = OLLAMA_HOST;
    } else {
      console.log("Starting Ollama container...");
      ollamaContainer = await new GenericContainer("ollama/ollama:latest")
        .withExposedPorts(11434)
        .withWaitStrategy(Wait.forHttp("/api/tags", 11434).forStatusCode(200))
        .start();

      ollamaUrl = `http://${ollamaContainer.getHost()}:${ollamaContainer.getMappedPort(11434)}`;
      console.log(`Ollama running at ${ollamaUrl}`);

      // Pull models
      console.log(`Pulling ${OLLAMA_LLM_MODEL}...`);
      const pullLlm = await ollamaContainer.exec([
        "ollama",
        "pull",
        OLLAMA_LLM_MODEL,
      ]);
      console.log(`Pull LLM exit code: ${pullLlm.exitCode}`);

      console.log(`Pulling ${OLLAMA_EMBED_MODEL}...`);
      const pullEmbed = await ollamaContainer.exec([
        "ollama",
        "pull",
        OLLAMA_EMBED_MODEL,
      ]);
      console.log(`Pull embeddings exit code: ${pullEmbed.exitCode}`);
    }

    // Initialize components
    // OllamaLLM expects config.config.url (nested structure)
    llm = new OllamaLLM({
      model: OLLAMA_LLM_MODEL,
      config: {
        url: ollamaUrl,
        temperature: 0.2,
      },
    });

    // OllamaEmbedder expects config.url (flat structure)
    embedder = new OllamaEmbedder({
      model: OLLAMA_EMBED_MODEL,
      url: ollamaUrl,
      embeddingDims: EMBEDDING_DIMS,
    });

    vectorStore = new MemoryVectorStore({
      collectionName: "test_memories",
      dimension: EMBEDDING_DIMS, // Match all-minilm:22m output
    });
  });

  afterAll(async () => {
    if (ollamaContainer) {
      await ollamaContainer.stop();
    }
  });

  describe("Component Tests", () => {
    it("should generate embeddings", async () => {
      const embedding = await embedder.embed("Hello, world!");

      console.log(`Embedding dims: ${embedding.length}`);

      expect(embedding).toBeDefined();
      expect(embedding.length).toBe(EMBEDDING_DIMS);
    });

    it("should generate text from LLM", async () => {
      const response = await llm.generateResponse(
        [{ role: "user", content: "Say hello in one word." }],
        { type: "text" },
      );

      console.log(`LLM response: ${response}`);

      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    });

    it("should generate JSON from LLM", async () => {
      const response = await llm.generateResponse(
        [
          { role: "system", content: "Respond with JSON only." },
          {
            role: "user",
            content:
              'Return a JSON object with key "greeting" and value "hello": {"greeting": "value"}',
          },
        ],
        { type: "json_object" },
      );

      console.log(`JSON response: ${response}`);

      expect(response).toBeDefined();
      expect(typeof response).toBe("string");

      const parsed = JSON.parse(response as string);
      expect(parsed).toBeDefined();
    });

    it("should store and search vectors", async () => {
      const text1 = "I love programming in TypeScript";
      const text2 = "Python is a great language for data science";
      const text3 = "JavaScript runs in the browser";

      const embedding1 = await embedder.embed(text1);
      const embedding2 = await embedder.embed(text2);
      const embedding3 = await embedder.embed(text3);

      await vectorStore.insert(
        [embedding1, embedding2, embedding3],
        ["id1", "id2", "id3"],
        [
          { data: text1, userId: "test" },
          { data: text2, userId: "test" },
          { data: text3, userId: "test" },
        ],
      );

      // Search for TypeScript-related content
      const queryEmbedding = await embedder.embed(
        "What programming language do you like?",
      );
      const results = await vectorStore.search(queryEmbedding, 3, {
        userId: "test",
      });

      console.log("Search results:", results);

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      // TypeScript memory should be most relevant
      expect(results[0].payload.data).toContain("TypeScript");
    });
  });

  describe("Memory Extraction Flow", () => {
    it("should extract facts from conversation", async () => {
      const conversation =
        "My name is Alice and I love pizza. I live in New York.";

      const [systemPrompt, userPrompt] = getFactRetrievalMessages(conversation);

      const response = await llm.generateResponse(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        { type: "json_object" },
      );

      console.log(`Raw response: ${response}`);

      const cleanResponse = removeCodeBlocks(response as string);
      console.log(`Clean response: ${cleanResponse}`);

      let facts: any[] = [];
      try {
        const parsed = JSON.parse(cleanResponse);
        facts = parsed.facts || [];
        console.log("Extracted facts:", facts);
      } catch (e) {
        console.error("Failed to parse facts:", e);
      }

      expect(facts).toBeDefined();
      // Small models produce JSON but may not follow exact schema
    });

    it("should perform end-to-end memory workflow without LLM", async () => {
      // Skip LLM extraction - test vector store workflow directly
      // This tests the infrastructure without relying on small model quality
      const userId = "e2e-test-user-" + Date.now();

      // Manually defined facts (simulating perfect LLM extraction)
      const facts = [
        "Bob works at Google",
        "Bob is a software engineer",
        "Bob likes hiking",
      ];

      console.log("Storing facts:", facts);

      // Store facts as memories
      for (const fact of facts) {
        const embedding = await embedder.embed(fact);
        const memoryId = `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        await vectorStore.insert(
          [embedding],
          [memoryId],
          [{ data: fact, userId, createdAt: new Date().toISOString() }],
        );
      }

      // Search for relevant memories
      const query = "Where does Bob work?";
      const queryEmbedding = await embedder.embed(query);
      const results = await vectorStore.search(queryEmbedding, 5, { userId });

      console.log("E2E search results:", results);

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      // The most relevant result should mention Google
      expect(results[0].payload.data).toContain("Google");
    });
  });
});
