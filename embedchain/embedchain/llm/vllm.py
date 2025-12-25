from collections.abc import Iterable
from typing import Optional

from langchain_community.llms import VLLM as BaseVLLM
from langchain_core.callbacks import CallbackManager, StdOutCallbackHandler, StreamingStdOutCallbackHandler

from embedchain.config import BaseLlmConfig
from embedchain.helpers.json_serializable import register_deserializable
from embedchain.llm.base import BaseLlm


@register_deserializable
class VLLM(BaseLlm):
    def __init__(self, config: Optional[BaseLlmConfig] = None):
        super().__init__(config=config)
        if self.config.model is None:
            self.config.model = "mosaicml/mpt-7b"

    def get_llm_model_answer(self, prompt):
        return self._get_answer(prompt=prompt, config=self.config)

    @staticmethod
    def _get_answer(prompt: str, config: BaseLlmConfig) -> str | Iterable:
        callback_manager = [StreamingStdOutCallbackHandler()] if config.stream else [StdOutCallbackHandler()]

        # Prepare the arguments for BaseVLLM
        llm_args = {
            "model": config.model,
            "temperature": config.temperature,
            "top_p": config.top_p,
            "callback_manager": CallbackManager(callback_manager),
        }

        # Add model_kwargs if they are not None
        if config.model_kwargs is not None:
            llm_args.update(config.model_kwargs)

        llm = BaseVLLM(**llm_args)
        return llm.invoke(prompt)
