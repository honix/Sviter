from typing import List, Dict, Any, Optional
from ai.client import OpenRouterClient
from ai.tools import WikiTools
from openai.types.chat import ChatCompletionMessage
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
    
    def process_message(self, user_message: str, max_iterations: int = 10) -> Dict[str, Any]:
        """Process user message and return response with any tool calls.

        Now supports multi-step agent actions in a loop until the AI stops calling tools
        or max_iterations is reached.

        Args:
            user_message: The user's input message
            max_iterations: Maximum number of AI-tool interaction rounds (default: 10)
        """

        # Add user message to conversation
        self.conversation_history.append({"role": "user", "content": user_message})

        # Get AI tools
        tools = WikiTools.get_tool_definitions()

        try:
            response_data = {
                "message": "",
                "tool_calls": [],
                "final_response": "",
                "iterations": 0
            }

            iteration_count = 0
            print(f"🚀 Starting multi-step processing for: '{user_message}'")

            # Main processing loop - continue until AI stops calling tools or max iterations
            while iteration_count < max_iterations:
                iteration_count += 1
                response_data["iterations"] = iteration_count
                print(f"🔄 Iteration {iteration_count} starting...")

                # Get AI response
                completion = self.client.create_completion(self.conversation_history, tools)
                message: ChatCompletionMessage = completion.choices[0].message
                print(f"📝 AI Response: {message.content}")
                print(f"🔧 Tool calls: {len(message.tool_calls) if message.tool_calls else 0}")

                # Add assistant message to conversation
                self.conversation_history.append(message)

                # Store initial message if this is the first iteration
                if iteration_count == 1 and message.content:
                    response_data["message"] = message.content

                # Check if AI made tool calls
                if message.tool_calls:
                    # Process each tool call
                    for tool_call in message.tool_calls:
                        tool_name = tool_call.function.name
                        try:
                            arguments = json.loads(tool_call.function.arguments)
                        except json.JSONDecodeError as e:
                            arguments = {}
                            print(f"Error parsing tool arguments: {e}")

                        # Execute tool
                        tool_result = WikiTools.execute_tool(tool_name, arguments)

                        # Store tool call info
                        tool_call_info = {
                            "tool_name": tool_name,
                            "arguments": arguments,
                            "result": tool_result,
                            "iteration": iteration_count
                        }
                        response_data["tool_calls"].append(tool_call_info)

                        # Add tool result to conversation
                        self.conversation_history.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": tool_result
                        })

                    # Continue loop to let AI respond to tool results
                    continue

                else:
                    # No tool calls - AI is done, store final response
                    print(f"✅ AI completed - no more tool calls")
                    if message.content:
                        response_data["final_response"] = message.content
                    break

            # Handle case where we hit max iterations
            if iteration_count >= max_iterations:
                response_data["final_response"] += f"\n\n[Assistant completed after {max_iterations} iterations]"

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