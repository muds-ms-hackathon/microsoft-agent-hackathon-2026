import json
import logging
import re
from typing import Any, cast

from .client import LLMClient

logger = logging.getLogger(__name__)


def parse_json_output(raw: str) -> dict | list:
    """
    LLMの出力からJSONをパースする。
    コードブロック（```json...```）が含まれていても除去してからパースする。
    """
    cleaned = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()
    return cast(dict[Any, Any] | list[Any], json.loads(cleaned))


def run_llm_call(
    client: LLMClient, call_name: str, prompt: str
) -> tuple[str, dict | list]:
    """
    LLMを呼び出し、raw textとパース済みdictを返す。
    パース失敗時はraw textとエラー情報をdictで返す（例外は送出しない）。
    """
    logger.info("[%s] 実行中...", call_name)
    raw = client.call(prompt)
    logger.debug("[%s] OUTPUT: %.200s", call_name, raw)

    try:
        parsed = parse_json_output(raw)
        return raw, parsed
    except json.JSONDecodeError as e:
        logger.error("[%s] JSONパースエラー: %s", call_name, e)
        return raw, {"_parse_error": str(e), "_raw": raw}
