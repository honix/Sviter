from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc
from .models import Page, PageRevision
from typing import List, Optional
from datetime import datetime

class PageCRUD:
    """CRUD operations for Page model"""
    
    @staticmethod
    def create_page(db: Session, title: str, content: str = "", content_json: dict = None, author: str = "anonymous", tags: List[str] = None) -> Page:
        """Create a new page"""
        if tags is None:
            tags = []

        db_page = Page(
            title=title,
            content=content,
            content_json=content_json,
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
                   content_json: dict = None, author: str = None, tags: List[str] = None) -> Optional[Page]:
        """Update page by ID"""
        db_page = db.query(Page).filter(Page.id == page_id).first()
        if db_page:
            if title is not None:
                db_page.title = title
            if content is not None:
                db_page.content = content
            if content_json is not None:
                db_page.content_json = content_json
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
                           content_json: dict = None, author: str = None, tags: List[str] = None) -> Optional[Page]:
        """Update page by title"""
        db_page = db.query(Page).filter(Page.title == title).first()
        if db_page:
            if content is not None:
                db_page.content = content
            if content_json is not None:
                db_page.content_json = content_json
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


class RevisionCRUD:
    """CRUD operations for PageRevision model"""

    @staticmethod
    def create_revision(db: Session, page_id: int, content: str, content_json: dict = None,
                       author: str = "anonymous", comment: str = None) -> PageRevision:
        """Create a new revision for a page"""
        # Get the latest revision number for this page
        latest_revision = db.query(PageRevision).filter(
            PageRevision.page_id == page_id
        ).order_by(desc(PageRevision.revision_number)).first()

        revision_number = 1 if latest_revision is None else latest_revision.revision_number + 1

        db_revision = PageRevision(
            page_id=page_id,
            revision_number=revision_number,
            content=content,
            content_json=content_json,
            author=author,
            comment=comment
        )
        db.add(db_revision)
        db.commit()
        db.refresh(db_revision)
        return db_revision

    @staticmethod
    def get_revisions_by_page(db: Session, page_id: int, limit: int = 50) -> List[PageRevision]:
        """Get all revisions for a page, ordered by newest first"""
        return db.query(PageRevision).filter(
            PageRevision.page_id == page_id
        ).order_by(desc(PageRevision.revision_number)).limit(limit).all()

    @staticmethod
    def get_revision(db: Session, revision_id: int) -> Optional[PageRevision]:
        """Get a specific revision by ID"""
        return db.query(PageRevision).filter(PageRevision.id == revision_id).first()

    @staticmethod
    def get_latest_revision(db: Session, page_id: int) -> Optional[PageRevision]:
        """Get the most recent revision for a page"""
        return db.query(PageRevision).filter(
            PageRevision.page_id == page_id
        ).order_by(desc(PageRevision.revision_number)).first()

    @staticmethod
    def get_revision_count(db: Session, page_id: int) -> int:
        """Get the total number of revisions for a page"""
        return db.query(PageRevision).filter(PageRevision.page_id == page_id).count()