#!/usr/bin/env python3
"""
LLM Tool Calling Analysis Script

Tests different models' behavior with tool calling and multi-step reasoning.
Analyzes various loop control techniques and tool usage patterns.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from ai.client import OpenRouterClient
from ai.tools import WikiTools
from ai.prompts import WikiPromptBuilder
from typing import List, Dict, Any, Optional
import json
import time
from dataclasses import dataclass
from datetime import datetime

@dataclass
class TestResult:
    """Results from a single test run"""
    test_name: str
    model: str
    iterations: int
    tool_calls: List[Dict[str, Any]]
    messages: List[str]
    success: bool
    stop_reason: str
    duration: float
    error: Optional[str] = None

class LLMTestFramework:
    """Framework for testing LLM tool calling behavior"""

    def __init__(self, model_name: str = "deepseek/deepseek-chat"):
        """Initialize with specified model"""
        self.model_name = model_name
        self.client = OpenRouterClient()
        self.client.model_name = model_name  # Override default model
        self.tools = WikiTools.get_tool_definitions()
        self.results: List[TestResult] = []

    def run_test(self, test_name: str, initial_message: str, max_iterations: int = 10) -> TestResult:
        """Run a single test and collect results"""
        print(f"\n🧪 Running test: {test_name}")
        print(f"📝 Message: {initial_message}")
        print(f"🤖 Model: {self.model_name}")

        start_time = time.time()
        system_prompt = WikiPromptBuilder.build("You are a test assistant for wiki tool analysis.")
        conversation_history = [{"role": "system", "content": system_prompt}]
        conversation_history.append({"role": "user", "content": initial_message})

        iteration_count = 0
        tool_calls = []
        messages = []
        stop_reason = "unknown"

        try:
            while iteration_count < max_iterations:
                iteration_count += 1
                print(f"  🔄 Iteration {iteration_count}")

                # Get AI response
                completion = self.client.create_completion(conversation_history, self.tools)
                message = completion.choices[0].message

                # Record message
                if message.content:
                    messages.append(message.content)
                    print(f"    💬 Message: {message.content[:100]}...")

                # Add assistant message to conversation
                conversation_history.append(message)

                # Check for tool calls
                if message.tool_calls:
                    print(f"    🔧 Tool calls: {len(message.tool_calls)}")

                    # Process each tool call
                    for tool_call in message.tool_calls:
                        tool_name = tool_call.function.name
                        try:
                            arguments = json.loads(tool_call.function.arguments)
                        except json.JSONDecodeError:
                            arguments = {}

                        # Execute tool (simplified for testing)
                        tool_result = f"[TEST] Tool {tool_name} executed with args: {arguments}"

                        # Record tool call
                        tool_calls.append({
                            "iteration": iteration_count,
                            "tool_name": tool_name,
                            "arguments": arguments,
                            "result": tool_result
                        })

                        print(f"      🛠️ {tool_name}({arguments})")

                        # Add tool result to conversation
                        conversation_history.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": tool_result
                        })

                    # Continue loop for next iteration
                    continue
                else:
                    # No tool calls - AI is done
                    stop_reason = "no_more_tools"
                    print(f"    ✅ AI stopped calling tools")
                    break

            if iteration_count >= max_iterations:
                stop_reason = "max_iterations"
                print(f"    ⏰ Reached max iterations")

            duration = time.time() - start_time
            result = TestResult(
                test_name=test_name,
                model=self.model_name,
                iterations=iteration_count,
                tool_calls=tool_calls,
                messages=messages,
                success=True,
                stop_reason=stop_reason,
                duration=duration
            )

        except Exception as e:
            duration = time.time() - start_time
            result = TestResult(
                test_name=test_name,
                model=self.model_name,
                iterations=iteration_count,
                tool_calls=tool_calls,
                messages=messages,
                success=False,
                stop_reason="error",
                duration=duration,
                error=str(e)
            )
            print(f"    ❌ Error: {e}")

        self.results.append(result)
        return result

    def run_all_tests(self):
        """Run comprehensive test suite"""
        print(f"🚀 Starting LLM Tool Analysis for model: {self.model_name}")
        print("=" * 60)

        # Test 1: Basic Tool + Message
        self.run_test(
            "basic_tool_message",
            "Please search for pages about 'python' and tell me what you find."
        )

        # Test 2: Multi-step with Explicit Stop
        self.run_test(
            "explicit_stop_counting",
            """Count from 1 to 3, using the list_all_pages tool for each number.
            After reaching 3, explicitly say 'COUNTING COMPLETE' and stop using tools."""
        )

        # Test 3: Task Completion Detection
        self.run_test(
            "task_completion",
            """Create a page called 'Test Page 1', then read it back to verify it was created successfully.
            Once verified, you're done."""
        )

        # Test 4: Counter-based with Meta-reasoning
        self.run_test(
            "counter_meta_reasoning",
            """Use the find_pages tool exactly 3 times with different search terms.
            Keep track of how many searches you've done and stop when you reach 3.
            Think about your progress after each search."""
        )

        # Test 5: Conditional Logic Loop
        self.run_test(
            "conditional_logic",
            """Search for pages until you find one that contains the word 'secret' OR you've tried 4 different search terms.
            Use these search terms in order: 'test', 'example', 'secret', 'data'.
            Stop when condition is met."""
        )

        # Test 6: Implicit Natural Completion
        self.run_test(
            "natural_completion",
            """Find all pages about programming languages. Search comprehensively."""
        )

    def analyze_results(self):
        """Analyze and print test results"""
        print("\n" + "=" * 60)
        print(f"📊 ANALYSIS RESULTS for {self.model_name}")
        print("=" * 60)

        for result in self.results:
            print(f"\n🧪 {result.test_name}")
            print(f"   ✅ Success: {result.success}")
            print(f"   🔄 Iterations: {result.iterations}")
            print(f"   🛠️ Tool calls: {len(result.tool_calls)}")
            print(f"   🛑 Stop reason: {result.stop_reason}")
            print(f"   ⏱️ Duration: {result.duration:.2f}s")

            if result.error:
                print(f"   ❌ Error: {result.error}")

            # Analyze tool calling patterns
            tool_names = [tc["tool_name"] for tc in result.tool_calls]
            tool_distribution = {}
            for tool in tool_names:
                tool_distribution[tool] = tool_distribution.get(tool, 0) + 1

            if tool_distribution:
                print(f"   🔧 Tool usage: {tool_distribution}")

            # Analyze messages
            if result.messages:
                print(f"   💬 Messages: {len(result.messages)}")
                # Show key phrases in final message
                final_message = result.messages[-1] if result.messages else ""
                stop_indicators = ["complete", "done", "finished", "stop", "STOP"]
                found_indicators = [word for word in stop_indicators if word.lower() in final_message.lower()]
                if found_indicators:
                    print(f"   🛑 Stop indicators found: {found_indicators}")

    def export_results(self, filename: str = None):
        """Export results to JSON file"""
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"llm_analysis_{self.model_name.replace('/', '_')}_{timestamp}.json"

        export_data = {
            "model": self.model_name,
            "timestamp": datetime.now().isoformat(),
            "results": [
                {
                    "test_name": r.test_name,
                    "success": r.success,
                    "iterations": r.iterations,
                    "tool_calls": r.tool_calls,
                    "messages": r.messages,
                    "stop_reason": r.stop_reason,
                    "duration": r.duration,
                    "error": r.error
                } for r in self.results
            ]
        }

        with open(filename, 'w') as f:
            json.dump(export_data, f, indent=2)

        print(f"\n💾 Results exported to: {filename}")

