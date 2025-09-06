import pytest
import tempfile
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database.models import Base, Page
from database.crud import PageCRUD

class TestPageCRUD:
    """Test suite for Page CRUD operations"""
    
    @pytest.fixture
    def db_session(self):
        """Create temporary SQLite database for testing"""
        # Create temporary SQLite database
        engine = create_engine("sqlite:///:memory:", echo=False)
        Base.metadata.create_all(bind=engine)
        
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        session = SessionLocal()
        
        yield session
        
        session.close()
    
    def test_create_page(self, db_session):
        """Test page creation"""
        page = PageCRUD.create_page(
            db=db_session,
            title="Test Page",
            content="This is test content",
            author="test_user",
            tags=["test", "example"]
        )
        
        assert page.id is not None
        assert page.title == "Test Page"
        assert page.content == "This is test content"
        assert page.author == "test_user"
        assert page.tags == ["test", "example"]
        assert page.created_at is not None
        assert page.updated_at is not None
    
    def test_get_page_by_title(self, db_session):
        """Test retrieving page by title"""
        # Create a test page
        created_page = PageCRUD.create_page(
            db=db_session,
            title="Find Me",
            content="Search content"
        )
        
        # Find the page
        found_page = PageCRUD.get_page_by_title(db_session, "Find Me")
        
        assert found_page is not None
        assert found_page.id == created_page.id
        assert found_page.title == "Find Me"
        assert found_page.content == "Search content"
    
    def test_get_page_by_title_not_found(self, db_session):
        """Test retrieving non-existent page"""
        page = PageCRUD.get_page_by_title(db_session, "Non-existent Page")
        assert page is None
    
    def test_update_page(self, db_session):
        """Test page updates"""
        # Create a test page
        page = PageCRUD.create_page(
            db=db_session,
            title="Update Me",
            content="Original content"
        )
        
        # Update the page
        updated_page = PageCRUD.update_page(
            db=db_session,
            page_id=page.id,
            content="Updated content",
            tags=["updated"]
        )
        
        assert updated_page is not None
        assert updated_page.content == "Updated content"
        assert updated_page.tags == ["updated"]
        assert updated_page.updated_at > updated_page.created_at
    
    def test_update_page_by_title(self, db_session):
        """Test page update by title"""
        # Create a test page
        PageCRUD.create_page(
            db=db_session,
            title="Update By Title",
            content="Original content"
        )
        
        # Update by title
        updated_page = PageCRUD.update_page_by_title(
            db=db_session,
            title="Update By Title",
            content="New content via title"
        )
        
        assert updated_page is not None
        assert updated_page.content == "New content via title"
    
    def test_search_pages(self, db_session):
        """Test page search functionality"""
        # Create test pages
        PageCRUD.create_page(
            db=db_session,
            title="Python Programming",
            content="Learn Python programming language"
        )
        PageCRUD.create_page(
            db=db_session,
            title="JavaScript Guide",
            content="JavaScript programming tutorial"
        )
        PageCRUD.create_page(
            db=db_session,
            title="Data Science",
            content="Introduction to data science with Python"
        )
        
        # Search by title
        python_pages = PageCRUD.search_pages(db_session, "Python")
        assert len(python_pages) == 2
        
        # Search by content
        programming_pages = PageCRUD.search_pages(db_session, "programming")
        assert len(programming_pages) == 2
        
        # Search with no results
        no_results = PageCRUD.search_pages(db_session, "NonExistentTerm")
        assert len(no_results) == 0
    
    def test_get_all_pages(self, db_session):
        """Test getting all pages with pagination"""
        # Create multiple test pages
        for i in range(5):
            PageCRUD.create_page(
                db=db_session,
                title=f"Page {i+1}",
                content=f"Content for page {i+1}"
            )
        
        # Get all pages
        all_pages = PageCRUD.get_all_pages(db_session)
        assert len(all_pages) == 5
        
        # Test pagination
        first_two = PageCRUD.get_all_pages(db_session, skip=0, limit=2)
        assert len(first_two) == 2
        
        next_two = PageCRUD.get_all_pages(db_session, skip=2, limit=2)
        assert len(next_two) == 2
    
    def test_delete_page(self, db_session):
        """Test page deletion"""
        # Create a test page
        page = PageCRUD.create_page(
            db=db_session,
            title="Delete Me",
            content="To be deleted"
        )
        
        # Delete the page
        deleted = PageCRUD.delete_page(db_session, page.id)
        assert deleted is True
        
        # Verify deletion
        found = PageCRUD.get_page_by_id(db_session, page.id)
        assert found is None
        
        # Try deleting non-existent page
        not_deleted = PageCRUD.delete_page(db_session, 99999)
        assert not_deleted is False