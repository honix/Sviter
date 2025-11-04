from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, ForeignKey, Index
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.sql import func
from datetime import datetime
from typing import List, Optional

Base = declarative_base()

class Page(Base):
    __tablename__ = "pages"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), unique=True, nullable=False, index=True)
    content = Column(Text, default="")
    content_json = Column(JSON, nullable=True)  # ProseMirror document JSON
    author = Column(String(255), default="anonymous")
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    tags = Column(JSON, default=[])
    
    def to_dict(self) -> dict:
        """Convert Page model to dictionary for JSON serialization"""
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "content_json": self.content_json,
            "author": self.author,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "tags": self.tags or []
        }


class PageRevision(Base):
    __tablename__ = "page_revisions"
    __table_args__ = (
        Index('idx_page_revision', 'page_id', 'revision_number'),
    )

    id = Column(Integer, primary_key=True, index=True)
    page_id = Column(Integer, ForeignKey('pages.id'), nullable=False, index=True)
    revision_number = Column(Integer, nullable=False)
    content = Column(Text, default="")  # Markdown content
    content_json = Column(JSON, nullable=True)  # ProseMirror document JSON
    author = Column(String(255), default="anonymous")
    created_at = Column(DateTime, default=func.now())
    comment = Column(Text, nullable=True)  # Optional save message/comment

    # Relationship to Page
    page = relationship("Page", backref="revisions")

    def to_dict(self) -> dict:
        """Convert PageRevision model to dictionary for JSON serialization"""
        return {
            "id": self.id,
            "page_id": self.page_id,
            "revision_number": self.revision_number,
            "content": self.content,
            "content_json": self.content_json,
            "author": self.author,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "comment": self.comment
        }