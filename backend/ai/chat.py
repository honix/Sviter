from typing import List, Dict, Any, Optional
from ai.client import OpenRouterClient
from ai.tools import WikiTools
from openai.types.chat import ChatCompletionMessage
from sqlalchemy.orm import Session
import json

class ChatHandler:
    """Handles chat interactions with AI and tool calling"""
    
    def __init__(self):
        self.client = OpenRouterClient()
        self.conversation_history: List[Dict[str, str]] = []
        self._initialize_conversation()
    
    def _initialize_conversation(self):
        """Initialize conversation with system message"""
        self.conversation_history = [self.client.get_system_message()]
    
    def process_message(self, user_message: str) -> Dict[str, Any]:
        """Process user message and return response with any tool calls"""
        
        # Add user message to conversation
        self.conversation_history.append({"role": "user", "content": user_message})
        
        # Get AI tools
        tools = WikiTools.get_tool_definitions()
        
        try:
            # Get initial AI response
            completion = self.client.create_completion(self.conversation_history, tools)
            message: ChatCompletionMessage = completion.choices[0].message
            
            response_data = {
                "message": message.content or "",
                "tool_calls": [],
                "final_response": ""
            }
            
            # Add assistant message to conversation
            self.conversation_history.append(message)
            
            # Handle tool calls if any
            if message.tool_calls:
                tool_results = []
                
                for tool_call in message.tool_calls:
                    tool_name = tool_call.function.name
                    try:
                        arguments = json.loads(tool_call.function.arguments)
                    except json.JSONDecodeError as e:
                        arguments = {}
                        print(f"Error parsing tool arguments: {e}")
                    
                    # Execute tool (WikiTools.execute_tool will create its own db session)
                    tool_result = WikiTools.execute_tool(tool_name, arguments)
                    
                    # Store tool call info
                    tool_call_info = {
                        "tool_name": tool_name,
                        "arguments": arguments,
                        "result": tool_result
                    }
                    tool_results.append(tool_call_info)
                    response_data["tool_calls"].append(tool_call_info)
                    
                    # Add tool result to conversation
                    self.conversation_history.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": tool_result
                    })
                
                # Get final response after tool execution
                follow_up_completion = self.client.create_completion(self.conversation_history, tools)
                final_message = follow_up_completion.choices[0].message
                
                if final_message.content:
                    response_data["final_response"] = final_message.content
                    self.conversation_history.append(final_message)
            
            return {
                "success": True,
                "data": response_data
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"Error processing message: {str(e)}"
            }
    
    def get_conversation_history(self) -> List[Dict[str, str]]:
        """Get the current conversation history"""
        return self.conversation_history.copy()
    
    def reset_conversation(self):
        """Reset conversation to initial state"""
        self._initialize_conversation()