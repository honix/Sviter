"""
Agentic testing script for AI Wiki backend
This script can be run by AI agents to test the full functionality
"""

import asyncio
import websockets
import json
import time
import sys
import os
from typing import Dict, Any, List

class AgenticTester:
    """Agentic testing client for AI Wiki backend"""
    
    def __init__(self, server_url: str = "ws://localhost:8000/ws/test_agent"):
        self.server_url = server_url
        self.websocket = None
        self.test_results = []
    
    async def connect(self):
        """Connect to WebSocket server"""
        try:
            self.websocket = await websockets.connect(self.server_url)
            print(f"✅ Connected to {self.server_url}")
            return True
        except Exception as e:
            print(f"❌ Connection failed: {e}")
            return False
    
    async def disconnect(self):
        """Disconnect from WebSocket server"""
        if self.websocket:
            await self.websocket.close()
            print("✅ Disconnected")
    
    async def send_message(self, message: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Send message and collect all responses"""
        if not self.websocket:
            raise Exception("Not connected to server")
        
        await self.websocket.send(json.dumps(message))
        responses = []
        
        # Collect responses for up to 10 seconds
        timeout = 10
        start_time = time.time()
        
        try:
            while time.time() - start_time < timeout:
                try:
                    response = await asyncio.wait_for(self.websocket.recv(), timeout=1.0)
                    response_data = json.loads(response)
                    responses.append(response_data)
                    
                    # Stop collecting if we get a success/error response
                    if response_data.get("type") in ["success", "error"]:
                        break
                        
                except asyncio.TimeoutError:
                    break
                    
        except Exception as e:
            print(f"Error receiving response: {e}")
        
        return responses
    
    async def test_connection(self):
        """Test basic connection and welcome message"""
        print("\n🧪 Testing Connection...")
        
        try:
            # Just wait for welcome message
            welcome_response = await asyncio.wait_for(self.websocket.recv(), timeout=5.0)
            welcome_data = json.loads(welcome_response)
            
            if welcome_data.get("type") == "system":
                print("✅ Received welcome message")
                self.test_results.append({"test": "connection", "status": "passed"})
                return True
            else:
                print(f"❌ Unexpected welcome message: {welcome_data}")
                self.test_results.append({"test": "connection", "status": "failed", "error": "No welcome message"})
                return False
                
        except Exception as e:
            print(f"❌ Connection test failed: {e}")
            self.test_results.append({"test": "connection", "status": "failed", "error": str(e)})
            return False
    
    async def test_create_page(self):
        """Test creating a wiki page via AI agent"""
        print("\n🧪 Testing Page Creation...")
        
        message = {
            "type": "chat",
            "message": "Please create a new wiki page titled 'AI Testing Guide' with content about how to test AI systems effectively."
        }
        
        try:
            responses = await self.send_message(message)
            
            # Check if we got tool calls
            tool_calls = [r for r in responses if r.get("type") == "tool_call"]
            edit_calls = [t for t in tool_calls if t.get("tool_name") == "edit_page"]
            
            if edit_calls:
                print("✅ Page creation tool called")
                print(f"   Tool result: {edit_calls[0].get('result', 'No result')[:100]}...")
                self.test_results.append({"test": "create_page", "status": "passed"})
                return True
            else:
                print("❌ No page creation tool call found")
                print(f"   Responses received: {len(responses)}")
                for r in responses:
                    print(f"   - {r.get('type', 'unknown')}: {str(r)[:100]}...")
                self.test_results.append({"test": "create_page", "status": "failed", "error": "No edit_page tool call"})
                return False
                
        except Exception as e:
            print(f"❌ Page creation test failed: {e}")
            self.test_results.append({"test": "create_page", "status": "failed", "error": str(e)})
            return False
    
    async def test_read_page(self):
        """Test reading a wiki page via AI agent"""
        print("\n🧪 Testing Page Reading...")
        
        message = {
            "type": "chat",
            "message": "Can you read the 'AI Testing Guide' page I just created?"
        }
        
        try:
            responses = await self.send_message(message)
            
            # Check if we got tool calls
            tool_calls = [r for r in responses if r.get("type") == "tool_call"]
            read_calls = [t for t in tool_calls if t.get("tool_name") == "read_page"]
            
            if read_calls:
                print("✅ Page reading tool called")
                print(f"   Tool result: {read_calls[0].get('result', 'No result')[:100]}...")
                self.test_results.append({"test": "read_page", "status": "passed"})
                return True
            else:
                print("❌ No page reading tool call found")
                self.test_results.append({"test": "read_page", "status": "failed", "error": "No read_page tool call"})
                return False
                
        except Exception as e:
            print(f"❌ Page reading test failed: {e}")
            self.test_results.append({"test": "read_page", "status": "failed", "error": str(e)})
            return False
    
    async def test_search_pages(self):
        """Test searching for pages via AI agent"""
        print("\n🧪 Testing Page Search...")
        
        message = {
            "type": "chat",
            "message": "Search for pages related to 'testing' in the wiki."
        }
        
        try:
            responses = await self.send_message(message)
            
            # Check if we got tool calls
            tool_calls = [r for r in responses if r.get("type") == "tool_call"]
            search_calls = [t for t in tool_calls if t.get("tool_name") in ["find_pages", "list_all_pages"]]
            
            if search_calls:
                print("✅ Page search tool called")
                print(f"   Tool result: {search_calls[0].get('result', 'No result')[:100]}...")
                self.test_results.append({"test": "search_pages", "status": "passed"})
                return True
            else:
                print("❌ No page search tool call found")
                self.test_results.append({"test": "search_pages", "status": "failed", "error": "No search tool call"})
                return False
                
        except Exception as e:
            print(f"❌ Page search test failed: {e}")
            self.test_results.append({"test": "search_pages", "status": "failed", "error": str(e)})
            return False
    
    async def test_conversation_reset(self):
        """Test conversation reset functionality"""
        print("\n🧪 Testing Conversation Reset...")
        
        message = {"type": "reset"}
        
        try:
            responses = await self.send_message(message)
            
            success_responses = [r for r in responses if r.get("type") == "success"]
            
            if success_responses:
                print("✅ Conversation reset successful")
                self.test_results.append({"test": "reset", "status": "passed"})
                return True
            else:
                print("❌ Conversation reset failed")
                self.test_results.append({"test": "reset", "status": "failed", "error": "No success response"})
                return False
                
        except Exception as e:
            print(f"❌ Conversation reset test failed: {e}")
            self.test_results.append({"test": "reset", "status": "failed", "error": str(e)})
            return False
    
    async def run_all_tests(self):
        """Run all agentic tests"""
        print("🚀 Starting Agentic Testing for AI Wiki Backend")
        print("=" * 50)
        
        if not await self.connect():
            return False
        
        try:
            # Test connection
            if not await self.test_connection():
                print("❌ Connection test failed, stopping tests")
                return False
            
            # Wait a bit between tests
            await asyncio.sleep(1)
            
            # Run main functionality tests
            await self.test_create_page()
            await asyncio.sleep(1)
            
            await self.test_read_page()
            await asyncio.sleep(1)
            
            await self.test_search_pages()
            await asyncio.sleep(1)
            
            await self.test_conversation_reset()
            
            # Print results summary
            self.print_test_summary()
            
            return True
            
        finally:
            await self.disconnect()
    
    def print_test_summary(self):
        """Print summary of test results"""
        print("\n" + "=" * 50)
        print("🧪 AGENTIC TEST RESULTS SUMMARY")
        print("=" * 50)
        
        passed = len([t for t in self.test_results if t["status"] == "passed"])
        failed = len([t for t in self.test_results if t["status"] == "failed"])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed} ✅")
        print(f"Failed: {failed} ❌")
        print(f"Success Rate: {(passed/total*100):.1f}%")
        
        if failed > 0:
            print("\nFailed Tests:")
            for test in self.test_results:
                if test["status"] == "failed":
                    print(f"  - {test['test']}: {test.get('error', 'Unknown error')}")
        
        print("=" * 50)

async def main():
    """Main function to run agentic tests"""
    if len(sys.argv) > 1:
        server_url = sys.argv[1]
    else:
        server_url = "ws://localhost:8000/ws/test_agent"
    
    tester = AgenticTester(server_url)
    success = await tester.run_all_tests()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    asyncio.run(main())