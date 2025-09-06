from openai import OpenAI
from openai.types.chat import ChatCompletion, ChatCompletionMessage
import json
from typing import List, Dict, Any

class OpenRouterClient:
    """OpenRouter API client for LLM interactions"""
    
    def __init__(self, api_key: str = "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"):
        self.client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
        )
        
        # Model configuration - can be made configurable later
        self.model_name = "openai/gpt-oss-20b"  # $0.15/M output tokens | 128K context | good and smart
        
        # System message for wiki context
        self.system_message = """You are a helpful AI assistant for a wiki system. You can read, edit, and search wiki pages using the provided tools. 
When users ask questions, you can use these tools to find relevant information and provide helpful responses.
Keep responses concise and focused on the user's request."""
    
    def create_completion(self, messages: List[Dict[str, str]], tools: List[Dict] = None) -> ChatCompletion:
        """Create chat completion with optional tools"""
        completion_params = {
            "model": self.model_name,
            "messages": messages,
        }
        
        if tools:
            completion_params["tools"] = tools
            completion_params["tool_choice"] = "auto"
        
        return self.client.chat.completions.create(**completion_params)
    
    def get_system_message(self) -> Dict[str, str]:
        """Get the system message for wiki context"""
        return {"role": "system", "content": self.system_message}