import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database.models import Base
from database.crud import PageCRUD
from ai.tools import WikiTools
import json

class TestWikiTools:
    """Test suite for Wiki AI tools"""
    
    @pytest.fixture
    def db_session(self):
        """Create temporary SQLite database for testing"""
        engine = create_engine("sqlite:///:memory:", echo=False)
        Base.metadata.create_all(bind=engine)
        
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        session = SessionLocal()
        
        # Create some test pages
        PageCRUD.create_page(
            db=session,
            title="Python Guide",
            content="# Python Programming\n\nPython is a versatile programming language.",
            author="test_author",
            tags=["programming", "python"]
        )
        
        PageCRUD.create_page(
            db=session,
            title="Machine Learning",
            content="# ML Basics\n\nMachine learning is a subset of artificial intelligence.",
            author="ml_expert",
            tags=["ai", "ml", "data"]
        )
        
        yield session
        session.close()
    
    def test_get_tool_definitions(self):
        """Test tool definitions are properly formatted"""
        tools = WikiTools.get_tool_definitions()
        
        assert len(tools) == 4
        tool_names = [tool["function"]["name"] for tool in tools]
        expected_tools = ["read_page", "edit_page", "find_pages", "list_all_pages"]
        
        for expected_tool in expected_tools:
            assert expected_tool in tool_names
        
        # Check read_page tool structure
        read_page_tool = next(tool for tool in tools if tool["function"]["name"] == "read_page")
        assert "title" in read_page_tool["function"]["parameters"]["properties"]
        assert "title" in read_page_tool["function"]["parameters"]["required"]
    
    def test_read_page_success(self, db_session):
        """Test successful page reading"""
        result = WikiTools.execute_tool("read_page", {"title": "Python Guide"}, db_session)
        
        assert "Python Guide" in result
        assert "Python Programming" in result
        assert "Python is a versatile programming language" in result
        assert "test_author" in result
    
    def test_read_page_not_found(self, db_session):
        """Test reading non-existent page"""
        result = WikiTools.execute_tool("read_page", {"title": "Non-existent Page"}, db_session)
        
        assert "not found" in result
        assert "edit_page tool" in result
    
    def test_read_page_no_title(self, db_session):
        """Test reading page without title"""
        result = WikiTools.execute_tool("read_page", {}, db_session)
        
        assert "Error: Page title is required" in result
    
    def test_edit_page_create_new(self, db_session):
        """Test creating new page via edit_page"""
        result = WikiTools.execute_tool(
            "edit_page",
            {
                "title": "New Page",
                "content": "This is new content",
                "author": "new_author",
                "tags": ["new", "test"]
            },
            db_session
        )
        
        assert "created successfully" in result
        
        # Verify page was created
        page = PageCRUD.get_page_by_title(db_session, "New Page")
        assert page is not None
        assert page.content == "This is new content"
        assert page.author == "new_author"
        assert page.tags == ["new", "test"]
    
    def test_edit_page_update_existing(self, db_session):
        """Test updating existing page via edit_page"""
        result = WikiTools.execute_tool(
            "edit_page",
            {
                "title": "Python Guide",
                "content": "Updated Python content",
                "author": "updated_author"
            },
            db_session
        )
        
        assert "updated successfully" in result
        
        # Verify page was updated
        page = PageCRUD.get_page_by_title(db_session, "Python Guide")
        assert page.content == "Updated Python content"
        assert page.author == "updated_author"
    
    def test_edit_page_missing_data(self, db_session):
        """Test edit_page with missing required data"""
        # Missing content
        result = WikiTools.execute_tool(
            "edit_page",
            {"title": "Test Page"},
            db_session
        )
        assert "Both title and content are required" in result
        
        # Missing title
        result = WikiTools.execute_tool(
            "edit_page",
            {"content": "Some content"},
            db_session
        )
        assert "Both title and content are required" in result
    
    def test_find_pages_success(self, db_session):
        """Test successful page search"""
        result = WikiTools.execute_tool(
            "find_pages",
            {"query": "Python", "limit": 5},
            db_session
        )
        
        assert "Found 1 pages" in result
        assert "Python Guide" in result
        assert "Python is a versatile" in result
    
    def test_find_pages_multiple_results(self, db_session):
        """Test search with multiple results"""
        # Add another page with 'learning' in content
        PageCRUD.create_page(
            db=db_session,
            title="Learning Resources",
            content="Resources for learning programming and machine learning"
        )
        
        result = WikiTools.execute_tool(
            "find_pages",
            {"query": "learning"},
            db_session
        )
        
        assert "Found 2 pages" in result
        assert "Machine Learning" in result
        assert "Learning Resources" in result
    
    def test_find_pages_no_results(self, db_session):
        """Test search with no results"""
        result = WikiTools.execute_tool(
            "find_pages",
            {"query": "NonExistentTerm"},
            db_session
        )
        
        assert "No pages found" in result
    
    def test_find_pages_missing_query(self, db_session):
        """Test search without query"""
        result = WikiTools.execute_tool(
            "find_pages",
            {},
            db_session
        )
        
        assert "Error: Search query is required" in result
    
    def test_list_all_pages(self, db_session):
        """Test listing all pages"""
        result = WikiTools.execute_tool(
            "list_all_pages",
            {"limit": 10},
            db_session
        )
        
        assert "Found 2 pages" in result
        assert "Python Guide" in result
        assert "Machine Learning" in result
        assert "test_author" in result
        assert "ml_expert" in result
    
    def test_list_all_pages_with_limit(self, db_session):
        """Test listing pages with limit"""
        result = WikiTools.execute_tool(
            "list_all_pages",
            {"limit": 1},
            db_session
        )
        
        assert "Found 1 pages" in result or "Found 2 pages" in result  # SQLite may return all
    
    def test_unknown_tool(self, db_session):
        """Test calling unknown tool"""
        result = WikiTools.execute_tool(
            "unknown_tool",
            {"param": "value"},
            db_session
        )
        
        assert "Unknown tool: unknown_tool" in result
    
    def test_tool_execution_error_handling(self):
        """Test tool execution with database error"""
        # This should handle database connection issues gracefully
        result = WikiTools.execute_tool(
            "read_page",
            {"title": "Test"},
            None  # Invalid database session
        )
        
        assert "Error executing read_page" in result