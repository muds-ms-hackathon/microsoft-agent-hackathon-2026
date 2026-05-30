"""エージェントのツール呼び出し履歴を記録するレコーダー。

SK の auto_function_invocation フィルタとして登録し、エージェントが自律的に
呼んだツール（プラグイン関数）の順序と回数を捕捉する。Agentic な振る舞いを
ログで説明可能にする（記事/デモ用）ための仕組み（Issue #348 受け入れ基準①）。
"""

import logging
from collections import Counter
from collections.abc import Awaitable, Callable

logger = logging.getLogger(__name__)


class ToolCallRecorder:
    """エージェントが呼び出したツールの履歴を保持する。"""

    def __init__(self) -> None:
        # 呼び出し順の完全修飾名（"plugin-function"）。
        self.calls: list[str] = []

    def record_call(self, fully_qualified_name: str) -> None:
        self.calls.append(fully_qualified_name)

    @property
    def counts(self) -> dict[str, int]:
        """ツールごとの呼び出し回数。"""
        return dict(Counter(self.calls))

    @property
    def total(self) -> int:
        """ツール呼び出しの総回数。"""
        return len(self.calls)

    def summary(self) -> str:
        """ツール呼び出し履歴を人間が読めるテキストに整形する。"""
        if not self.calls:
            return "ツール呼び出しなし"
        parts = [f"{name}: {count}回" for name, count in self.counts.items()]
        return f"ツール呼び出し合計 {self.total}回 / " + "、".join(parts)

    def log_summary(self) -> None:
        """ツール呼び出し履歴をログ出力する。"""
        logger.info("[agent] %s", self.summary())

    def as_filter(
        self,
    ) -> Callable[..., Awaitable[None]]:
        """SK の auto_function_invocation フィルタを返す。

        kernel.add_filter(FilterTypes.AUTO_FUNCTION_INVOCATION, recorder.as_filter())
        で登録すると、各ツール呼び出し前に完全修飾名を記録する。
        """

        async def _filter(
            context: object,
            next: Callable[[object], Awaitable[None]],
        ) -> None:
            # context.function.fully_qualified_name は "plugin-function" 形式。
            name = context.function.fully_qualified_name  # type: ignore[attr-defined]
            self.record_call(name)
            logger.info("[agent] ツール呼び出し: %s", name)
            await next(context)

        return _filter
