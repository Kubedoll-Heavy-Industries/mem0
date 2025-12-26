import logging
import threading

import httpx

import mem0

try:
    import litellm
except ImportError:
    litellm = None

from mem0 import Memory, MemoryClient
from mem0.configs.prompts import MEMORY_ANSWER_PROMPT
from mem0.memory.telemetry import capture_client_event, capture_event

logger = logging.getLogger(__name__)


class Mem0:
    def __init__(
        self,
        config: dict | None = None,
        api_key: str | None = None,
        host: str | None = None,
    ):
        if api_key:
            self.mem0_client = MemoryClient(api_key, host)
        else:
            self.mem0_client = Memory.from_config(config) if config else Memory()

        self.chat = Chat(self.mem0_client)


class Chat:
    def __init__(self, mem0_client):
        self.completions = Completions(mem0_client)


class Completions:
    def __init__(self, mem0_client):
        self.mem0_client = mem0_client

    def create(
        self,
        model: str,
        messages: list | None = None,
        # Mem0 arguments
        user_id: str | None = None,
        agent_id: str | None = None,
        run_id: str | None = None,
        metadata: dict | None = None,
        filters: dict | None = None,
        limit: int | None = 10,
        # LLM arguments
        timeout: float | str | httpx.Timeout | None = None,
        temperature: float | None = None,
        top_p: float | None = None,
        n: int | None = None,
        stream: bool | None = None,
        stream_options: dict | None = None,
        stop=None,
        max_tokens: int | None = None,
        presence_penalty: float | None = None,
        frequency_penalty: float | None = None,
        logit_bias: dict | None = None,
        user: str | None = None,
        # openai v1.0+ new params
        response_format: dict | None = None,
        seed: int | None = None,
        tools: list | None = None,
        tool_choice: str | dict | None = None,
        logprobs: bool | None = None,
        top_logprobs: int | None = None,
        parallel_tool_calls: bool | None = None,
        deployment_id=None,
        extra_headers: dict | None = None,
        # soon to be deprecated params by OpenAI
        functions: list | None = None,
        function_call: str | None = None,
        # set api_base, api_version, api_key
        base_url: str | None = None,
        api_version: str | None = None,
        api_key: str | None = None,
        model_list: list | None = None,  # pass in a list of api_base,keys, etc.
    ):
        if litellm is None:
            raise ImportError("litellm is required for the proxy module. Install it with: pip install litellm")
        if messages is None:
            messages = []
        if not any([user_id, agent_id, run_id]):
            raise ValueError("One of user_id, agent_id, run_id must be provided")

        if not litellm.supports_function_calling(model):
            raise ValueError(
                f"Model '{model}' does not support function calling. Please use a model that supports function calling."
            )

        prepared_messages = self._prepare_messages(messages)
        if prepared_messages[-1]["role"] == "user":
            self._async_add_to_memory(messages, user_id, agent_id, run_id, metadata, filters)
            relevant_memories = self._fetch_relevant_memories(messages, user_id, agent_id, run_id, filters, limit)
            logger.debug(f"Retrieved {len(relevant_memories)} relevant memories")
            prepared_messages[-1]["content"] = self._format_query_with_memories(messages, relevant_memories)

        response = litellm.completion(
            model=model,
            messages=prepared_messages,
            temperature=temperature,
            top_p=top_p,
            n=n,
            timeout=timeout,
            stream=stream,
            stream_options=stream_options,
            stop=stop,
            max_tokens=max_tokens,
            presence_penalty=presence_penalty,
            frequency_penalty=frequency_penalty,
            logit_bias=logit_bias,
            user=user,
            response_format=response_format,
            seed=seed,
            tools=tools,
            tool_choice=tool_choice,
            logprobs=logprobs,
            top_logprobs=top_logprobs,
            parallel_tool_calls=parallel_tool_calls,
            deployment_id=deployment_id,
            extra_headers=extra_headers,
            functions=functions,
            function_call=function_call,
            base_url=base_url,
            api_version=api_version,
            api_key=api_key,
            model_list=model_list,
        )
        if isinstance(self.mem0_client, Memory):
            capture_event("mem0.chat.create", self.mem0_client)
        else:
            capture_client_event("mem0.chat.create", self.mem0_client)
        return response

    def _prepare_messages(self, messages: list[dict]) -> list[dict]:
        if not messages or messages[0]["role"] != "system":
            return [{"role": "system", "content": MEMORY_ANSWER_PROMPT}, *messages]
        return messages

    def _async_add_to_memory(self, messages, user_id, agent_id, run_id, metadata, filters):
        def add_task():
            logger.debug("Adding to memory asynchronously")
            self.mem0_client.add(
                messages=messages,
                user_id=user_id,
                agent_id=agent_id,
                run_id=run_id,
                metadata=metadata,
                filters=filters,
            )

        threading.Thread(target=add_task, daemon=True).start()

    def _fetch_relevant_memories(self, messages, user_id, agent_id, run_id, filters, limit):
        # Currently, only pass the last 6 messages to the search API to prevent long query
        message_input = [f"{message['role']}: {message['content']}" for message in messages][-6:]
        # TODO: Make it better by summarizing the past conversation
        return self.mem0_client.search(
            query="\n".join(message_input),
            user_id=user_id,
            agent_id=agent_id,
            run_id=run_id,
            filters=filters,
            limit=limit,
        )

    def _format_query_with_memories(self, messages, relevant_memories):
        # Check if self.mem0_client is an instance of Memory or MemoryClient

        entities = []
        if isinstance(self.mem0_client, mem0.memory.main.Memory):
            memories_text = "\n".join(memory["memory"] for memory in relevant_memories["results"])
            if relevant_memories.get("relations"):
                entities = list(relevant_memories["relations"])
        elif isinstance(self.mem0_client, mem0.client.main.MemoryClient):
            memories_text = "\n".join(memory["memory"] for memory in relevant_memories)
        return f"- Relevant Memories/Facts: {memories_text}\n\n- Entities: {entities}\n\n- User Question: {messages[-1]['content']}"
