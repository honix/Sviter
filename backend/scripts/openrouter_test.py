import sys
import os
import json
import ast
import operator
from html.parser import HTMLParser
from openai import OpenAI
from openai.types.chat import ChatCompletion, ChatCompletionMessage

os.system('chcp 65001 >nul')  # Set console to UTF-8
sys.stdout.reconfigure(encoding='utf-8')
sys.stdin.reconfigure(encoding='utf-8')


def get_secret():
    return "BOO"


def calculator(expression):
    # Safe mathematical expression evaluator using AST
    supported_ops = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.Pow: operator.pow,
        ast.Mod: operator.mod,
        ast.USub: operator.neg,
        ast.UAdd: operator.pos,
    }
    
    def eval_node(node):
        if isinstance(node, ast.Constant):
            return node.value
        elif isinstance(node, ast.BinOp):
            left = eval_node(node.left)
            right = eval_node(node.right)
            return supported_ops[type(node.op)](left, right)
        elif isinstance(node, ast.UnaryOp):
            operand = eval_node(node.operand)
            return supported_ops[type(node.op)](operand)
        else:
            raise ValueError(f"Unsupported operation: {type(node)}")
    
    try:
        tree = ast.parse(expression, mode='eval')
        result = eval_node(tree.body)
        return str(result)
    except Exception as e:
        return f"Error: {str(e)}"


def generate_html(html):
    class HTMLValidator(HTMLParser):
        def __init__(self):
            super().__init__()
            self.error = None
            
        def error(self, message):
            self.error = message
    
    validator = HTMLValidator()
    try:
        validator.feed(html)
        validator.close()
        if validator.error:
            return f"Generated HTML is invalid: {validator.error}"
        return "HTML generated and validated successfully"
    except Exception as e:
        return f"Generated HTML is invalid: {str(e)}"


client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key="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",
)

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_secret",
            "description": "Returns the string BOO",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculator",
            "description": "Calculates mathematical expressions. DO NOT calculate it itself, instead use the tool output as is.",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "Mathematical expression to calculate (e.g., '42 + 56')"
                    }
                },
                "required": ["expression"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_html",
            "description": "Generates HTML on the fly and validates that the HTML is valid.",
            "parameters": {
                "type": "object",
                "properties": {
                    "html": {
                        "type": "string",
                        "description": "HTML string to validate"
                    }
                },
                "required": ["html"]
            }
        }
    }
]

system_msg = "You are helpful assistant. Don't use markdown or latex formatting."

# model_name = "google/gemini-2.5-flash" # $2.50/M output tokens | smart
# model_name = "google/gemini-2.5-flash-lite" # $0.40/M output tokens | little stupid, locks on tools
# model_name = "google/gemini-2.0-flash-001" # $0.40/M output tokens | little stupid, locks on tools
# model_name = "google/gemma-3-12b-it" # $0.193/M output tokens | no tool call
# model_name = "anthropic/claude-3.5-haiku-20241022" # $4/M output tokens | smart and pricey
# model_name = "qwen/qwen3-30b-a3b" # $0.08/M output tokens | stupid

# Light and smart models
# model_name = "x-ai/grok-code-fast-1" # $1.50/M output tokens | 256K context | smart
# model_name = "qwen/qwen3-coder" # $0.80/M output tokens | 1M context | good and smart
# model_name = "openai/gpt-oss-120b" # $0.28/M output tokens | 128K context 
model_name = "openai/gpt-oss-20b" # $0.15/M output tokens | 128K context | good and smart

messages = [
    {"role": "system", "content": system_msg}
]

print(f"Chat started with \"{model_name}\". Type 'quit' to exit.")

while True:
    user_input = input("User> ")
    if user_input.lower() == 'quit':
        break

    messages.append({"role": "user", "content": user_input})

    completion: ChatCompletion = client.chat.completions.create(
        model=model_name,
        messages=messages,
        tools=tools,
        tool_choice="auto"
    )

    message: ChatCompletionMessage = completion.choices[0].message

    # Print any text content
    if message.content:
        print(f"LLM: {message.content.strip()}")

    # Always add assistant's message to conversation
    messages.append(message)

    # Handle any tool calls
    if message.tool_calls:

        for tool_call in message.tool_calls:
            print(f"Tool call:")
            print(f"    Tool name: {tool_call.function.name}")
            print(f"    Arguments: {tool_call.function.arguments}")

            if tool_call.function.name == "get_secret":
                result = get_secret()
            elif tool_call.function.name == "calculator":
                args = json.loads(tool_call.function.arguments)
                result = calculator(args["expression"])
            elif tool_call.function.name == "generate_html":
                args = json.loads(tool_call.function.arguments)
                result = generate_html(args["html"])

            print(f"    Result: {result}")

            # Add tool result to conversation
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": str(result)
            })

        # Get final response with tool results
        follow_up: ChatCompletion = client.chat.completions.create(
            model=model_name,
            messages=messages,
            tools=tools,
            tool_choice="auto"
        )

        if follow_up.choices[0].message.content:
            print(
                f"LLM (after tools): {follow_up.choices[0].message.content.strip()}")
            messages.append(follow_up.choices[0].message)
