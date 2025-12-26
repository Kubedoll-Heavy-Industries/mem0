/**
 * Test small Ollama models for mem0 compatibility.
 *
 * Tests whether smollm:360m can handle JSON output format
 * required for memory extraction.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GenericContainer, Wait } from "testcontainers";

describe("Ollama Small Models", () => {
  let ollamaHost: string;
  let ollamaContainer: Awaited<ReturnType<GenericContainer["start"]>>;

  beforeAll(async () => {
    console.log("Starting Ollama container...");

    ollamaContainer = await new GenericContainer("ollama/ollama:latest")
      .withExposedPorts(11434)
      .withWaitStrategy(Wait.forHttp("/api/tags", 11434).forStatusCode(200))
      .start();

    ollamaHost = `http://${ollamaContainer.getHost()}:${ollamaContainer.getMappedPort(11434)}`;
    console.log(`Ollama running at ${ollamaHost}`);

    // Pull the small models
    console.log("Pulling smollm:360m...");
    const pullLlm = await ollamaContainer.exec([
      "ollama",
      "pull",
      "smollm:360m",
    ]);
    console.log(`Pull LLM exit code: ${pullLlm.exitCode}`);
    if (pullLlm.exitCode !== 0) {
      console.error(pullLlm.output);
    }

    console.log("Pulling all-minilm:22m...");
    const pullEmbed = await ollamaContainer.exec([
      "ollama",
      "pull",
      "all-minilm:22m",
    ]);
    console.log(`Pull embeddings exit code: ${pullEmbed.exitCode}`);
    if (pullEmbed.exitCode !== 0) {
      console.error(pullEmbed.output);
    }
  });

  afterAll(async () => {
    if (ollamaContainer) {
      await ollamaContainer.stop();
    }
  });

  it("should list pulled models", async () => {
    const response = await fetch(`${ollamaHost}/api/tags`);
    const data = await response.json();

    console.log(
      "Available models:",
      data.models?.map((m: any) => m.name),
    );

    expect(data.models).toBeDefined();
    expect(data.models.length).toBeGreaterThanOrEqual(2);
  });

  it("should generate embeddings with all-minilm:22m", async () => {
    const response = await fetch(`${ollamaHost}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "all-minilm:22m",
        prompt: "Hello, world!",
      }),
    });

    const data = await response.json();

    console.log(`Embedding dimensions: ${data.embedding?.length}`);

    expect(response.ok).toBe(true);
    expect(data.embedding).toBeDefined();
    expect(data.embedding.length).toBe(384); // all-minilm outputs 384 dims
  });

  it("should generate text with smollm:360m", async () => {
    const response = await fetch(`${ollamaHost}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "smollm:360m",
        prompt: "Say hello in one word:",
        stream: false,
      }),
    });

    const data = await response.json();

    console.log(`Response: ${data.response}`);

    expect(response.ok).toBe(true);
    expect(data.response).toBeDefined();
  });

  it("should generate JSON output with smollm:360m", async () => {
    // This is the critical test - can smollm handle JSON format?
    const response = await fetch(`${ollamaHost}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "smollm:360m",
        prompt: `Extract the memory from this conversation and respond with valid JSON only.

Conversation:
User: My name is Alice and I live in Paris.

Respond with JSON in this exact format:
{"memories": [{"text": "extracted memory here"}]}

JSON:`,
        stream: false,
        format: "json",
      }),
    });

    const data = await response.json();

    console.log(`JSON Response: ${data.response}`);

    expect(response.ok).toBe(true);
    expect(data.response).toBeDefined();

    // Try to parse the response as JSON
    let parsed;
    try {
      parsed = JSON.parse(data.response);
      console.log("Parsed JSON:", JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.error("Failed to parse JSON response:", e);
    }

    expect(parsed).toBeDefined();
    expect(parsed.memories).toBeDefined();
  });

  it("should handle chat format with smollm:360m", async () => {
    const response = await fetch(`${ollamaHost}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "smollm:360m",
        messages: [
          {
            role: "system",
            content:
              "You extract memories from conversations. Respond with JSON only.",
          },
          {
            role: "user",
            content: `Extract memories from: "I love pizza and my favorite color is blue."

Respond with: {"memories": [{"text": "memory"}]}`,
          },
        ],
        stream: false,
        format: "json",
      }),
    });

    const data = await response.json();

    console.log(`Chat Response: ${data.message?.content}`);

    expect(response.ok).toBe(true);
    expect(data.message?.content).toBeDefined();

    let parsed;
    try {
      parsed = JSON.parse(data.message.content);
      console.log("Parsed chat JSON:", JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.error("Failed to parse chat JSON:", e);
    }

    expect(parsed).toBeDefined();
  });
});
