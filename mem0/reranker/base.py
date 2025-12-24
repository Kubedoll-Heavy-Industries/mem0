from abc import ABC, abstractmethod
from typing import Any, Optional


class BaseReranker(ABC):
    """Abstract base class for all rerankers."""

    @abstractmethod
    def rerank(self, query: str, documents: list[dict[str, Any]], top_k: Optional[int] = None) -> list[dict[str, Any]]:
        """
        Rerank documents based on relevance to the query.

        Args:
            query: The search query
            documents: List of documents to rerank, each with 'memory' field
            top_k: Number of top documents to return (None = return all)

        Returns:
            List of reranked documents with added 'rerank_score' field
        """
        pass
