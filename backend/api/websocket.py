from fastapi import WebSocket, WebSocketDisconnect
from agents.unified_executor import UnifiedAgentExecutor
from agents.chat_agent import ChatAgent
from storage import GitWiki
import json
from typing import Dict, Any, Optional
import asyncio
import os

class WebSocketManager:
    """Manages WebSocket connections and unified agent sessions"""

    def __init__(self, wiki: GitWiki, api_key: str = None):
        self.wiki = wiki
        self.api_key = api_key or os.getenv("OPENROUTER_API_KEY")
        self.active_connections: Dict[str, WebSocket] = {}
        self.executors: Dict[str, UnifiedAgentExecutor] = {}
        self.session_info: Dict[str, Dict[str, Any]] = {}  # Track session metadata
    
    async def connect(self, websocket: WebSocket, client_id: str, agent_name: str = None):
        """Accept WebSocket connection and initialize unified executor session"""
        print(f"🔌 WebSocketManager.connect() called for client: {client_id}, agent: {agent_name or 'ChatAgent'}")
        await websocket.accept()
        print(f"✅ WebSocket accepted for client: {client_id}")

        self.active_connections[client_id] = websocket
        print(f"📝 Added {client_id} to active_connections. Total connections: {len(self.active_connections)}")

        # Initialize unified executor
        self.executors[client_id] = UnifiedAgentExecutor(wiki=self.wiki, api_key=self.api_key)
        print(f"🤖 Created executor for {client_id}. Total executors: {len(self.executors)}")

        # Start session with ChatAgent (human-in-the-loop mode) unless specific agent requested
        if agent_name:
            # TODO: For future - support starting with specific agent
            # For now, always use ChatAgent for WebSocket connections
            agent_name = "ChatAgent"

        # Define callbacks for streaming
        async def on_message_callback(msg_type: str, content: str):
            """Stream messages to client"""
            if msg_type == "system_prompt":
                await self.send_message(client_id, {
                    "type": "system_prompt",
                    "content": content
                })
            elif msg_type == "assistant":
                await self.send_message(client_id, {
                    "type": "chat_response",
                    "message": content
                })

        async def on_tool_call_callback(tool_info: Dict[str, Any]):
            """Stream tool calls to client"""
            await self.send_message(client_id, {
                "type": "tool_call",
                "tool_name": tool_info["tool_name"],
                "arguments": tool_info["arguments"],
                "result": tool_info["result"],
                "iteration": tool_info["iteration"]
            })
            # Send page_updated for live page updates in center panel
            if tool_info["tool_name"] == "edit_page":
                await self.send_message(client_id, {
                    "type": "page_updated",
                    "title": tool_info["arguments"].get("title"),
                    "content": tool_info["result"]
                })

        async def on_branch_created_callback(branch_name: str):
            """Send branch_created and branch_switched messages immediately"""
            await self.send_message(client_id, {
                "type": "branch_created",
                "branch": branch_name
            })
            await self.send_message(client_id, {
                "type": "branch_switched",
                "branch": branch_name
            })

        session_result = await self.executors[client_id].start_session(
            agent_class=ChatAgent,
            on_message=on_message_callback,
            on_tool_call=on_tool_call_callback,
            on_branch_created=on_branch_created_callback
        )

        if session_result["success"]:
            self.session_info[client_id] = session_result
            print(f"✅ Session started for {client_id}: {session_result['agent_name']}")
        else:
            print(f"❌ Failed to start session for {client_id}: {session_result.get('error')}")
            await self.send_message(client_id, {
                "type": "error",
                "message": f"Failed to start session: {session_result.get('error')}"
            })
    
    def disconnect(self, client_id: str):
        """Clean up connection and resources"""
        print(f"🔌❌ WebSocketManager.disconnect() called for client: {client_id}")

        # End session and cleanup
        if client_id in self.executors:
            try:
                self.executors[client_id].end_session()
            except Exception as e:
                print(f"⚠️ Error ending session for {client_id}: {e}")
            del self.executors[client_id]
            print(f"🗑️ Removed executor for {client_id}. Remaining: {len(self.executors)}")

        if client_id in self.session_info:
            del self.session_info[client_id]

        if client_id in self.active_connections:
            del self.active_connections[client_id]
            print(f"🗑️ Removed {client_id} from active_connections. Remaining: {len(self.active_connections)}")
    
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
        print(f"🔍 Current executors: {list(self.executors.keys())}")

        if client_id not in self.executors:
            print(f"❌ Executor not found for client {client_id}")
            print(f"❌ Available executors: {list(self.executors.keys())}")
            return {"type": "error", "message": "Executor not found"}

        message_type = message_data.get("type")
        print(f"🔍 Processing message type: {message_type}")

        if message_type == "chat":
            # Handle chat message
            user_message = message_data.get("message", "")
            print(f"💬 Chat message content: '{user_message}'")
            if not user_message:
                print("❌ Empty message received")
                return {"type": "error", "message": "Empty message"}

            print(f"🤖 Processing chat message with unified executor...")

            # Process turn through unified executor (runs until stopped or needs input)
            result = await self.executors[client_id].process_turn(user_message)

            print(f"🔄 Execution result status: {result.status}")

            if result.status in ['completed', 'stopped']:
                # Success - messages and tool calls were already streamed via callbacks
                return {"type": "success"}
            elif result.status == 'error':
                return {"type": "error", "message": result.error}
            else:
                return {"type": "error", "message": f"Unexpected status: {result.status}"}

        elif message_type == "select_agent":
            # Switch to a different agent (clears conversation)
            agent_name = message_data.get("agent_name", "")
            if not agent_name:
                return {"type": "error", "message": "Agent name is required"}

            print(f"🔄 Switching to agent: {agent_name}")

            # Import agent classes
            from agents import get_agent_by_name

            # Get the agent class
            try:
                agent_class = get_agent_by_name(agent_name)
            except ValueError:
                return {"type": "error", "message": f"Agent '{agent_name}' not found"}

            # Reset conversation
            self.executors[client_id].reset_conversation()

            # Send agent_selected FIRST so frontend clears messages before receiving new prompt
            await self.send_message(client_id, {
                "type": "agent_selected",
                "agent_name": agent_name,
                "human_in_loop": agent_class.human_in_loop
            })

            # Setup streaming callbacks
            async def on_message_callback(msg_type: str, content: str):
                """Stream messages to client"""
                if msg_type == "system_prompt":
                    await self.send_message(client_id, {
                        "type": "system_prompt",
                        "content": content
                    })
                elif msg_type == "assistant":
                    await self.send_message(client_id, {
                        "type": "chat_response",
                        "message": content
                    })

            async def on_tool_call_callback(tool_info: Dict[str, Any]):
                """Stream tool calls to client"""
                await self.send_message(client_id, {
                    "type": "tool_call",
                    "tool_name": tool_info["tool_name"],
                    "arguments": tool_info["arguments"],
                    "result": tool_info["result"],
                    "iteration": tool_info["iteration"]
                })
                # Send page_updated for live page updates in center panel
                if tool_info["tool_name"] == "edit_page":
                    await self.send_message(client_id, {
                        "type": "page_updated",
                        "title": tool_info["arguments"].get("title"),
                        "content": tool_info["result"]
                    })

            async def on_branch_created_callback(branch_name: str):
                """Send branch_created and branch_switched messages immediately"""
                await self.send_message(client_id, {
                    "type": "branch_created",
                    "branch": branch_name
                })
                await self.send_message(client_id, {
                    "type": "branch_switched",
                    "branch": branch_name
                })

            session_result = await self.executors[client_id].start_session(
                agent_class=agent_class,
                on_message=on_message_callback,
                on_tool_call=on_tool_call_callback,
                on_branch_created=on_branch_created_callback
            )

            if session_result["success"]:
                self.session_info[client_id] = session_result
                return {"type": "success"}
            else:
                return {"type": "error", "message": f"Failed to select agent: {session_result.get('error')}"}

        elif message_type == "run_agent":
            # Run the current agent (for AgentOnBranch agents that need explicit "Run" trigger)
            print(f"🤖 Running current agent")

            executor = self.executors[client_id]

            # Run agent execution (without user input)
            result = await executor.process_turn()

            print(f"🔄 Agent execution result: {result.status}")

            # Note: branch_created/switched messages are now sent immediately via on_branch_created callback
            branch_created = executor.branch_created

            # Clean up - call on_finish lifecycle hook (handles branch cleanup)
            cleanup_info = executor.end_session(call_on_finish=True)

            # Send branch cleanup notifications if branch was deleted (no changes made)
            if cleanup_info.get("branch_deleted"):
                await self.send_message(client_id, {
                    "type": "branch_deleted",
                    "branch": cleanup_info["branch_deleted"]
                })
                await self.send_message(client_id, {
                    "type": "branch_switched",
                    "branch": cleanup_info["switched_to_branch"]
                })

            # Send completion message
            await self.send_message(client_id, {
                "type": "agent_complete",
                "status": result.status,
                "iterations": result.iterations,
                "branch_created": branch_created if not cleanup_info.get("branch_deleted") else None
            })

            return {"type": "success", "result": result.to_dict()}

        elif message_type == "reset":
            # Reset conversation - restart session
            print(f"🔄 Resetting session for {client_id}")
            self.executors[client_id].reset_conversation()

            # Restart session with same configuration
            session_info = self.session_info.get(client_id, {})

            # Re-setup callbacks
            async def on_message_callback(msg_type: str, content: str):
                """Stream messages to client"""
                if msg_type == "system_prompt":
                    await self.send_message(client_id, {
                        "type": "system_prompt",
                        "content": content
                    })
                elif msg_type == "assistant":
                    await self.send_message(client_id, {
                        "type": "chat_response",
                        "message": content
                    })

            async def on_tool_call_callback(tool_info: Dict[str, Any]):
                """Stream tool calls to client"""
                await self.send_message(client_id, {
                    "type": "tool_call",
                    "tool_name": tool_info["tool_name"],
                    "arguments": tool_info["arguments"],
                    "result": tool_info["result"],
                    "iteration": tool_info["iteration"]
                })
                # Send page_updated for live page updates in center panel
                if tool_info["tool_name"] == "edit_page":
                    await self.send_message(client_id, {
                        "type": "page_updated",
                        "title": tool_info["arguments"].get("title"),
                        "content": tool_info["result"]
                    })

            async def on_branch_created_callback(branch_name: str):
                """Send branch_created and branch_switched messages immediately"""
                await self.send_message(client_id, {
                    "type": "branch_created",
                    "branch": branch_name
                })
                await self.send_message(client_id, {
                    "type": "branch_switched",
                    "branch": branch_name
                })

            session_result = await self.executors[client_id].start_session(
                agent_class=ChatAgent,
                on_message=on_message_callback,
                on_tool_call=on_tool_call_callback,
                on_branch_created=on_branch_created_callback
            )

            if session_result["success"]:
                self.session_info[client_id] = session_result
                return {"type": "success", "message": "Conversation reset"}
            else:
                return {"type": "error", "message": f"Failed to reset: {session_result.get('error')}"}

        elif message_type == "get_history":
            # Get conversation history
            history = self.executors[client_id].get_conversation_history()
            return {"type": "history", "data": history}

        else:
            return {"type": "error", "message": f"Unknown message type: {message_type}"}

# Global WebSocket manager instance - will be initialized in main.py
websocket_manager: Optional[WebSocketManager] = None

def initialize_websocket_manager(wiki: GitWiki, api_key: str = None):
    """Initialize the global WebSocket manager with wiki instance"""
    global websocket_manager
    websocket_manager = WebSocketManager(wiki, api_key)
    print(f"✅ WebSocket manager initialized")

async def websocket_endpoint(websocket: WebSocket, client_id: str = "default"):
    """WebSocket endpoint handler"""
    if websocket_manager is None:
        print("❌ WebSocket manager not initialized!")
        await websocket.close(code=1011, reason="Server not ready")
        return

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
            
            # Send response if it's an error, success, or agent_selected
            if response.get("type") in ["error", "success", "agent_selected"]:
                await websocket_manager.send_message(client_id, response)
                
    except WebSocketDisconnect:
        print(f"🔌💔 WebSocketDisconnect for {client_id}")
        websocket_manager.disconnect(client_id)
    except Exception as e:
        print(f"🔌⚠️ WebSocket error for client {client_id}: {e}")
        print(f"🔌⚠️ Exception type: {type(e).__name__}")
        websocket_manager.disconnect(client_id)