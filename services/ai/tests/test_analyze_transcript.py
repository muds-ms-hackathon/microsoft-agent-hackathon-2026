import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest


def _mock_openai_client(content: str | None):
    return SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(
                create=AsyncMock(
                    return_value=SimpleNamespace(
                        choices=[
                            SimpleNamespace(
                                message=SimpleNamespace(content=content),
                            )
                        ],
                    ),
                ),
            ),
        ),
    )


async def test_analyze_transcript_returns_dict_response():
    """(a) OpenAI レスポンスが dict の場合、そのまま返す"""
    import main

    result = {
        "decisionItems": [{"title": "決定事項1"}],
        "tasks": [{"title": "タスク1"}],
        "ambiguousInfos": [{"body": "曖昧な箇所1"}],
    }
    main._openai_client = _mock_openai_client(json.dumps(result))
    main._deployment_name = "test-deployment"

    try:
        actual = await main._analyze_transcript("会議本文")
    finally:
        main._openai_client = None
        main._deployment_name = ""

    assert actual == result


async def test_analyze_transcript_raises_when_response_is_list():
    """(b) OpenAI レスポンスが list の場合、ValueError を raise する"""
    import main

    main._openai_client = _mock_openai_client(json.dumps([]))
    main._deployment_name = "test-deployment"

    try:
        with pytest.raises(ValueError, match="type=list"):
            await main._analyze_transcript("会議本文")
    finally:
        main._openai_client = None
        main._deployment_name = ""


async def test_analyze_transcript_raises_when_response_is_string():
    """(c) OpenAI レスポンスが string の場合、ValueError を raise する"""
    import main

    main._openai_client = _mock_openai_client(json.dumps("invalid"))
    main._deployment_name = "test-deployment"

    try:
        with pytest.raises(ValueError, match="type=str"):
            await main._analyze_transcript("会議本文")
    finally:
        main._openai_client = None
        main._deployment_name = ""


async def test_analyze_transcript_treats_empty_content_as_empty_dict():
    """(d) OpenAI レスポンスが空文字の場合、{} として扱う"""
    import main

    main._openai_client = _mock_openai_client("")
    main._deployment_name = "test-deployment"

    try:
        actual = await main._analyze_transcript("会議本文")
    finally:
        main._openai_client = None
        main._deployment_name = ""

    assert actual == {}
