"""The one place that talks to a language model.

Two ways in, chosen from backend/.env:

  * an OpenAI-compatible chat-completions endpoint (Hack Club AI, OpenRouter and similar),
    used when FLAME_API_BASE is set or the key is a Hack Club key ("sk-hc-...");
  * the Claude API through the official Anthropic SDK, used for an Anthropic key.

The site works without a key: every AI feature has a retrieval-only fallback that says
clearly that no language model was used.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
import urllib.error
import urllib.request

from pathlib import Path

from dotenv import load_dotenv

# The model and service are chosen when this module is imported, so the settings file is read
# here and not left to whichever script happens to import first.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

log = logging.getLogger("flame.llm")

HACKCLUB_BASE = "https://ai.hackclub.com/proxy/v1"
FALLBACK_BETA = "server-side-fallback-2026-07-01"
EFFORT = os.environ.get("FLAME_EFFORT", "medium")
THINKING_OFF = os.environ.get("FLAME_THINKING", "").strip().lower() in ("off", "disabled", "0", "false")


def _key() -> str:
    return (os.environ.get("FLAME_API_KEY") or os.environ.get("HACKCLUB_API_KEY")
            or os.environ.get("ANTHROPIC_API_KEY") or "").strip()


def _base() -> str | None:
    base = (os.environ.get("FLAME_API_BASE") or "").strip().rstrip("/")
    if base:
        return base
    return HACKCLUB_BASE if _key().startswith("sk-hc-") else None


def _model() -> str:
    """Model id in the form the chosen service expects.

    The Claude API writes "claude-haiku-5-5"; OpenRouter-style services write
    "anthropic/claude-haiku-5.5". Either spelling in FLAME_MODEL works with either service."""
    name = (os.environ.get("FLAME_MODEL") or "").strip()
    if _base():
        name = name or "anthropic/claude-haiku-5.5"
        if "/" not in name and name.startswith("claude-"):
            name = "anthropic/" + re.sub(r"-(\d+)-(\d+)$", r"-\1.\2", name)
        return name
    name = name or "claude-opus-5-5"
    if name.startswith("anthropic/"):
        name = name.split("/", 1)[1].replace(".", "-")
    return name


MODEL = _model()
PROVIDER = "openai-compatible" if _base() else "anthropic"

_client = None
_last_error: str | None = None
# True = the key and model were accepted; False = they were rejected;
# None = not checked yet, or the check could not reach the service.
_verified: bool | None = None
_pricing: dict | None = None          # USD per token, from the service's model list
_no_schema = False                    # set if the service rejects response_format
_no_reasoning = False                 # set if the service rejects the reasoning setting
_spent = {"requests": 0, "prompt_tokens": 0, "completion_tokens": 0, "cached_tokens": 0, "cost_usd": 0.0}

# USD per million tokens (input, output) on the Claude API, from Anthropic's pricing page on
# 2026-11-12. Used only to show what an answer cost; the Console bill is the authority.
# A cache read costs 0.1x the input price and a 5-minute cache write 1.25x.
ANTHROPIC_PRICES = {"claude-haiku-5-5": (0.10, 0.50), "claude-sonnet-5-5": (2.0, 10.0), "claude-opus-5-5": (4.0, 20.0),
                    "claude-fable-5-2": (8.0, 40.0)}


class LLMError(RuntimeError):
    pass


def configured() -> bool:
    """Is a credential present at all?"""
    if os.environ.get("FLAME_DISABLE_LLM") == "1":
        return False
    return bool(_key() or os.environ.get("ANTHROPIC_AUTH_TOKEN") or os.environ.get("ANTHROPIC_PROFILE"))


def available() -> bool:
    """Should the AI features call the model? Not if the service already rejected the key or the model."""
    return configured() and _verified is not False


def status() -> dict:
    return {"available": available(), "configured": configured(), "verified": _verified,
            "model": MODEL if configured() else None, "provider": PROVIDER if configured() else None,
            "pricing": _pricing or ({"prompt": ANTHROPIC_PRICES[MODEL][0] / 1e6, "completion": ANTHROPIC_PRICES[MODEL][1] / 1e6}
                                    if PROVIDER == "anthropic" and MODEL in ANTHROPIC_PRICES else None),
            "effort": EFFORT, "thinking": "off" if THINKING_OFF and MODEL.startswith("claude-haiku") else "adaptive",
            "session": dict(_spent), "last_error": _last_error}


# ---------------------------------------------------------------------------
# OpenAI-compatible service (raw HTTP: this is what Hack Club AI documents)
# ---------------------------------------------------------------------------
def _http(method: str, path: str, body: dict | None = None, auth: bool = True, timeout: float = 180.0) -> dict:
    headers = {"Content-Type": "application/json", "Accept": "application/json",
               "User-Agent": "flame-in-freefall-dashboard/0.3"}
    if auth:
        headers["Authorization"] = f"Bearer {_key()}"
    req = urllib.request.Request(_base() + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:600]
        try:
            err = json.loads(detail).get("error")
            detail = err.get("message", detail) if isinstance(err, dict) else (err or detail)
        except (json.JSONDecodeError, AttributeError):
            pass
        raise _HTTPStatus(exc.code, str(detail), exc.headers.get("Retry-After")) from exc
    except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
        raise LLMError("Could not reach the AI service. Check the internet connection.") from exc


class _HTTPStatus(Exception):
    def __init__(self, code: int, detail: str, retry_after: str | None = None):
        super().__init__(f"{code}: {detail}")
        self.code, self.detail, self.retry_after = code, detail, retry_after


def _explain(exc: _HTTPStatus) -> str:
    if exc.code == 401:
        return "The AI key was rejected. Check the key in backend/.env."
    if exc.code == 402:
        return "Today's AI spending limit has been reached. It resets at 00:00 UTC."
    if exc.code == 403:
        return f"The AI service refused this account or request ({exc.detail[:140]})."
    if exc.code == 404:
        return f"Model '{MODEL}' was not found on this AI service."
    if exc.code == 429:
        wait = f" Try again in {exc.retry_after} seconds." if exc.retry_after else " Try again in a minute."
        return "The AI service is rate limited right now." + wait
    return f"The AI service returned an error ({exc.code}): {exc.detail[:160]}"


def _extract_json(text: str) -> dict:
    """The model is asked for one JSON object. Accept it bare, fenced, or with stray text around it."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*|\s*```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise
        return json.loads(text[start:end + 1])


