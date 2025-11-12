from typing import Dict, List, Any, Optional
from storage import GitWiki, PageNotFoundException
import json
from datetime import datetime

class WikiTools:
    """Wiki-specific AI tools for page operations"""
    
    @staticmethod
    def get_tool_definitions() -> List[Dict[str, Any]]:
        """Get OpenAI tool definitions for wiki operations"""
        return [
            {
                "type": "function",
                "function": {
                    "name": "read_page",
                    "description": "Read the content of a wiki page by title. Returns the page content, metadata, and status.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "title": {
                                "type": "string",
                                "description": "The title of the wiki page to read"
                            }
                        },
                        "required": ["title"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "edit_page",
                    "description": "Create or update a wiki page with new content. If the page doesn't exist, it will be created.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "title": {
                                "type": "string",
                                "description": "The title of the wiki page to edit or create"
                            },
                            "content": {
                                "type": "string",
                                "description": "The new content for the page (supports markdown)"
                            },
                            "author": {
                                "type": "string",
                                "description": "The author of the edit (optional, defaults to 'ai-assistant')"
                            },
                            "tags": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Tags for the page (optional)"
                            }
                        },
                        "required": ["title", "content"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "find_pages",
                    "description": "Search for wiki pages by title or content. Returns a list of matching pages with their titles and excerpts.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "The search query to find pages"
                            },
                            "limit": {
                                "type": "integer",
                                "description": "Maximum number of results to return (default: 10)"
                            }
                        },
                        "required": ["query"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "list_all_pages",
                    "description": "Get a list of all wiki pages with their titles and basic metadata.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "limit": {
                                "type": "integer",
                                "description": "Maximum number of pages to return (default: 50)"
                            }
                        },
                        "required": []
                    }
                }
            }
        ]
    
    @staticmethod
    def execute_tool(tool_name: str, arguments: Dict[str, Any], wiki: GitWiki = None) -> str:
        """Execute a wiki tool and return the result as a string"""
        if wiki is None:
            # Default wiki repository path
            wiki = GitWiki("../wiki-repo")

        try:
            if tool_name == "read_page":
                return WikiTools._read_page(wiki, arguments.get("title"))
            elif tool_name == "edit_page":
                return WikiTools._edit_page(wiki, arguments)
            elif tool_name == "find_pages":
                return WikiTools._find_pages(wiki, arguments)
            elif tool_name == "list_all_pages":
                return WikiTools._list_all_pages(wiki, arguments)
            else:
                return f"Unknown tool: {tool_name}"
        except Exception as e:
            return f"Error executing {tool_name}: {str(e)}"
    
    @staticmethod
    def _read_page(wiki: GitWiki, title: str) -> str:
        """Read a wiki page by title"""
        if not title:
            return "Error: Page title is required"

        try:
            page = wiki.get_page(title)

            result = {
                "title": page["title"],
                "content": page["content"],
                "author": page["author"],
                "created_at": page["created_at"],
                "updated_at": page["updated_at"],
                "tags": page["tags"]
            }

            return f"Page '{title}' found:\n\nContent:\n{page['content']}\n\nMetadata: {json.dumps(result, indent=2)}"
        except PageNotFoundException:
            return f"Page '{title}' not found. You can create it using the edit_page tool."
    
    @staticmethod
    def _edit_page(wiki: GitWiki, arguments: Dict[str, Any]) -> str:
        """Edit or create a wiki page"""
        title = arguments.get("title")
        content = arguments.get("content")
        author = arguments.get("author", "AI Agent")
        tags = arguments.get("tags", [])

        if not title or content is None:
            return "Error: Both title and content are required"

        try:
            # Try to get existing page
            wiki.get_page(title)
            # Page exists, update it
            wiki.update_page(title, content, author, tags)
            return f"Page '{title}' updated successfully. New content length: {len(content)} characters."
        except PageNotFoundException:
            # Page doesn't exist, create it
            wiki.create_page(title, content, author, tags)
            return f"Page '{title}' created successfully. Content length: {len(content)} characters."
    
    @staticmethod
    def _find_pages(wiki: GitWiki, arguments: Dict[str, Any]) -> str:
        """Search for wiki pages"""
        query = arguments.get("query")
        limit = arguments.get("limit", 10)

        if not query:
            return "Error: Search query is required"

        pages = wiki.search_pages(query, limit)

        if not pages:
            return f"No pages found matching '{query}'"

        results = []
        for page in pages:
            # Create excerpt (first 200 characters)
            content = page["content"]
            excerpt = content[:200] + "..." if len(content) > 200 else content
            results.append({
                "title": page["title"],
                "excerpt": excerpt,
                "author": page["author"],
                "updated_at": page["updated_at"],
                "tags": page["tags"]
            })

        result_text = f"Found {len(pages)} pages matching '{query}':\n\n"
        for i, result in enumerate(results, 1):
            result_text += f"{i}. **{result['title']}** (by {result['author']})\n"
            result_text += f"   {result['excerpt']}\n"
            if result['tags']:
                result_text += f"   Tags: {', '.join(result['tags'])}\n"
            result_text += "\n"

        return result_text
    
    @staticmethod
    def _list_all_pages(wiki: GitWiki, arguments: Dict[str, Any]) -> str:
        """List all wiki pages"""
        limit = arguments.get("limit", 50)

        pages = wiki.list_pages(limit=limit)

        if not pages:
            return "No pages found in the wiki."

        result_text = f"Found {len(pages)} pages:\n\n"
        for i, page in enumerate(pages, 1):
            result_text += f"{i}. **{page['title']}** (by {page['author']})\n"

            # Format dates if available
            if page.get('created_at'):
                try:
                    created = datetime.fromisoformat(page['created_at']).strftime('%Y-%m-%d %H:%M')
                    result_text += f"   Created: {created}\n"
                except:
                    result_text += f"   Created: {page['created_at']}\n"

            if page.get('updated_at'):
                try:
                    updated = datetime.fromisoformat(page['updated_at']).strftime('%Y-%m-%d %H:%M')
                    result_text += f"   Updated: {updated}\n"
                except:
                    result_text += f"   Updated: {page['updated_at']}\n"

            if page.get('tags'):
                result_text += f"   Tags: {', '.join(page['tags'])}\n"
            result_text += "\n"

        return result_text