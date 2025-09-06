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
        await websocket.accept()
        self.active_connections[client_id] = websocket
        
        # Initialize chat handler
        self.chat_handlers[client_id] = ChatHandler()
        
        # Send welcome message
        await self.send_message(client_id, {
            "type": "system",
            "message": "Connected to AI Wiki Assistant. You can ask questions or request wiki operations."
        })
    
    def disconnect(self, client_id: str):
        """Clean up connection and resources"""
        if client_id in self.active_connections:
            del self.active_connections[client_id]
        
        if client_id in self.chat_handlers:
            del self.chat_handlers[client_id]
    
    async def send_message(self, client_id: str, message: Dict[str, Any]):
        """Send message to specific client"""
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_text(json.dumps(message))
            except Exception as e:
                print(f"Error sending message to {client_id}: {e}")
                self.disconnect(client_id)
    
    async def handle_message(self, client_id: str, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle incoming message from client"""
        
        if client_id not in self.chat_handlers:
            return {"type": "error", "message": "Chat handler not found"}
        
        message_type = message_data.get("type")
        
        if message_type == "chat":
            # Handle chat message
            user_message = message_data.get("message", "")
            if not user_message:
                return {"type": "error", "message": "Empty message"}
            
            # Process message through chat handler
            result = self.chat_handlers[client_id].process_message(user_message)
            
            if result["success"]:
                response_data = result["data"]
                
                # Send initial response if any
                if response_data["message"]:
                    await self.send_message(client_id, {
                        "type": "chat_response",
                        "message": response_data["message"]
                    })
                
                # Send tool calls if any
                for tool_call in response_data["tool_calls"]:
                    await self.send_message(client_id, {
                        "type": "tool_call",
                        "tool_name": tool_call["tool_name"],
                        "arguments": tool_call["arguments"],
                        "result": tool_call["result"]
                    })
                
                # Send final response if any
                if response_data["final_response"]:
                    await self.send_message(client_id, {
                        "type": "chat_response",
                        "message": response_data["final_response"]
                    })
                
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
            data = await websocket.receive_text()
            
            try:
                message_data = json.loads(data)
            except json.JSONDecodeError:
                await websocket_manager.send_message(client_id, {
                    "type": "error", 
                    "message": "Invalid JSON format"
                })
                continue
            
            # Handle the message
            response = await websocket_manager.handle_message(client_id, message_data)
            
            # Send response if it's an error or immediate response
            if response.get("type") in ["error", "success"]:
                await websocket_manager.send_message(client_id, response)
                
    except WebSocketDisconnect:
        websocket_manager.disconnect(client_id)
    except Exception as e:
        print(f"WebSocket error for client {client_id}: {e}")
        websocket_manager.disconnect(client_id)