def _complete_compat(system: str, stable: str, user: str, schema: dict, max_tokens: int, effort: str,
                     info: dict | None) -> dict:
    global _no_schema, _no_reasoning
    system = (system + ("\n\n" + stable if stable else "") + "\n\nReply with one JSON object and nothing else: no code fence, no text before or after. "
              "It must match this JSON Schema exactly, with every required field present:\n" + json.dumps(schema))
    for _ in range(3):
        body: dict = {"model": MODEL, "max_tokens": max_tokens, "stream": False,
                      "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
        if not _no_schema:
            body["response_format"] = {"type": "json_schema",
                                       "json_schema": {"name": "answer", "strict": True, "schema": schema}}
        if not _no_reasoning:
            body["reasoning"] = {"effort": effort}
        started = time.time()
        try:
            out = _http("POST", "/chat/completions", body)
        except _HTTPStatus as exc:
            # a service that does not know an optional setting answers 400: drop it and ask again
            if exc.code == 400 and not _no_reasoning and "reason" in exc.detail.lower():
                _no_reasoning = True
                continue
            if exc.code == 400 and not _no_schema:
                _no_schema = True
                log.warning("service rejected response_format, falling back to JSON by instruction: %s", exc.detail[:200])
                continue
            if exc.code == 400 and not _no_reasoning:
                _no_reasoning = True
                continue
            raise
        choice = (out.get("choices") or [{}])[0]
        text = (choice.get("message") or {}).get("content") or ""
        if isinstance(text, list):  # some services return content parts
            text = "".join(p.get("text", "") for p in text if isinstance(p, dict))
        usage = out.get("usage") or {}
        p_in, p_out = usage.get("prompt_tokens") or 0, usage.get("completion_tokens") or 0
        # some services report a cost of 0 for sponsored accounts; the list price is the useful figure
        cost = usage.get("cost") or None
        if cost is None and _pricing:
            cost = p_in * _pricing["prompt"] + p_out * _pricing["completion"]
        _spent["requests"] += 1
        _spent["prompt_tokens"] += p_in
        _spent["completion_tokens"] += p_out
        _spent["cost_usd"] = round(_spent["cost_usd"] + (cost or 0), 6)
        if info is not None:
            info.update(tokens_in=p_in, tokens_out=p_out, cost_usd=round(cost, 6) if cost is not None else None,
                        seconds=round(time.time() - started, 1), model=out.get("model") or MODEL)
        if choice.get("finish_reason") == "length":
            raise LLMError("The AI answer was cut off before it finished. Try a narrower question.")
        if choice.get("finish_reason") == "content_filter" or not text.strip():
            raise LLMError("The AI model declined to answer this request.")
        try:
            return _extract_json(text)
        except json.JSONDecodeError as exc:
            raise LLMError("The AI model returned a malformed answer.") from exc
    raise LLMError("The AI service rejected the request format.")


def _verify_compat() -> None:
    global _verified, _last_error, _pricing
    try:
        models = _http("GET", "/models", auth=False, timeout=20.0).get("data") or []
        entry = next((m for m in models if m.get("id") == MODEL), None)
        if models and entry is None:
            _verified, _last_error = False, f"Model '{MODEL}' is not in this AI service's model list."
            return
        if entry and entry.get("pricing"):
            try:
                _pricing = {"prompt": float(entry["pricing"]["prompt"]), "completion": float(entry["pricing"]["completion"])}
            except (KeyError, TypeError, ValueError):
                _pricing = None
    except (LLMError, _HTTPStatus) as exc:
        log.info("model list not available: %s", exc)
    try:
        _http("GET", "/stats", timeout=20.0)  # free, and needs a valid key
        _verified, _last_error = True, None
    except _HTTPStatus as exc:
        if exc.code in (401, 403):
            _verified, _last_error = False, _explain(exc)
        elif exc.code == 404:      # a service without a stats route: the key is checked on first use
            _verified, _last_error = None, None
        else:
            _verified, _last_error = None, _explain(exc)
    except LLMError as exc:
        _verified, _last_error = None, f"{exc} (start-up check)"


# ---------------------------------------------------------------------------
# Claude API (official Anthropic SDK)
# ---------------------------------------------------------------------------
def _get_client():
    global _client
    if _client is None:
        import anthropic

        # zero-argument client: resolves ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / `ant auth login` profile
        _client = anthropic.Anthropic(max_retries=2, timeout=180.0)
    return _client


def _verify_anthropic() -> None:
    global _verified, _last_error
    import anthropic

    try:
        _get_client().with_options(timeout=15.0, max_retries=1).models.retrieve(MODEL)
        _verified, _last_error = True, None
    except anthropic.AuthenticationError:
        _verified, _last_error = False, "The Anthropic API key was rejected. Check the key in backend/.env."
    except anthropic.PermissionDeniedError:
        _verified, _last_error = False, f"This Anthropic API key is not allowed to use the model '{MODEL}'."
    except anthropic.NotFoundError:
        _verified, _last_error = False, f"Model '{MODEL}' was not found for this API key."
    except anthropic.APIStatusError as exc:
        _verified, _last_error = None, f"The AI service returned an error ({exc.status_code}) during the start-up check."
    except anthropic.APIConnectionError:
        _verified, _last_error = None, "Could not reach the AI service during the start-up check. Check the internet connection."


class FieldStream:
    """Pulls one string field out of a JSON object while it is still being written.

    The model answers with {"answer": "...", ...}. Fed the raw fragments as they arrive, this returns
    the newly decoded characters of the chosen field, so the reader sees the answer being written
    instead of waiting for the whole object."""

    def __init__(self, field: str = "answer"):
        self.key = f'"{field}"'
        self.buf = ""
        self.pos = -1      # index in buf where the field's string value starts; -1 = not found yet
        self.done = False

    def feed(self, chunk: str) -> str:
        if self.done:
            return ""
        self.buf += chunk
        if self.pos < 0:
            m = re.search(re.escape(self.key) + r'\s*:\s*"', self.buf)
            if not m:
                return ""
            self.pos = m.end()
        out, i = [], self.pos
        while i < len(self.buf):
            ch = self.buf[i]
            if ch == "\\":
                if i + 1 >= len(self.buf):
                    break  # escape split across fragments: wait for the rest
                nxt = self.buf[i + 1]
                if nxt == "u":
                    if i + 6 > len(self.buf):
                        break
                    try:
                        out.append(chr(int(self.buf[i + 2:i + 6], 16)))
                    except ValueError:
                        pass
                    i += 6
                    continue
                out.append({"n": "\n", "t": "\t", "r": "", '"': '"', "\\": "\\", "/": "/"}.get(nxt, nxt))
                i += 2
                continue
            if ch == '"':
                self.done = True
                i += 1
                break
            out.append(ch)
            i += 1
        self.pos = i
        return "".join(out)


def _complete_anthropic(system: str, stable: str, user: str, schema: dict, max_tokens: int, effort: str,
                        info: dict | None, on_text=None) -> dict:
    import anthropic

    global _last_error, _verified
    client = _get_client()
    # The instructions and the stable reference text are the same for every question, so they are
    # marked for the prompt cache: within five minutes a repeat is read at a tenth of the price
    # and is faster. Whatever changes per question goes in the user turn, after the cached part.
    blocks = [{"type": "text", "text": system + ("\n\n" + stable if stable else ""),
               "cache_control": {"type": "ephemeral"}}]
    extra = {}
    if THINKING_OFF and MODEL.startswith("claude-haiku"):
        # Haiku accepts answering without a thinking pass (Sonnet 5.5 and Opus 5.5 reject the setting).
        # The answers here are written from passages the model is handed, so this mostly saves time.
        extra["thinking"] = {"type": "disabled"}
    base = dict(
        **extra,
        model=MODEL,
        max_tokens=max_tokens,
        system=blocks,
        messages=[{"role": "user", "content": user}],
        output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
    )

    def run(use_fallbacks: bool):
        ctx = (client.beta.messages.stream(**base, betas=[FALLBACK_BETA], fallbacks="default") if use_fallbacks
               else client.messages.stream(**base))
        with ctx as stream:
            if on_text is not None:
                # hand each fragment of the written answer on as it arrives (thinking is not text)
                for fragment in stream.text_stream:
                    on_text(fragment)
            return stream.get_final_message()

    started = time.time()
    try:
        try:
            # Claude Haiku has no server-side fallback, so the parameter is left out for it
            msg = run(not MODEL.startswith("claude-haiku"))
        except anthropic.BadRequestError as exc:
            # e.g. the fallback beta is not enabled for this account or platform: retry plainly
            log.warning("retrying without server-side fallbacks: %s", exc.message)
            msg = run(False)
    except anthropic.AuthenticationError as exc:
        _verified = False
        raise LLMError("The Anthropic API key was rejected. Check the key in backend/.env.") from exc
    except anthropic.PermissionDeniedError as exc:
        raise LLMError("The Anthropic API key does not have permission to use this model.") from exc
    except anthropic.NotFoundError as exc:
        raise LLMError(f"Model '{MODEL}' was not found for this API key.") from exc
    except anthropic.RateLimitError as exc:
        raise LLMError("The AI service is rate limited right now. Try again in a minute.") from exc
    except anthropic.APIStatusError as exc:
        raise LLMError(f"The AI service returned an error ({exc.status_code}).") from exc
    except anthropic.APIConnectionError as exc:
        raise LLMError("Could not reach the AI service. Check the internet connection.") from exc

    u = msg.usage
    read, written = u.cache_read_input_tokens or 0, u.cache_creation_input_tokens or 0
    price = ANTHROPIC_PRICES.get(MODEL)
    cost = None
    if price:
        cost = ((u.input_tokens + 0.1 * read + 1.25 * written) * price[0] + u.output_tokens * price[1]) / 1e6
    _spent["requests"] += 1
    _spent["prompt_tokens"] += u.input_tokens + read + written
    _spent["completion_tokens"] += u.output_tokens
    _spent["cached_tokens"] += read
    _spent["cost_usd"] = round(_spent["cost_usd"] + (cost or 0), 6)
    if info is not None:
        info.update(tokens_in=u.input_tokens + read + written, tokens_cached=read, tokens_out=u.output_tokens,
                    cost_usd=round(cost, 6) if cost is not None else None,
                    seconds=round(time.time() - started, 1), model=msg.model)
    if msg.stop_reason == "refusal":
        raise LLMError("The AI model declined to answer this request.")
    if msg.stop_reason == "max_tokens":
        raise LLMError("The AI answer was cut off before it finished. Try a narrower question.")
    text = next((b.text for b in msg.content if b.type == "text"), None)
    if not text:
        raise LLMError("The AI model returned no text.")
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise LLMError("The AI model returned a malformed answer.") from exc


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------
def verify() -> dict:
    """Check the key and the model at server start with requests that cost nothing, so the site
    can say truthfully whether the AI is connected instead of finding out on the first question."""
    global _verified, _last_error
    if not configured():
        _verified, _last_error = None, None
        return status()
    if PROVIDER == "anthropic":
        _verify_anthropic()
    else:
        _verify_compat()
    log.info("AI model check: provider=%s model=%s verified=%s %s", PROVIDER, MODEL, _verified, _last_error or "")
    return status()


def complete_json(system: str, user: str, schema: dict, max_tokens: int = 16000, effort: str | None = None,
                  info: dict | None = None, stable: str = "", on_text=None) -> dict:
    """One request, one JSON object back, shaped by `schema`.

    `stable` is reference text that is identical for every question (the collection index). It is
    sent with the instructions so the service can cache both; `user` holds what changes.

    max_tokens is a ceiling, not a target. The model's thinking counts against it, so it is
    kept generous: a low ceiling cuts answers off before any text is written. If `info` is
    given it is filled with the tokens used, the cost where the service reports prices, and
    the time taken."""
    global _last_error, _verified
    try:
        if PROVIDER == "anthropic":
            data = _complete_anthropic(system, stable, user, schema, max_tokens, effort or EFFORT, info, on_text)
        else:
            try:
                data = _complete_compat(system, stable, user, schema, max_tokens, effort or EFFORT, info)
            except _HTTPStatus as exc:
                if exc.code in (401,):
                    _verified = False
                raise LLMError(_explain(exc)) from exc
    except LLMError as exc:
        _last_error = str(exc)
        raise
    _last_error, _verified = None, True
    return data
