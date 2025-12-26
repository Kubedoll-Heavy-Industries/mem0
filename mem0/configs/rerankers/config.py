from pydantic import BaseModel, Field


class RerankerConfig(BaseModel):
    """Configuration for rerankers."""

    provider: str = Field(description="Reranker provider (e.g., 'cohere', 'sentence_transformer')", default="cohere")
    config: dict | None = Field(description="Provider-specific reranker configuration", default=None)

    model_config = {"extra": "forbid"}
