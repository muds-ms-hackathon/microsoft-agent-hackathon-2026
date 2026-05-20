import os
from abc import ABC, abstractmethod


class LLMClient(ABC):
    @abstractmethod
    def call(self, prompt: str, temperature: float = 0.1) -> str:
        """プロンプトを送信してraw textを返す。"""
        ...


class AzureOpenAIClient(LLMClient):
    """本番用。環境変数からAzure OpenAI設定を読む。"""

    def __init__(self) -> None:
        from openai import AzureOpenAI

        self.client = AzureOpenAI(
            api_key=os.environ["AZURE_OPENAI_API_KEY"],
            api_version=os.environ["AZURE_OPENAI_API_VERSION"],
            azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
        )
        self.deployment = os.environ["AZURE_OPENAI_DEPLOYMENT_NAME"]

    def call(self, prompt: str, temperature: float = 0.1) -> str:
        response = self.client.chat.completions.create(
            model=self.deployment,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
        )
        return response.choices[0].message.content or ""


class FakeLLMClient(LLMClient):
    """テスト用。固定レスポンスを返す。"""

    def __init__(self, responses: dict[str, str]) -> None:
        # キーはCallの識別子、値はJSON文字列
        self.responses = responses
        self._call_counter: dict[str, int] = {}

    def call(self, prompt: str, temperature: float = 0.1) -> str:
        # promptの内容からCallを識別して対応するレスポンスを返す
        for key, response in self.responses.items():
            if key in prompt:
                return response
        return "{}"
