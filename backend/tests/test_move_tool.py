"""
Unit tests for the move tool.
"""
import pytest
import tempfile
import shutil
from pathlib import Path
from storage.git_wiki import GitWiki
from ai.tools import _move


@pytest.fixture
def temp_wiki():
    """Create a temporary wiki for testing."""
    temp_dir = tempfile.mkdtemp()

    # Initialize git repo
    import subprocess
    subprocess.run(['git', 'init'], cwd=temp_dir, check=True)
    subprocess.run(['git', 'config', 'user.name', 'Test'], cwd=temp_dir, check=True)
    subprocess.run(['git', 'config', 'user.email', 'test@test.com'], cwd=temp_dir, check=True)

    wiki = GitWiki(temp_dir)

    yield wiki

    # Cleanup
    shutil.rmtree(temp_dir)


def test_move_rename_in_same_folder(temp_wiki):
    """Test renaming a file in the same folder."""
    # Create a test page
    temp_wiki.create_page('old-name.md', 'Test content', 'Test Author')

    # Rename it
    result = _move(temp_wiki, {
        'path': 'old-name.md',
        'new_path': 'new-name.md',
        'author': 'Test Author'
    })

    # Verify success message
    assert 'successfully' in result
    assert 'old-name.md' in result
    assert 'new-name.md' in result

    # Verify old file doesn't exist
    with pytest.raises(Exception):
        temp_wiki.get_page('old-name.md')

    # Verify new file exists
    page = temp_wiki.get_page('new-name.md')
    assert page['content'] == 'Test content'


def test_move_to_different_folder(temp_wiki):
    """Test moving a file to a different folder."""
    # Create a test page
    temp_wiki.create_page('file.md', 'Test content', 'Test Author')

    # Create target folder
    temp_wiki.create_folder('docs', author='Test Author')

    # Move the file
    result = _move(temp_wiki, {
        'path': 'file.md',
        'new_path': 'docs/file.md',
        'author': 'Test Author'
    })

    # Verify success message
    assert 'successfully' in result

    # Verify old file doesn't exist at root
    with pytest.raises(Exception):
        temp_wiki.get_page('file.md')

    # Verify new file exists in docs folder
    page = temp_wiki.get_page('docs/file.md')
    assert page['content'] == 'Test content'


def test_move_and_rename(temp_wiki):
    """Test moving a file to a different folder AND renaming it."""
    # Create a test page
    temp_wiki.create_page('old.md', 'Test content', 'Test Author')

    # Create target folder
    temp_wiki.create_folder('docs', author='Test Author')

    # Move and rename
    result = _move(temp_wiki, {
        'path': 'old.md',
        'new_path': 'docs/new.md',
        'author': 'Test Author'
    })

    # Verify success message
    assert 'successfully' in result

    # Verify old file doesn't exist
    with pytest.raises(Exception):
        temp_wiki.get_page('old.md')

    # Verify new file exists with new name in new location
    page = temp_wiki.get_page('docs/new.md')
    assert page['content'] == 'Test content'


def test_move_page_not_found(temp_wiki):
    """Test error when source page doesn't exist."""
    result = _move(temp_wiki, {
        'path': 'nonexistent.md',
        'new_path': 'new.md',
        'author': 'Test Author'
    })

    # Verify error message
    assert 'Error' in result
    assert 'not found' in result


def test_move_missing_path_parameter(temp_wiki):
    """Test error when path parameter is missing."""
    result = _move(temp_wiki, {
        'new_path': 'new.md',
        'author': 'Test Author'
    })

    # Verify error message
    assert 'Error' in result
    assert 'path is required' in result


def test_move_missing_new_path_parameter(temp_wiki):
    """Test error when new_path parameter is missing."""
    result = _move(temp_wiki, {
        'path': 'old.md',
        'author': 'Test Author'
    })

    # Verify error message
    assert 'Error' in result
    assert 'new_path is required' in result
