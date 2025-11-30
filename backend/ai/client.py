"""
OpenRouter API client for LLM interactions.

This is a pure API wrapper - system prompts are now handled by
WikiPromptBuilder in ai/prompts.py and passed via messages.
"""
from openai import OpenAI
from openai.types.chat import ChatCompletion, ChatCompletionMessage
from typing import List, Dict, Any


class OpenRouterClient:
    """
    OpenRouter API client for LLM interactions.

    Pure API wrapper - no prompt handling. System prompts should be
    passed as the first message in the messages list.
    """

    DEFAULT_API_KEY = "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"
    DEFAULT_MODEL = "openai/gpt-oss-20b"

    def __init__(self, api_key: str = None, model: str = None):
        """
        Initialize OpenRouter client.

        Args:
            api_key: OpenRouter API key (optional, uses default)
            model: Model name (optional, uses default)
        """
        self.client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key or self.DEFAULT_API_KEY,
        )
        self.model_name = model or self.DEFAULT_MODEL

    def create_completion(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict] = None
    ) -> ChatCompletion:
        """
        Create chat completion with optional tools.

        Args:
            messages: List of message dicts (role, content)
            tools: Optional list of tool definitions in OpenAI format

        Returns:
            ChatCompletion response
        """
        completion_params = {
            "model": self.model_name,
            "messages": messages,
        }

        if tools:
            completion_params["tools"] = tools
            completion_params["tool_choice"] = "auto"

        return self.client.chat.completions.create(**completion_params)