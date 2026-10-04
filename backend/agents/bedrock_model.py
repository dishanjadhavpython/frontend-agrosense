"""The research agents' model: Amazon Nova Pro on Bedrock, behind the Agents SDK.

The four agents are written against the OpenAI Agents SDK. Its `Runner` drives
the tool loop, its MCP integration starts the five tool servers, and its turn
ceiling and error handlers stop a runaway research run. None of that is tied to
OpenAI — only the model call is. This class is that call, made to Bedrock's
Converse API instead, so the agents moved onto AWS without their orchestration
changing.

Translation runs through the SDK's own converters on both sides, so the parts
that are easy to get subtly wrong (handoffs, tool-output items, reasoning
replay) stay the SDK's problem:

    SDK input items  --Converter.items_to_messages-->  chat messages
                     --_to_converse-->                  Converse messages
    Converse output  --_from_converse-->                ChatCompletionMessage
                     --Converter.message_to_output_items--> SDK output items

Structured output. Converse has no `response_format`. An agent with an
`output_type` is given one extra tool, `final_output`, whose input schema is that
type's JSON schema. The model finishes by calling it, and the tool's arguments
become the turn's text — exactly the JSON the Runner then validates against the
Pydantic type. With no other tools, the call is forced; with tools, the model
researches first and finishes when it is ready.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, AsyncIterator

from agents.items import ModelResponse
from agents.models.chatcmpl_converter import Converter
from agents.models.interface import Model
from agents.usage import Usage
from openai.types.chat import ChatCompletionMessage
from openai.types.chat.chat_completion_message_function_tool_call import (
    ChatCompletionMessageFunctionToolCall,
    Function,
)

from ..bedrock import BedrockUnavailable, converse, strip_thinking

logger = logging.getLogger("agrosense.agents.bedrock")

FINAL_TOOL = "final_output"

_FINAL_INSTRUCTION = (
    f"When your work is complete, call the `{FINAL_TOOL}` tool exactly once with "
    "the complete result as its arguments. Never write the final answer as plain "
    "text — only the tool call is read."
)

#: Nova Pro accepts up to 10,000 output tokens (checked against the live API).
#: A full research report is a few thousand; the ceiling only has to clear it.
DEFAULT_MAX_TOKENS = 8192

_TOOL_NAME = re.compile(r"[^a-zA-Z0-9_-]")


def _is_sampling_fault(exc: Exception) -> bool:
    """A transient generation error worth retrying unchanged, as opposed to a
    request Bedrock rejected (validation, access, quota)."""
    text = str(exc)
    return text.startswith("ModelErrorException") or "invalid sequence as part of ToolUse" in text


def _safe_tool_name(name: str) -> str:
    """Bedrock tool names allow `[a-zA-Z0-9_-]{1,64}`; MCP names usually comply."""
    return _TOOL_NAME.sub("_", name)[:64] or "tool"


def _inline_refs(schema: dict[str, Any]) -> dict[str, Any]:
    """Resolve local `$ref`s and drop `$defs`.

    Pydantic emits nested models as `{"$ref": "#/$defs/Scheme"}`. Converse accepts
    JSON Schema, but a tool schema the model can read in one piece is followed
    far more reliably than one it has to cross-reference, and nothing here is
    recursive, so inlining is lossless.
    """
    defs = {**schema.get("definitions", {}), **schema.get("$defs", {})}

    def walk(node: Any, depth: int = 0) -> Any:
        if depth > 32:
            return {}
        if isinstance(node, dict):
            ref = node.get("$ref")
            if isinstance(ref, str) and ref.startswith("#/"):
                target = defs.get(ref.rsplit("/", 1)[-1], {})
                rest = {k: v for k, v in node.items() if k != "$ref"}
                return {**walk(target, depth + 1), **walk(rest, depth + 1)}
            return {
                k: walk(v, depth + 1)
                for k, v in node.items()
                if k not in {"$defs", "definitions", "$schema", "strict"}
            }
        if isinstance(node, list):
            return [walk(v, depth + 1) for v in node]
        return node

    inlined = walk(schema)
    if inlined.get("type") != "object":
        inlined = {"type": "object", "properties": inlined.get("properties", {})}
    return inlined


def _text(content: Any) -> str:
    """Flatten chat-message content (a string, or a list of parts) to text."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    parts: list[str] = []
    for part in content:
        if isinstance(part, dict):
            if "text" in part:
                parts.append(str(part.get("text") or ""))
            elif part.get("type") == "refusal":
                parts.append(str(part.get("refusal") or ""))
        else:
            parts.append(str(part))
    return "\n".join(p for p in parts if p)


