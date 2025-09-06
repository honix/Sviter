import pytest
import sys
import os

# Add the parent directory to Python path so we can import backend modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Configure pytest for async tests
pytest_plugins = ('pytest_asyncio',)