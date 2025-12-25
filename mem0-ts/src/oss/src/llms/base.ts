import { z } from "zod";
import { Message } from "../types";

export interface LLMResponse {
  content: string;
  role: string;
  toolCalls?: Array<{
    name: string;
    arguments: string;
  }>;
}

export interface ResponseFormat {
  type: string;
  /** Zod schema for constrained generation (supported by Ollama, OpenAI) */
  schema?: z.ZodType;
}

export interface LLM {
  generateResponse(
    messages: Array<{ role: string; content: string }>,
    response_format?: ResponseFormat,
    tools?: any[],
  ): Promise<any>;
  generateChat(messages: Message[]): Promise<LLMResponse>;
}
