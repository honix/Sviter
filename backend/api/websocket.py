from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from database.database import get_db_session
from ai.chat import ChatHandler
import json
from typing import Dict, Any
import asyncio

class WebSocketManager:
    """Manages WebSocket connections and chat sessions"""
    
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.chat_handlers: Dict[str, ChatHandler] = {}
    
    async def connect(self, websocket: WebSocket, client_id: str):
        """Accept WebSocket connection and initialize chat handler"""
        print(f"🔌 WebSocketManager.connect() called for client: {client_id}")
        await websocket.accept()
        print(f"✅ WebSocket accepted for client: {client_id}")

        self.active_connections[client_id] = websocket
        print(f"📝 Added {client_id} to active_connections. Total connections: {len(self.active_connections)}")

        # Initialize chat handler
        self.chat_handlers[client_id] = ChatHandler()
        print(f"🤖 Created chat handler for {client_id}. Total handlers: {len(self.chat_handlers)}")

        # Send welcome message
        await self.send_message(client_id, {
            "type": "system",
            "message": "Connected to AI Wiki Assistant. You can ask questions or request wiki operations."
        })
    
    def disconnect(self, client_id: str):
        """Clean up connection and resources"""
        print(f"🔌❌ WebSocketManager.disconnect() called for client: {client_id}")
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            print(f"🗑️ Removed {client_id} from active_connections. Remaining: {len(self.active_connections)}")
        else:
            print(f"⚠️ Client {client_id} was not in active_connections during disconnect")

        if client_id in self.chat_handlers:
            del self.chat_handlers[client_id]
            print(f"🗑️ Removed chat handler for {client_id}. Remaining handlers: {len(self.chat_handlers)}")
        else:
            print(f"⚠️ Client {client_id} had no chat handler during disconnect")
    
    async def send_message(self, client_id: str, message: Dict[str, Any]):
        """Send message to specific client"""
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_text(json.dumps(message))
                print(f"✅ Message sent to {client_id}: {message.get('type', 'unknown')}")
            except Exception as e:
                error_msg = str(e)
                print(f"❌ Error sending message to {client_id}: {error_msg}")
                print(f"❌ Failed message type: {message.get('type', 'unknown')}")
                # Only disconnect if it's a serious error, not just Firefox close frame issues
                if "no close frame" not in error_msg.lower() and "connection closed" in error_msg.lower():
                    print(f"🔌 Disconnecting {client_id} due to serious send error")
                    self.disconnect(client_id)
                else:
                    print(f"⚠️ Ignoring minor WebSocket error for {client_id}")
        else:
            print(f"⚠️ Client {client_id} not in active connections, cannot send: {message.get('type', 'unknown')}")
    
    async def handle_message(self, client_id: str, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle incoming message from client"""

        print(f"📨 WebSocket received message from {client_id}: {message_data}")
        print(f"🔍 Current active_connections: {list(self.active_connections.keys())}")
        print(f"🔍 Current chat_handlers: {list(self.chat_handlers.keys())}")

        if client_id not in self.chat_handlers:
            print(f"❌ Chat handler not found for client {client_id}")
            print(f"❌ Available handlers: {list(self.chat_handlers.keys())}")
            return {"type": "error", "message": "Chat handler not found"}

        message_type = message_data.get("type")
        print(f"🔍 Processing message type: {message_type}")

        if message_type == "chat":
            # Handle chat message
            user_message = message_data.get("message", "")
            print(f"💬 Chat message content: '{user_message}'")
            if not user_message:
                print("❌ Empty message received")
                return {"type": "error", "message": "Empty message"}

            print(f"🤖 Processing chat message with AI...")
            # Process message through chat handler
            result = self.chat_handlers[client_id].process_message(user_message)
            print(f"🔄 AI processing result: {result.get('success', False)}")

            if result["success"]:
                response_data = result["data"]

                # Send initial message if it exists (iteration 1 reasoning)
                if response_data["message"]:
                    initial_message = {
                        "type": "chat_response",
                        "message": response_data["message"]
                    }
                    print(f"📤 Sending initial message: {response_data['message'][:50]}...")
                    await self.send_message(client_id, initial_message)

                # Send tool calls in real-time if any (for user feedback)
                page_modified = False
                print(f"📊 Tool calls to send: {len(response_data['tool_calls'])}")
                for i, tool_call in enumerate(response_data["tool_calls"]):
                    tool_message = {
                        "type": "tool_call",
                        "tool_name": tool_call["tool_name"],
                        "arguments": tool_call["arguments"],
                        "result": tool_call["result"],
                        "iteration": tool_call.get("iteration", 1)
                    }
                    print(f"📤 Sending tool_call {i+1}/{len(response_data['tool_calls'])}: {tool_call['tool_name']}")
                    await self.send_message(client_id, tool_message)

                    # Check if a page-modifying tool was executed
                    if tool_call["tool_name"] in ["edit_page", "create_page", "delete_page"]:
                        page_modified = True

                # Send final response with metadata
                if response_data["final_response"]:
                    final_message = {
                        "type": "chat_response",
                        "message": response_data["final_response"],
                        "page_modified": page_modified
                    }
                    print(f"📤 Sending final response: {response_data['final_response'][:50]}...")
                    await self.send_message(client_id, final_message)

                return {"type": "success"}
            else:
                return {"type": "error", "message": result["error"]}
        
        elif message_type == "reset":
            # Reset conversation
            self.chat_handlers[client_id].reset_conversation()
            return {"type": "success", "message": "Conversation reset"}
        
        elif message_type == "get_history":
            # Get conversation history
            history = self.chat_handlers[client_id].get_conversation_history()
            return {"type": "history", "data": history}
        
        else:
            return {"type": "error", "message": f"Unknown message type: {message_type}"}

# Global WebSocket manager instance
websocket_manager = WebSocketManager()

async def websocket_endpoint(websocket: WebSocket, client_id: str = "default"):
    """WebSocket endpoint handler"""
    await websocket_manager.connect(websocket, client_id)
    
    try:
        while True:
            # Receive message from client
            print(f"🔄 Waiting for message from {client_id}...")
            data = await websocket.receive_text()
            print(f"📨 Raw message received from {client_id}: {data}")

            try:
                message_data = json.loads(data)
                print(f"✅ Parsed message data: {message_data}")
            except json.JSONDecodeError as e:
                print(f"❌ JSON decode error: {e}")
                await websocket_manager.send_message(client_id, {
                    "type": "error",
                    "message": "Invalid JSON format"
                })
                continue

            # Handle the message
            print(f"🔧 About to handle message: {message_data}")
            response = await websocket_manager.handle_message(client_id, message_data)
            print(f"📤 Handler response: {response}")
            
            # Send response if it's an error or immediate response
            if response.get("type") in ["error", "success"]:
                await websocket_manager.send_message(client_id, response)
                
    except WebSocketDisconnect:
        print(f"🔌💔 WebSocketDisconnect for {client_id}")
        websocket_manager.disconnect(client_id)
    except Exception as e:
        print(f"🔌⚠️ WebSocket error for client {client_id}: {e}")
        print(f"🔌⚠️ Exception type: {type(e).__name__}")
        websocket_manager.disconnect(client_id)