def test_multiple_models():
    """Test multiple models for comparison"""
    models = [
        "deepseek/deepseek-chat",  # ~120B model, very capable
        "openai/gpt-4o-mini",     # Smaller but efficient
        "anthropic/claude-3-haiku",  # Different architecture
        "meta-llama/llama-3.1-8b-instruct",  # Open source
    ]

    print("🔬 MULTI-MODEL COMPARISON")
    print("=" * 60)

    all_results = {}

    for model in models:
        print(f"\n🤖 Testing model: {model}")
        try:
            framework = LLMTestFramework(model)
            framework.run_all_tests()
            framework.analyze_results()
            framework.export_results()
            all_results[model] = framework.results
        except Exception as e:
            print(f"❌ Failed to test {model}: {e}")

    # Cross-model comparison
    print("\n" + "=" * 60)
    print("🔍 CROSS-MODEL COMPARISON")
    print("=" * 60)

    for model, results in all_results.items():
        print(f"\n{model}:")
        avg_iterations = sum(r.iterations for r in results) / len(results)
        avg_tools = sum(len(r.tool_calls) for r in results) / len(results)
        success_rate = sum(1 for r in results if r.success) / len(results)

        print(f"  📊 Avg iterations: {avg_iterations:.1f}")
        print(f"  🛠️ Avg tool calls: {avg_tools:.1f}")
        print(f"  ✅ Success rate: {success_rate:.1%}")

if __name__ == "__main__":
    # Test single model first
    print("🎯 Testing single model (120B class)")
    framework = LLMTestFramework("openai/gpt-oss-20b")
    framework.run_all_tests()
    framework.analyze_results()
    framework.export_results()

    # Uncomment to test multiple models
    # test_multiple_models()