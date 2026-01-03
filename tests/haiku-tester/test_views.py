"""
E2E tests for wiki page views using Claude CLI with Chrome MCP.
"""
import pytest

from tests.claude_runner import run_claude_test


class TestChat:
    """Tests for chat functionality."""

    def test_list_pages_and_click(self, base_url):
        """
        Test that assistant can list pages and they are clickable.

        Asks the assistant to list all pages and verifies the response
        contains clickable page links.
        """
        prompt = f"""
Using Chrome MCP tools, test {base_url}:

1. First get the browser tab context
2. Navigate to {base_url}
3. Wait for the page to load, take a screenshot
4. Find the chat input area on the right side of the page
5. Type "list all pages" in the chat input and send the message
6. Wait for the assistant response (may take a few seconds)
7. Check the assistant's response for page names
8. Verify that page names in the response are clickable links (not plain text)
9. Click on one of the page links in the assistant's response
10. Verify the center panel updates to show the clicked page content

Set passed=true only if ALL conditions are met:
- The assistant responds with a list of pages
- Page names in the response are rendered as clickable links
- Clicking a page link navigates to that page in the center panel

Include each check in the checks array with item and status (passed/failed).
"""
        result = run_claude_test(prompt, model="haiku", timeout=300)

        print(f"\n=== Test Output ===")
        print(f"Passed: {result.passed}")
        print(f"Details: {result.details}")
        print(f"Checks: {result.checks}")
        if not result.passed:
            print(f"Raw output:\n{result.raw_output[:2000]}")

        assert result.passed, f"Test failed: {result.details}"


class TestPageViews:
    """Tests for page view functionality."""

    def test_raw_formatted_match(self, base_url):
        """
        Test that raw and formatted views show the same content.

        Opens Concepts.md, compares raw markdown with formatted render.
        """
        prompt = f"""
Using Chrome MCP tools, test {base_url}:

1. First get the browser tab context
2. Navigate to {base_url}
3. Wait for the page to load, take a screenshot
4. Click on "Concepts.md" in the left sidebar
5. Note the content shown in "Formatted" view (this is the default)
6. Click the "Raw" button in the top right area of the center panel
7. Compare the raw markdown content with the formatted view

Verify and set passed=true only if ALL conditions are met:
- The raw markdown source matches the rendered formatted content
- Headers in raw (#, ##) correspond to large text in formatted
- Bold markers (**text**) correspond to bold text in formatted
- Lists in raw (-, 1.) correspond to bullet/numbered lists in formatted

Include each check in the checks array with item and status (passed/failed).
"""
        result = run_claude_test(prompt, model="haiku", timeout=180)

        print(f"\n=== Test Output ===")
        print(f"Passed: {result.passed}")
        print(f"Details: {result.details}")
        print(f"Checks: {result.checks}")
        if not result.passed:
            print(f"Raw output:\n{result.raw_output[:2000]}")

        assert result.passed, f"Test failed: {result.details}"

    def test_page_navigation(self, base_url):
        """
        Test that clicking pages in sidebar navigates correctly.
        """
        prompt = f"""
Using Chrome MCP tools, test {base_url}:

1. Get browser tab context and navigate to {base_url}
2. Take a screenshot of the initial page
3. Click on "Home.md" in the left sidebar
4. Verify the center panel shows "Welcome to Test Wiki"
5. Click on "TestPage.md" in the sidebar
6. Verify the center panel shows "Test Page" heading

Set passed=true only if both pages load correctly.
Include checks for each page navigation.
"""
        result = run_claude_test(prompt, model="haiku", timeout=180)

        print(f"\n=== Test Output ===")
        print(f"Passed: {result.passed}")
        print(f"Details: {result.details}")

        assert result.passed, f"Test failed: {result.details}"


class TestMarkdownRendering:
    """Tests for markdown rendering in formatted view."""

    def test_formatting_elements(self, base_url):
        """
        Test that markdown elements render correctly.
        """
        prompt = f"""
Using Chrome MCP tools, test {base_url}:

1. Navigate to {base_url}
2. Click on "TestPage.md" in the sidebar
3. Verify the formatted view shows:
   - Bold text is actually bold (not showing ** markers)
   - Italic text is actually italic
   - Code blocks have distinct styling
   - Lists are properly formatted
   - Links are clickable (styled differently from plain text)

Set passed=true only if all formatting elements render correctly.
Include a check for each element type.
"""
        result = run_claude_test(prompt, model="haiku", timeout=300)

        print(f"\n=== Test Output ===")
        print(f"Passed: {result.passed}")
        print(f"Details: {result.details}")

        assert result.passed, f"Test failed: {result.details}"


class TestThreadWorkflow:
    """Tests for thread creation, editing, and approval workflow."""

    def test_thread_create_file_and_approve(self, base_url):
        """Test creating a file via thread, adding content, and approving."""
        prompt = f"""
Using Chrome MCP tools, test {base_url}:

1. Navigate to {base_url}
2. In the chat input on the right side, type "start a thread to create a new page called ABC" and press Enter
3. Wait for the AI response (may take 10-20 seconds) - it should show a thread was created
4. Wait for the thread to complete - a toast notification "Agent ready for review" may appear
5. Find and click the thread link (like "create-abc-page-XXXXX") in the chat messages
6. This opens thread review mode - verify ABC.md appears in the left sidebar with a green highlight
7. Click on ABC.md to view its content - verify it has a title and some introduction text
8. Click the green "Accept Changes" button on the right side
9. Navigate to main branch (click Home or use URL http://localhost:5173/main/ABC.md/view)
10. Verify ABC.md appears in the left sidebar on main branch

Set passed=true only if ALL conditions are met:
- Thread was created (chat shows thread link)
- ABC.md appears in thread review mode
- ABC.md has content (title and text)
- Changes were accepted (status shows "Accepted")
- ABC.md visible in main branch sidebar
"""
        result = run_claude_test(prompt, model="haiku", timeout=600)

        print(f"\n=== Test Output ===")
        print(f"Passed: {result.passed}")
        print(f"Details: {result.details}")
        print(f"Checks: {result.checks}")
        if not result.passed:
            print(f"Raw output:\n{result.raw_output[:3000]}")

        assert result.passed, f"Test failed: {result.details}"
