import pytest
import asyncio
import json
from unittest.mock import Mock, AsyncMock, patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database.models import Base
from database.crud import PageCRUD
from api.websocket import WebSocketManager

class TestWebSocketManager:
    """Test suite for WebSocket manager and chat functionality"""
    
    @pytest.fixture
    def websocket_manager(self):
        """Create WebSocket manager for testing"""
        return WebSocketManager()
    
    @pytest.fixture
    def mock_websocket(self):
        """Create mock WebSocket connection"""
        mock_ws = AsyncMock()
        mock_ws.accept = AsyncMock()
        mock_ws.send_text = AsyncMock()
        mock_ws.receive_text = AsyncMock()
        return mock_ws
    
    @pytest.fixture
    def db_session(self):
        """Create temporary SQLite database for testing"""
        engine = create_engine("sqlite:///:memory:", echo=False)
        Base.metadata.create_all(bind=engine)
        
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        session = SessionLocal()
        
        # Create test page
        PageCRUD.create_page(
            db=session,
            title="Test Page",
            content="This is test content for WebSocket testing",
            author="test_user"
        )
        
        yield session
        session.close()
    
    @pytest.mark.asyncio
    async def test_connect_and_disconnect(self, websocket_manager, mock_websocket):
        """Test WebSocket connection and disconnection"""
        client_id = "test_client"
        
        with patch('api.websocket.get_db_session') as mock_db:
            mock_db.return_value = Mock()
            
            # Test connection
            await websocket_manager.connect(mock_websocket, client_id)
            
            assert client_id in websocket_manager.active_connections
            assert client_id in websocket_manager.chat_handlers
            mock_websocket.accept.assert_called_once()
            
            # Test disconnection
            await websocket_manager.disconnect(client_id)
            
            assert client_id not in websocket_manager.active_connections
            assert client_id not in websocket_manager.chat_handlers
    
    @pytest.mark.asyncio
    async def test_send_message(self, websocket_manager, mock_websocket):
        """Test sending message to client"""
        client_id = "test_client"
        websocket_manager.active_connections[client_id] = mock_websocket
        
        test_message = {"type": "test", "content": "Hello"}
        await websocket_manager.send_message(client_id, test_message)
        
        mock_websocket.send_text.assert_called_once_with(json.dumps(test_message))
    
    @pytest.mark.asyncio
    async def test_handle_chat_message(self, websocket_manager, mock_websocket, db_session):
        """Test handling chat message with tool calls"""
        client_id = "test_client"
        
        # Setup mock chat handler
        mock_chat_handler = Mock()
        mock_chat_handler.process_message.return_value = {
            "success": True,
            "data": {
                "message": "I can help you with that.",
                "tool_calls": [
                    {
                        "tool_name": "read_page",
                        "arguments": {"title": "Test Page"},
                        "result": "Page content found",
                        "iteration": 1
                    }
                ],
                "final_response": "Here is the information you requested.",
                "iterations": 1  # Single iteration - should NOT send final response due to duplicate prevention
            }
        }
        
        websocket_manager.active_connections[client_id] = mock_websocket
        websocket_manager.chat_handlers[client_id] = mock_chat_handler
        
        # Test chat message handling
        message_data = {
            "type": "chat",
            "message": "Can you read the Test Page?"
        }
        
        result = await websocket_manager.handle_message(client_id, message_data)
        
        assert result["type"] == "success"
        mock_chat_handler.process_message.assert_called_once_with("Can you read the Test Page?")
        
        # Verify messages were sent: initial response + tool call (no final response due to duplicate prevention)
        assert mock_websocket.send_text.call_count == 2  # Initial response, tool call (no duplicate final response)
    
    @pytest.mark.asyncio
    async def test_handle_reset_message(self, websocket_manager):
        """Test handling conversation reset"""
        client_id = "test_client"
        
        mock_chat_handler = Mock()
        mock_chat_handler.reset_conversation = Mock()
        
        websocket_manager.chat_handlers[client_id] = mock_chat_handler
        
        message_data = {"type": "reset"}
        result = await websocket_manager.handle_message(client_id, message_data)
        
        assert result["type"] == "success"
        assert "reset" in result["message"].lower()
        mock_chat_handler.reset_conversation.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_handle_get_history_message(self, websocket_manager):
        """Test handling get conversation history"""
        client_id = "test_client"
        
        mock_history = [
            {"role": "system", "content": "You are a helpful assistant"},
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"}
        ]
        
        mock_chat_handler = Mock()
        mock_chat_handler.get_conversation_history.return_value = mock_history
        
        websocket_manager.chat_handlers[client_id] = mock_chat_handler
        
        message_data = {"type": "get_history"}
        result = await websocket_manager.handle_message(client_id, message_data)
        
        assert result["type"] == "history"
        assert result["data"] == mock_history
        mock_chat_handler.get_conversation_history.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_handle_unknown_message_type(self, websocket_manager):
        """Test handling unknown message type"""
        client_id = "test_client"
        websocket_manager.chat_handlers[client_id] = Mock()  # Need handler to exist
        
        message_data = {"type": "unknown_type", "data": "some data"}
        result = await websocket_manager.handle_message(client_id, message_data)
        
        assert result["type"] == "error"
        assert "Unknown message type" in result["message"]
    
    @pytest.mark.asyncio
    async def test_handle_message_without_handler(self, websocket_manager):
        """Test handling message when chat handler doesn't exist"""
        client_id = "nonexistent_client"
        
        message_data = {"type": "chat", "message": "Hello"}
        result = await websocket_manager.handle_message(client_id, message_data)
        
        assert result["type"] == "error"
        assert "Chat handler not found" in result["message"]
    
    @pytest.mark.asyncio
    async def test_handle_empty_chat_message(self, websocket_manager):
        """Test handling empty chat message"""
        client_id = "test_client"
        websocket_manager.chat_handlers[client_id] = Mock()
        
        message_data = {"type": "chat", "message": ""}
        result = await websocket_manager.handle_message(client_id, message_data)
        
        assert result["type"] == "error"
        assert "Empty message" in result["message"]
    
    @pytest.mark.asyncio
    async def test_chat_handler_error(self, websocket_manager):
        """Test handling chat handler errors"""
        client_id = "test_client"

        mock_chat_handler = Mock()
        mock_chat_handler.process_message.return_value = {
            "success": False,
            "error": "Database connection failed"
        }

        websocket_manager.chat_handlers[client_id] = mock_chat_handler

        message_data = {"type": "chat", "message": "Test message"}
        result = await websocket_manager.handle_message(client_id, message_data)

        assert result["type"] == "error"
        assert "Database connection failed" in result["message"]

    @pytest.mark.asyncio
    async def test_single_iteration_no_duplicate_responses(self, websocket_manager, mock_websocket):
        """Test that single iteration messages don't produce duplicate chat_response messages"""
        client_id = "test_client"

        # Setup mock chat handler that returns a single iteration response (no tool calls)
        mock_chat_handler = Mock()
        mock_chat_handler.process_message.return_value = {
            "success": True,
            "data": {
                "message": "Hello! How can I help you with the wiki today?",
                "tool_calls": [],  # No tool calls = single iteration
                "final_response": "",  # No final response for single iteration
                "iterations": 1
            }
        }

        websocket_manager.active_connections[client_id] = mock_websocket
        websocket_manager.chat_handlers[client_id] = mock_chat_handler

        # Test simple chat message that should result in single iteration
        message_data = {
            "type": "chat",
            "message": "hello"
        }

        result = await websocket_manager.handle_message(client_id, message_data)

        # Verify the handler returned success
        assert result["type"] == "success"
        mock_chat_handler.process_message.assert_called_once_with("hello")

        # Get all the calls made to send_text to verify message count
        send_calls = mock_websocket.send_text.call_args_list

        # Parse all sent messages
        sent_messages = []
        for call in send_calls:
            message_json = call[0][0]  # First argument to send_text
            parsed_message = json.loads(message_json)
            sent_messages.append(parsed_message)

        # Count chat_response messages specifically
        chat_responses = [msg for msg in sent_messages if msg.get("type") == "chat_response"]

        # Verify exactly ONE chat_response was sent (no duplicates)
        assert len(chat_responses) == 1, f"Expected 1 chat_response, got {len(chat_responses)}: {chat_responses}"

        # Verify the content is correct
        assert chat_responses[0]["message"] == "Hello! How can I help you with the wiki today?"

        # Note: Success messages are sent at the WebSocket endpoint level, not via send_message
        # So we don't expect to see them in the mock_websocket.send_text calls
        # The important thing is that we only got 1 chat_response, not 2

    @pytest.mark.asyncio
    async def test_multistep_process_no_duplicate_responses(self, websocket_manager, mock_websocket):
        """Test that multistep processes send final response only (no initial response)"""
        client_id = "test_client"

        # Setup mock chat handler that returns a multistep response with tool calls
        mock_chat_handler = Mock()
        mock_chat_handler.process_message.return_value = {
            "success": True,
            "data": {
                "message": "I'll help you read that page.",  # Initial message
                "tool_calls": [
                    {
                        "tool_name": "read_page",
                        "arguments": {"title": "Test Page"},
                        "result": "Page content found: Test content",
                        "iteration": 1
                    }
                ],
                "final_response": "Here is the content from the Test Page: Test content",
                "iterations": 2  # Multiple iterations
            }
        }

        websocket_manager.active_connections[client_id] = mock_websocket
        websocket_manager.chat_handlers[client_id] = mock_chat_handler

        # Test message that triggers tool usage
        message_data = {
            "type": "chat",
            "message": "Can you read the Test Page?"
        }

        result = await websocket_manager.handle_message(client_id, message_data)

        # Verify the handler returned success
        assert result["type"] == "success"

        # Get all sent messages
        send_calls = mock_websocket.send_text.call_args_list
        sent_messages = []
        for call in send_calls:
            message_json = call[0][0]
            parsed_message = json.loads(message_json)
            sent_messages.append(parsed_message)

        # Count different message types
        chat_responses = [msg for msg in sent_messages if msg.get("type") == "chat_response"]
        tool_calls = [msg for msg in sent_messages if msg.get("type") == "tool_call"]
        process_info = [msg for msg in sent_messages if msg.get("type") == "process_info"]

        # For multistep: should have NO initial response, but SHOULD have final response
        assert len(chat_responses) == 1, f"Expected 1 final chat_response, got {len(chat_responses)}"
        assert chat_responses[0]["message"] == "Here is the content from the Test Page: Test content"

        # Should have tool call messages
        assert len(tool_calls) == 1, f"Expected 1 tool_call, got {len(tool_calls)}"
        assert tool_calls[0]["tool_name"] == "read_page"

        # Should have process info for multistep
        assert len(process_info) == 1, f"Expected 1 process_info, got {len(process_info)}"
        assert process_info[0]["iterations"] == 2

    @pytest.mark.asyncio
    async def test_no_response_content_no_duplicate(self, websocket_manager, mock_websocket):
        """Test edge case where there's no response content but no duplicates should be sent"""
        client_id = "test_client"

        # Setup mock chat handler with empty response
        mock_chat_handler = Mock()
        mock_chat_handler.process_message.return_value = {
            "success": True,
            "data": {
                "message": "",  # Empty message
                "tool_calls": [],
                "final_response": "",  # Empty final response
                "iterations": 1
            }
        }

        websocket_manager.active_connections[client_id] = mock_websocket
        websocket_manager.chat_handlers[client_id] = mock_chat_handler

        message_data = {"type": "chat", "message": "test"}
        result = await websocket_manager.handle_message(client_id, message_data)

        # Should still succeed but send no chat responses
        assert result["type"] == "success"

        # Verify no chat_response messages were sent for empty content
        send_calls = mock_websocket.send_text.call_args_list
        sent_messages = []
        for call in send_calls:
            message_json = call[0][0]
            parsed_message = json.loads(message_json)
            sent_messages.append(parsed_message)

        chat_responses = [msg for msg in sent_messages if msg.get("type") == "chat_response"]
        assert len(chat_responses) == 0, f"Expected 0 chat_response for empty content, got {len(chat_responses)}"