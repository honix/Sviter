#!/usr/bin/env python3
"""
Minimal test for Claude Agent SDK.
Run: python test_claude_sdk.py
"""
import asyncio

try:
    from claude_agent_sdk import (
        ClaudeSDKClient, ClaudeAgentOptions,
        tool, create_sdk_mcp_server
    )
    print("✅ Claude SDK imported successfully")
except ImportError as e:
    print(f"❌ Claude SDK not installed: {e}")
    exit(1)


# Create a simple tool for testing
@tool("echo", "Echo the input back", {"message": {"type": "string", "description": "Message to echo"}})
async def echo_tool(args):
    return {"content": [{"type": "text", "text": f"Echo: {args.get('message', '')}"}]}


async def test_basic():
    """Test basic Claude SDK functionality"""
    print("\n🧪 Test 1: Basic query without tools")

    options = ClaudeAgentOptions(
        system_prompt="You are a helpful assistant. Be very brief.",
        max_turns=1,
        model="claude-sonnet-4-5",
    )

    async with ClaudeSDKClient(options=options) as client:
        print("   Sending query...")
        await client.query("Say 'Hello' and nothing else.")

        print("   Receiving response...")
        response = ""
        async for msg in client.receive_response():
            response += str(msg)

        print(f"   ✅ Response: {response[:100]}...")


async def test_with_tools():
    """Test Claude SDK with MCP tools"""
    print("\n🧪 Test 2: Query with MCP tools")

    # Create MCP server config
    mcp_server = create_sdk_mcp_server(
        name="test",
        version="1.0.0",
        tools=[echo_tool]
    )

    options = ClaudeAgentOptions(
        system_prompt="You are a helpful assistant. Use the echo tool when asked.",
        max_turns=3,
        model="claude-sonnet-4-5",
        # mcp_servers is a DICT: {"server_name": config}
        mcp_servers={"test": mcp_server},
        # allowed_tools uses just tool names (not mcp__server__name)
        allowed_tools=["echo"],
    )

    async with ClaudeSDKClient(options=options) as client:
        print("   Sending query that should trigger tool use...")
        await client.query("Use the echo tool to echo 'test message'")

        print("   Receiving response...")
        response = ""
        async for msg in client.receive_response():
            response += str(msg)

        print(f"   ✅ Response: {response[:200]}...")


async def main():
    print("=" * 50)
    print("Claude Agent SDK Test")
    print("=" * 50)

    try:
        await test_basic()
        await test_with_tools()
        print("\n✅ All tests passed!")
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
