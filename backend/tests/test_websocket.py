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
            websocket_manager.disconnect(client_id)
            
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
                        "result": "Page content found"
                    }
                ],
                "final_response": "Here is the information you requested."
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
        
        # Verify messages were sent
        assert mock_websocket.send_text.call_count >= 3  # Initial response, tool call, final response
    
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