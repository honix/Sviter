from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from .models import Page
from typing import List, Optional
from datetime import datetime

class PageCRUD:
    """CRUD operations for Page model"""
    
    @staticmethod
    def create_page(db: Session, title: str, content: str = "", author: str = "anonymous", tags: List[str] = None) -> Page:
        """Create a new page"""
        if tags is None:
            tags = []
            
        db_page = Page(
            title=title,
            content=content,
            author=author,
            tags=tags
        )
        db.add(db_page)
        db.commit()
        db.refresh(db_page)
        return db_page
    
    @staticmethod
    def get_page_by_id(db: Session, page_id: int) -> Optional[Page]:
        """Get page by ID"""
        return db.query(Page).filter(Page.id == page_id).first()
    
    @staticmethod
    def get_page_by_title(db: Session, title: str) -> Optional[Page]:
        """Get page by title"""
        return db.query(Page).filter(Page.title == title).first()
    
    @staticmethod
    def get_all_pages(db: Session, skip: int = 0, limit: int = 100) -> List[Page]:
        """Get all pages with pagination"""
        return db.query(Page).offset(skip).limit(limit).all()
    
    @staticmethod
    def update_page(db: Session, page_id: int, title: str = None, content: str = None, 
                   author: str = None, tags: List[str] = None) -> Optional[Page]:
        """Update page by ID"""
        db_page = db.query(Page).filter(Page.id == page_id).first()
        if db_page:
            if title is not None:
                db_page.title = title
            if content is not None:
                db_page.content = content
            if author is not None:
                db_page.author = author
            if tags is not None:
                db_page.tags = tags
            db_page.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(db_page)
        return db_page
    
    @staticmethod
    def update_page_by_title(db: Session, title: str, content: str = None, 
                           author: str = None, tags: List[str] = None) -> Optional[Page]:
        """Update page by title"""
        db_page = db.query(Page).filter(Page.title == title).first()
        if db_page:
            if content is not None:
                db_page.content = content
            if author is not None:
                db_page.author = author
            if tags is not None:
                db_page.tags = tags
            db_page.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(db_page)
        return db_page
    
    @staticmethod
    def delete_page(db: Session, page_id: int) -> bool:
        """Delete page by ID"""
        db_page = db.query(Page).filter(Page.id == page_id).first()
        if db_page:
            db.delete(db_page)
            db.commit()
            return True
        return False
    
    @staticmethod
    def search_pages(db: Session, query: str) -> List[Page]:
        """Search pages by title or content"""
        search_term = f"%{query}%"
        return db.query(Page).filter(
            or_(
                Page.title.ilike(search_term),
                Page.content.ilike(search_term)
            )
        ).all()
    
    @staticmethod
    def get_pages_by_tag(db: Session, tag: str) -> List[Page]:
        """Get pages by tag"""
        return db.query(Page).filter(Page.tags.any(tag)).all()