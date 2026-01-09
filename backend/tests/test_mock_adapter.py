"""Tests for mock LLM adapter context parsing."""
import pytest
from ai.adapters.mock import parse_user_context


class TestParseUserContext:
    """Tests for parse_user_context function."""

    def test_no_context_returns_original_message(self):
        """Message without context XML returns unchanged."""
        message = "Hello, can you help me?"
        clean, contexts = parse_user_context(message)

        assert clean == message
        assert contexts == []

    def test_single_context_with_source(self):
        """Single context item with source is parsed correctly."""
        message = '''What does this mean?

<userProvidedContext>
<contextItem id="#1" source="TestPage.md">
various formatting examples
</contextItem>
</userProvidedContext>'''

        clean, contexts = parse_user_context(message)

        assert clean == "What does this mean?"
        assert len(contexts) == 1
        assert contexts[0]['id'] == '#1'
        assert contexts[0]['source'] == 'TestPage.md'
        assert contexts[0]['content'] == 'various formatting examples'

    def test_single_context_without_source(self):
        """Context without source attribute is handled."""
        message = '''Analyze this

<userProvidedContext>
<contextItem id="#1">
some selected text
</contextItem>
</userProvidedContext>'''

        clean, contexts = parse_user_context(message)

        assert clean == "Analyze this"
        assert len(contexts) == 1
        assert contexts[0]['id'] == '#1'
        assert contexts[0]['source'] == ''
        assert contexts[0]['content'] == 'some selected text'

    def test_multiple_contexts(self):
        """Multiple context items are all parsed."""
        message = '''Help with these

<userProvidedContext>
<contextItem id="#1" source="Home.md">
Welcome to wiki
</contextItem>
<contextItem id="#2" source="TestPage.md">
[path: TestPage.md]
</contextItem>
</userProvidedContext>'''

        clean, contexts = parse_user_context(message)

        assert clean == "Help with these"
        assert len(contexts) == 2
        assert contexts[0]['id'] == '#1'
        assert contexts[0]['source'] == 'Home.md'
        assert contexts[1]['id'] == '#2'
        assert contexts[1]['source'] == 'TestPage.md'
        assert '[path: TestPage.md]' in contexts[1]['content']

    def test_multiline_content(self):
        """Multiline content in context is preserved."""
        message = '''Review this code

<userProvidedContext>
<contextItem id="#1" source="Code.tsx">
function hello() {
  console.log("Hello");
  return true;
}
</contextItem>
</userProvidedContext>'''

        clean, contexts = parse_user_context(message)

        assert clean == "Review this code"
        assert len(contexts) == 1
        assert 'function hello()' in contexts[0]['content']
        assert 'console.log' in contexts[0]['content']
        assert contexts[0]['content'].count('\n') >= 2

    def test_context_with_path_reference(self):
        """Path reference format is correctly identified."""
        message = '''Tell me about this

<userProvidedContext>
<contextItem id="#1" source="README.md">
[path: README.md]
</contextItem>
</userProvidedContext>'''

        clean, contexts = parse_user_context(message)

        assert clean == "Tell me about this"
        assert len(contexts) == 1
        assert contexts[0]['content'] == '[path: README.md]'