def _to_converse(messages: list[dict[str, Any]]) -> tuple[list[dict], list[dict], set[str]]:
    """Chat-completions messages -> (system blocks, Converse messages, tool names used).

    Converse is stricter than chat completions in three ways this handles:
    roles must alternate (consecutive messages of one role are merged), tool
    results travel as `toolResult` blocks inside a *user* message, and an empty
    text block is a validation error, not a no-op.
    """
    system: list[dict] = []
    out: list[dict] = []
    used_tools: set[str] = set()

    def push(role: str, blocks: list[dict]) -> None:
        blocks = [b for b in blocks if not ("text" in b and not str(b["text"]).strip())]
        if not blocks:
            return
        if out and out[-1]["role"] == role:
            out[-1]["content"].extend(blocks)
        else:
            out.append({"role": role, "content": blocks})

    for message in messages:
        role = message.get("role")
        if role in {"system", "developer"}:
            text = _text(message.get("content"))
            if text.strip():
                system.append({"text": text})
        elif role == "user":
            push("user", [{"text": _text(message.get("content"))}])
        elif role == "assistant":
            blocks: list[dict] = [{"text": strip_thinking(_text(message.get("content")))}]
            for call in message.get("tool_calls") or []:
                function = call.get("function") or {}
                raw = function.get("arguments") or "{}"
                try:
                    arguments = json.loads(raw)
                except json.JSONDecodeError:
                    arguments = {"input": raw}
                if not isinstance(arguments, dict):
                    arguments = {"input": arguments}
                name = _safe_tool_name(str(function.get("name") or "tool"))
                used_tools.add(name)
                blocks.append(
                    {"toolUse": {"toolUseId": call["id"], "name": name, "input": arguments}}
                )
            push("assistant", blocks)
        elif role == "tool":
            result = _text(message.get("content")) or "(the tool returned nothing)"
            push(
                "user",
                [
                    {
                        "toolResult": {
                            "toolUseId": message["tool_call_id"],
                            "content": [{"text": result}],
                            "status": "success",
                        }
                    }
                ],
            )

    # Converse must open on a user turn. The SDK always starts with the prompt,
    # but an error handler can hand back a transcript that begins mid-run.
    if not out or out[0]["role"] != "user":
        out.insert(0, {"role": "user", "content": [{"text": "Continue the task."}]})
    return system, out, used_tools


def _json_object_in(text: str) -> dict[str, Any] | None:
    """A JSON object written as plain text, fenced or not, if there is one."""
    candidate = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", candidate, re.DOTALL)
    if fence:
        candidate = fence.group(1)
    elif not candidate.startswith("{"):
        start, end = candidate.find("{"), candidate.rfind("}")
        if start == -1 or end <= start:
            return None
        candidate = candidate[start : end + 1]
    try:
        value = json.loads(candidate)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


