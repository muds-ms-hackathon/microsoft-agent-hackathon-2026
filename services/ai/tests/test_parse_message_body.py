from unittest.mock import MagicMock

import pytest

from main import _parse_message_body


def _msg(body):
    """body を持つ ServiceBusReceivedMessage のモックを返す"""
    m = MagicMock()
    m.body = body
    return m


def test_bytes_body_returned_as_is():
    """body が bytes のとき、そのまま返す"""
    result = _parse_message_body(_msg(b'{"key": "value"}'))
    assert result == b'{"key": "value"}'


def test_bytearray_body_converted_to_bytes():
    """body が bytearray のとき bytes に変換して返す"""
    result = _parse_message_body(_msg(bytearray(b"hello")))
    assert result == b"hello"
    assert isinstance(result, bytes)


def test_memoryview_body_converted_to_bytes():
    """body が memoryview のとき bytes に変換して返す"""
    result = _parse_message_body(_msg(memoryview(b"world")))
    assert result == b"world"
    assert isinstance(result, bytes)


def test_iterable_of_bytes_chunks_joined():
    """body が Iterable[bytes] のとき各チャンクを結合して返す"""
    chunks = iter([b"foo", b"bar", b"baz"])
    result = _parse_message_body(_msg(chunks))
    assert result == b"foobarbaz"


def test_iterable_with_invalid_chunk_raises_type_error():
    """body の要素が bytes でない場合 TypeError を送出する"""
    with pytest.raises(TypeError, match="非対応の chunk 型"):
        _parse_message_body(_msg(iter([b"ok", "not bytes"])))


def test_unsupported_body_type_raises_type_error():
    """body が bytes でも iterable でもない場合 TypeError を送出する"""
    with pytest.raises(TypeError, match="未対応の message.body 型"):
        _parse_message_body(_msg(12345))
