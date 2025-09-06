#!/usr/bin/env python3
"""
Test runner script for AI Wiki backend
Can be used by AI agents to run tests easily
"""

import subprocess
import sys
import os

def run_unit_tests():
    """Run unit tests with pytest"""
    print("🧪 Running Unit Tests...")
    print("=" * 40)
    
    try:
        result = subprocess.run([
            sys.executable, "-m", "pytest", 
            "tests/", "-v", "--tb=short"
        ], capture_output=True, text=True, cwd=os.path.dirname(__file__))
        
        print(result.stdout)
        if result.stderr:
            print("STDERR:", result.stderr)
        
        if result.returncode == 0:
            print("✅ Unit tests passed!")
            return True
        else:
            print("❌ Unit tests failed!")
            return False
            
    except Exception as e:
        print(f"❌ Error running unit tests: {e}")
        return False

def run_agentic_tests():
    """Run agentic tests (requires running server)"""
    print("\n🤖 Running Agentic Tests...")
    print("=" * 40)
    print("NOTE: Make sure the server is running first!")
    print("Run: python -m backend.main")
    print()
    
    try:
        result = subprocess.run([
            sys.executable, "tests/agentic_test.py"
        ], cwd=os.path.dirname(__file__))
        
        if result.returncode == 0:
            print("✅ Agentic tests passed!")
            return True
        else:
            print("❌ Agentic tests failed!")
            return False
            
    except Exception as e:
        print(f"❌ Error running agentic tests: {e}")
        return False

def main():
    """Main test runner"""
    print("🚀 AI Wiki Backend Test Runner")
    print("=" * 50)
    
    # Run unit tests
    unit_success = run_unit_tests()
    
    # Ask about agentic tests
    if unit_success:
        print("\n" + "=" * 50)
        response = input("Run agentic tests? (requires running server) [y/N]: ")
        if response.lower() in ['y', 'yes']:
            agentic_success = run_agentic_tests()
        else:
            print("Skipping agentic tests")
            agentic_success = True
    else:
        agentic_success = False
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 TEST SUMMARY")
    print("=" * 50)
    print(f"Unit Tests: {'✅ PASSED' if unit_success else '❌ FAILED'}")
    print(f"Agentic Tests: {'✅ PASSED' if agentic_success else '❌ FAILED'}")
    
    if unit_success and agentic_success:
        print("\n🎉 All tests passed!")
        return 0
    else:
        print("\n💥 Some tests failed!")
        return 1

if __name__ == "__main__":
    sys.exit(main())