#!/usr/bin/env python3
"""Test script for GitWiki"""

from storage import GitWiki
from config import WIKI_REPO_PATH

# Initialize wiki
wiki = GitWiki(WIKI_REPO_PATH)

print("Testing GitWiki...")

# Test 1: List pages
print("\n1. Listing pages:")
pages = wiki.list_pages()
for page in pages:
    print(f"  - {page['title']}")

# Test 2: Create a new page
print("\n2. Creating new page 'CLI Test'...")
try:
    new_page = wiki.create_page(
        title="CLI Test",
        content="# CLI Test\n\nThis is a test page created from CLI.",
        author="Test Script",
        tags=["test", "cli"]
    )
    print(f"  ✓ Created: {new_page['title']}")
except Exception as e:
    print(f"  ✗ Error: {e}")
    import traceback
    traceback.print_exc()

# Test 3: Read a page
print("\n3. Reading page 'CLI Test'...")
try:
    page = wiki.get_page("CLI Test")
    print(f"  ✓ Read: {page['title']}")
    print(f"  Content: {page['content'][:50]}...")
except Exception as e:
    print(f"  ✗ Error: {e}")

# Test 4: Update the page
print("\n4. Updating page 'CLI Test'...")
try:
    updated = wiki.update_page(
        title="CLI Test",
        content="# CLI Test (Updated)\n\nThis page has been updated!",
        author="Test Script"
    )
    print(f"  ✓ Updated: {updated['title']}")
except Exception as e:
    print(f"  ✗ Error: {e}")

# Test 5: Get history
print("\n5. Getting page history...")
try:
    history = wiki.get_page_history("CLI Test", limit=5)
    print(f"  ✓ Found {len(history)} commits:")
    for commit in history:
        print(f"    - {commit['short_sha']}: {commit['message']}")
except Exception as e:
    print(f"  ✗ Error: {e}")

# Test 6: Delete the page
print("\n6. Deleting page 'CLI Test'...")
try:
    wiki.delete_page("CLI Test", "Test Script")
    print(f"  ✓ Deleted")
except Exception as e:
    print(f"  ✗ Error: {e}")

print("\n✅ Test complete!")
