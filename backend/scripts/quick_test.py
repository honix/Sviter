#!/usr/bin/env python3
"""
Quick WebSocket test to demonstrate AI Wiki functionality
"""

import asyncio
import websockets
import json

async def test_wiki_chat():
    """Test the AI Wiki chat functionality"""
    print("🚀 Testing AI Wiki Chat...")
    
    # Connect to WebSocket
    uri = "ws://localhost:8000/ws/demo_user"
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Connected to AI Wiki")
            
            # Wait for welcome message
            welcome = await websocket.recv()
            welcome_data = json.loads(welcome)
            print(f"📨 {welcome_data.get('message', '')}")
            
            # Test commands to try
            test_commands = [
                "Create a page called 'Hello World' with a simple greeting",
                "Read the 'Hello World' page",
                "Search for pages containing 'Hello'",
                "List all pages in the wiki"
            ]
            
            for i, command in enumerate(test_commands, 1):
                print(f"\n🧪 Test {i}: {command}")
                
                # Send command
                message = {
                    "type": "chat",
                    "message": command
                }
                await websocket.send(json.dumps(message))
                
                # Collect responses for 5 seconds
                responses = []
                start_time = asyncio.get_event_loop().time()
                
                while asyncio.get_event_loop().time() - start_time < 5:
                    try:
                        response = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                        data = json.loads(response)
                        responses.append(data)
                        
                        # Print response
                        if data.get("type") == "chat_response":
                            print(f"🤖 AI: {data.get('message', '')}")
                        elif data.get("type") == "tool_call":
                            print(f"🔧 Tool: {data.get('tool_name')} -> {data.get('result', '')[:100]}...")
                        
                        # Stop if we get a success/error
                        if data.get("type") in ["success", "error"]:
                            break
                            
                    except asyncio.TimeoutError:
                        break
                
                print(f"   📊 Received {len(responses)} responses")
                
                # Wait between commands
                await asyncio.sleep(1)
            
            print("\n🎉 Demo completed!")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_wiki_chat())