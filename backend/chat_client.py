#!/usr/bin/env python3
"""
AI Wiki WebSocket Chat Client
Usage: python chat_client.py
"""

import asyncio
import websockets
import json
import sys
from threading import Event

class WikiChatClient:
    def __init__(self, server_url="ws://localhost:8000/ws/user"):
        self.server_url = server_url
        self.websocket = None
        self.waiting_for_response = False
        self.response_complete = Event()

    async def connect(self):
        """Connect to the WebSocket server"""
        try:
            self.websocket = await websockets.connect(self.server_url)
            print(f"✅ Connected to {self.server_url}")
            return True
        except Exception as e:
            print(f"❌ Connection failed: {e}")
            return False

    async def listen_for_responses(self):
        """Listen for responses from the server"""
        try:
            while self.websocket:
                try:
                    response = await asyncio.wait_for(self.websocket.recv(), timeout=1.0)
                    data = json.loads(response)
                    
                    if data.get("type") == "system":
                        print(f"🤖 System: {data.get('message', '')}")
                        
                    elif data.get("type") == "chat_response":
                        print(f"🤖 AI: {data.get('message', '')}")
                        
                    elif data.get("type") == "tool_call":
                        tool_name = data.get('tool_name', '')
                        result = data.get('result', '')
                        print(f"🔧 Tool: {tool_name} executed")
                        # Show first line of result for context
                        first_line = result.split('\n')[0] if result else ""
                        if len(first_line) > 60:
                            first_line = first_line[:60] + "..."
                        print(f"    → {first_line}")
                        
                    elif data.get("type") == "error":
                        print(f"❌ Error: {data.get('message', '')}")
                        self.response_complete.set()
                        
                    elif data.get("type") == "success":
                        # Response sequence is complete
                        self.response_complete.set()
                        
                    else:
                        print(f"📨 {data.get('type', 'unknown')}: {str(data)[:100]}")
                        
                except asyncio.TimeoutError:
                    continue
                except websockets.exceptions.ConnectionClosed:
                    print("\n🔌 Connection closed by server")
                    break
                except Exception as e:
                    print(f"\n❌ Error receiving messages: {e}")
                    break
                    
        except Exception as e:
            print(f"\n❌ Listener error: {e}")

    async def send_chat_message(self, message):
        """Send a chat message to the AI and wait for response"""
        if not self.websocket:
            print("❌ Not connected")
            return
            
        try:
            # Clear the response complete flag
            self.response_complete.clear()
            self.waiting_for_response = True
            
            chat_data = {
                "type": "chat",
                "message": message
            }
            await self.websocket.send(json.dumps(chat_data))
            
            # Wait for response to complete (with timeout)
            try:
                await asyncio.wait_for(
                    asyncio.to_thread(self.response_complete.wait),
                    timeout=30.0
                )
            except asyncio.TimeoutError:
                print("⚠️ Response timeout - AI may still be processing")
            
            self.waiting_for_response = False
            
        except Exception as e:
            print(f"❌ Error sending message: {e}")
            self.waiting_for_response = False

    async def reset_conversation(self):
        """Reset the conversation"""
        if not self.websocket:
            print("❌ Not connected")
            return
            
        try:
            self.response_complete.clear()
            reset_data = {"type": "reset"}
            await self.websocket.send(json.dumps(reset_data))
            
            # Wait for reset confirmation
            try:
                await asyncio.wait_for(
                    asyncio.to_thread(self.response_complete.wait),
                    timeout=5.0
                )
                print("🔄 Conversation reset")
            except asyncio.TimeoutError:
                print("🔄 Conversation reset (no confirmation)")
                
        except Exception as e:
            print(f"❌ Error resetting conversation: {e}")

    async def close(self):
        """Close the connection"""
        if self.websocket:
            await self.websocket.close()
            self.websocket = None
            print("👋 Disconnected")

async def main():
    """Main interactive chat loop"""
    client = WikiChatClient()
    
    print("🚀 AI Wiki Chat Client")
    print("=" * 50)
    print("Commands:")
    print("  /reset  - Reset conversation")
    print("  /quit   - Exit")
    print("  anything else - Chat with AI")
    print("=" * 50)
    
    if not await client.connect():
        return
    
    # Start listening for responses in background
    listener_task = asyncio.create_task(client.listen_for_responses())
    
    # Give a moment for the welcome message
    await asyncio.sleep(1.0)
    
    try:
        while True:
            try:
                # Only show prompt when not waiting for response
                if not client.waiting_for_response:
                    user_input = await asyncio.get_event_loop().run_in_executor(
                        None, lambda: input("\n👤 You: ")
                    )
                    
                    if user_input.lower().strip() in ['/quit', '/exit', 'quit', 'exit']:
                        break
                    elif user_input.lower().strip() in ['/reset', 'reset']:
                        await client.reset_conversation()
                    elif user_input.strip():
                        await client.send_chat_message(user_input.strip())
                else:
                    # Wait a bit if we're still processing
                    await asyncio.sleep(0.1)
                    
            except KeyboardInterrupt:
                print("\n👋 Goodbye!")
                break
            except EOFError:
                break
                
    finally:
        listener_task.cancel()
        await client.close()

if __name__ == "__main__":
    print("Starting AI Wiki WebSocket chat client...")
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")