class BedrockConverseModel(Model):
    """An Agents SDK `Model` backed by Bedrock Converse (Amazon Nova by default)."""

    def __init__(self, model_id: str) -> None:
        self.model_id = model_id

    async def get_response(
        self,
        system_instructions: str | None,
        input: Any,
        model_settings: Any,
        tools: list[Any],
        output_schema: Any,
        handoffs: list[Any],
        tracing: Any,
        **_: Any,
    ) -> ModelResponse:
        messages = Converter.items_to_messages(input)
        system, conversation, used_tools = _to_converse(messages)
        if system_instructions:
            system.insert(0, {"text": system_instructions})

        specs: list[dict[str, Any]] = []
        for tool in tools:
            spec = Converter.tool_to_openai(tool)["function"]
            specs.append(self._spec(spec["name"], spec.get("description"), spec.get("parameters")))
        for handoff in handoffs:
            spec = Converter.convert_handoff_tool(handoff)["function"]
            specs.append(self._spec(spec["name"], spec.get("description"), spec.get("parameters")))

        wants_json = bool(output_schema) and not output_schema.is_plain_text()
        if wants_json:
            specs.append(
                self._spec(
                    FINAL_TOOL,
                    "Return the finished result. Call exactly once, at the end.",
                    output_schema.json_schema(),
                )
            )
            system.append({"text": _FINAL_INSTRUCTION})

        # A transcript can reference tools this agent no longer has — the
        # research write-up runs tool-free over a transcript full of searches.
        # Converse rejects a toolUse block naming an undeclared tool, so those
        # are declared as inert stubs; the forced final call below means the
        # model is never offered them as a choice.
        offered = {s["toolSpec"]["name"] for s in specs}
        for stale in sorted(used_tools - offered):
            specs.append(
                self._spec(stale, "No longer available in this step. Do not call it.", {})
            )

        tool_choice = self._tool_choice(model_settings, wants_json, real_tools=len(tools) + len(handoffs))
        request: dict[str, Any] = {
            "modelId": self.model_id,
            "messages": conversation,
            "inferenceConfig": {
                "maxTokens": int(getattr(model_settings, "max_tokens", None) or DEFAULT_MAX_TOKENS),
                # Low temperature is Bedrock's own guidance for Nova tool use:
                # a research run is a sequence of tool decisions, not prose.
                "temperature": float(
                    getattr(model_settings, "temperature", None)
                    if getattr(model_settings, "temperature", None) is not None
                    else 0.2
                ),
            },
        }
        if system:
            request["system"] = system
        if specs:
            request["toolConfig"] = {"tools": specs}
            if tool_choice:
                request["toolConfig"]["toolChoice"] = tool_choice

        response = await self._call(request)
        message = self._from_converse(response)

        if wants_json and not message.tool_calls and not self._is_json_object(message.content):
            # Answered in prose instead of calling the tool. Salvage a JSON
            # object if one was written out; otherwise ask once more with the
            # final call forced, over the same transcript plus that answer.
            salvaged = _json_object_in(message.content or "")
            if salvaged is not None:
                message = ChatCompletionMessage(
                    role="assistant", content=json.dumps(salvaged, ensure_ascii=False)
                )
            else:
                retry = dict(request)
                retry["messages"] = conversation + [
                    {"role": "assistant", "content": [{"text": message.content or "(no answer)"}]},
                    {"role": "user", "content": [{"text": f"Now call `{FINAL_TOOL}` with the complete result."}]},
                ]
                retry["toolConfig"] = {
                    "tools": request["toolConfig"]["tools"],
                    "toolChoice": {"tool": {"name": FINAL_TOOL}},
                }
                second = await self._call(retry)
                message = self._from_converse(second)
                response["usage"] = self._sum_usage(response.get("usage"), second.get("usage"))

        usage_raw = response.get("usage") or {}
        usage = Usage(
            requests=1,
            input_tokens=int(usage_raw.get("inputTokens", 0)),
            output_tokens=int(usage_raw.get("outputTokens", 0)),
            total_tokens=int(usage_raw.get("totalTokens", 0)),
        )
        items = Converter.message_to_output_items(message, provider_data={"model": self.model_id})
        return ModelResponse(
            output=items,
            usage=usage,
            response_id=None,
            request_id=(response.get("ResponseMetadata") or {}).get("RequestId"),
        )

    def stream_response(self, *args: Any, **kwargs: Any) -> AsyncIterator[Any]:
        # Nothing in AgroSense streams an agent run (`Runner.run` only), and a
        # half-implemented stream would fail in a worse place than this does.
        raise NotImplementedError("BedrockConverseModel supports Runner.run, not run_streamed")

    # -- helpers ----------------------------------------------------------

    @staticmethod
    def _spec(name: str, description: str | None, parameters: dict[str, Any] | None) -> dict[str, Any]:
        return {
            "toolSpec": {
                "name": _safe_tool_name(name),
                "description": (description or name)[:4000],
                "inputSchema": {"json": _inline_refs(parameters or {"type": "object", "properties": {}})},
            }
        }

    @staticmethod
    def _tool_choice(model_settings: Any, wants_json: bool, real_tools: int) -> dict[str, Any] | None:
        if wants_json and real_tools == 0:
            # Nothing to research with: the only sensible move is the answer.
            return {"tool": {"name": FINAL_TOOL}}
        choice = getattr(model_settings, "tool_choice", None)
        if choice == "required":
            return {"any": {}}
        if isinstance(choice, str) and choice not in {"auto", "none"}:
            return {"tool": {"name": _safe_tool_name(choice)}}
        return None

    async def _call(self, request: dict[str, Any]) -> dict[str, Any]:
        try:
            return await asyncio.to_thread(converse, **request)
        except BedrockUnavailable as exc:
            # A model that rejects an explicit tool choice still does the work
            # without one; drop it and try once more before giving up.
            if "toolChoice" in str(exc) and "toolChoice" in request.get("toolConfig", {}):
                relaxed = dict(request)
                relaxed["toolConfig"] = {k: v for k, v in request["toolConfig"].items() if k != "toolChoice"}
                return await asyncio.to_thread(converse, **relaxed)
            # Nova now and then emits a malformed tool-use block ("Model
            # produced invalid sequence as part of ToolUse"). That is a
            # sampling fault, not a bad request — the same request usually
            # succeeds on a second draw — and letting it propagate failed the
            # whole topic, throwing away every search and fetch the run had
            # already paid for. Twice more, briefly spaced, then give up.
            if _is_sampling_fault(exc):
                for delay in (1.0, 3.0):
                    await asyncio.sleep(delay)
                    try:
                        return await asyncio.to_thread(converse, **request)
                    except BedrockUnavailable as again:
                        if not _is_sampling_fault(again):
                            raise
                        exc = again
            raise exc

    @staticmethod
    def _from_converse(response: dict[str, Any]) -> ChatCompletionMessage:
        blocks = (response.get("output") or {}).get("message", {}).get("content", [])
        texts: list[str] = []
        calls: list[ChatCompletionMessageFunctionToolCall] = []
        final: Any = None
        for block in blocks:
            if "text" in block:
                texts.append(block["text"])
            elif "toolUse" in block:
                use = block["toolUse"]
                if use.get("name") == FINAL_TOOL:
                    final = use.get("input")
                    continue
                calls.append(
                    ChatCompletionMessageFunctionToolCall(
                        id=use["toolUseId"],
                        type="function",
                        function=Function(
                            name=use["name"],
                            arguments=json.dumps(use.get("input") or {}, ensure_ascii=False),
                        ),
                    )
                )
        if final is not None:
            # The answer, as the text the Runner will validate. Any research
            # call made in the same breath is moot: the model has finished.
            if isinstance(final, str):
                parsed = _json_object_in(final)
                final = parsed if parsed is not None else {"value": final}
            return ChatCompletionMessage(role="assistant", content=json.dumps(final, ensure_ascii=False))
        text = strip_thinking("\n".join(texts)) or None
        return ChatCompletionMessage(role="assistant", content=text, tool_calls=calls or None)

    @staticmethod
    def _is_json_object(content: str | None) -> bool:
        if not content:
            return False
        try:
            return isinstance(json.loads(content), dict)
        except json.JSONDecodeError:
            return False

    @staticmethod
    def _sum_usage(a: dict | None, b: dict | None) -> dict[str, int]:
        a, b = a or {}, b or {}
        return {k: int(a.get(k, 0)) + int(b.get(k, 0)) for k in ("inputTokens", "outputTokens", "totalTokens")}
