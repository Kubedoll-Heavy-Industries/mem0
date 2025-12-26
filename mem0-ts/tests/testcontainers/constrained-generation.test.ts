/**
 * Test constrained generation with Ollama JSON schemas.
 *
 * This demonstrates that passing a Zod schema to Ollama enforces
 * the output format, preventing the model from deviating.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GenericContainer, Wait } from "testcontainers";
import { z } from "zod";
import { OllamaLLM } from "../../src/oss/src/llms/ollama";
import { FactRetrievalSchema } from "../../src/oss/src/prompts";

const OLLAMA_LLM_MODEL = "smollm:135m"; // Tiny model - 92MB

describe("Constrained Generation", () => {
  let ollamaContainer: Awaited<
    ReturnType<typeof GenericContainer.prototype.start>
  >;
  let ollamaUrl: string;
  let llm: OllamaLLM;

  beforeAll(async () => {
    console.log("Starting Ollama container...");
    ollamaContainer = await new GenericContainer("ollama/ollama:latest")
      .withExposedPorts(11434)
      .withWaitStrategy(Wait.forHttp("/api/tags", 11434).forStatusCode(200))
      .start();

    ollamaUrl = `http://${ollamaContainer.getHost()}:${ollamaContainer.getMappedPort(11434)}`;
    console.log(`Ollama running at ${ollamaUrl}`);

    console.log(`Pulling ${OLLAMA_LLM_MODEL}...`);
    await ollamaContainer.exec(["ollama", "pull", OLLAMA_LLM_MODEL]);

    llm = new OllamaLLM({
      model: OLLAMA_LLM_MODEL,
      config: { url: ollamaUrl },
    });
  });

  afterAll(async () => {
    if (ollamaContainer) {
      await ollamaContainer.stop();
    }
  });

  it("should produce unconstrained JSON (may not match schema)", async () => {
    // Without schema constraint - model can output any JSON structure
    const response = await llm.generateResponse(
      [
        {
          role: "user",
          content: `Extract facts from: "Alice lives in Paris and loves coffee."
Return JSON with a "facts" key containing an array of strings.`,
        },
      ],
      { type: "json_object" }, // Just "json" mode, no schema
    );

    console.log("Unconstrained response:", response);

    const parsed = JSON.parse(response as string);
    console.log("Parsed unconstrained:", JSON.stringify(parsed, null, 2));

    // The model might return anything - objects, nested structures, etc.
    expect(parsed).toBeDefined();
    // Note: This often fails because small models don't follow instructions well
  });

  it("should produce constrained JSON (must match schema)", async () => {
    // With schema constraint - model MUST output this exact structure
    const response = await llm.generateResponse(
      [
        {
          role: "user",
          content: `Extract facts from: "Alice lives in Paris and loves coffee."
Return the facts as strings in the facts array.`,
        },
      ],
      {
        type: "json_object",
        schema: FactRetrievalSchema, // Pass the Zod schema for constrained generation
      },
    );

    console.log("Constrained response:", response);

    const parsed = JSON.parse(response as string);
    console.log("Parsed constrained:", JSON.stringify(parsed, null, 2));

    // With schema constraint, the output MUST have the right structure
    expect(parsed).toBeDefined();
    expect(parsed.facts).toBeDefined();
    expect(Array.isArray(parsed.facts)).toBe(true);

    // Validate with Zod to ensure it matches the schema
    const validated = FactRetrievalSchema.safeParse(parsed);
    console.log("Zod validation:", validated);
    expect(validated.success).toBe(true);

    if (validated.success) {
      // All facts should be strings
      for (const fact of validated.data.facts) {
        expect(typeof fact).toBe("string");
      }
    }
  });

  it("should enforce custom schema", async () => {
    // Define a custom schema
    const CustomSchema = z.object({
      name: z.string(),
      age: z.number(),
      hobbies: z.array(z.string()),
    });

    const response = await llm.generateResponse(
      [
        {
          role: "user",
          content: `Create a profile for someone named Bob who is 30 and likes hiking and reading.`,
        },
      ],
      {
        type: "json_object",
        schema: CustomSchema,
      },
    );

    console.log("Custom schema response:", response);

    const parsed = JSON.parse(response as string);
    console.log("Parsed custom:", JSON.stringify(parsed, null, 2));

    // Validate against custom schema
    const validated = CustomSchema.safeParse(parsed);
    console.log("Custom validation:", validated);
    expect(validated.success).toBe(true);

    if (validated.success) {
      expect(validated.data.name).toBeDefined();
      expect(typeof validated.data.age).toBe("number");
      expect(Array.isArray(validated.data.hobbies)).toBe(true);
    }
  });
});
