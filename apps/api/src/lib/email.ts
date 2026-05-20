/**
 * email アドレスを比較・マッチング可能な正規化済み文字列に変換する。
 *
 * - 前後の空白を除去
 * - 大文字を小文字に統一（local-part は大文字小文字を区別すべきと RFC 5321 にあるが、
 *   実運用上ほぼすべての MTA が case-insensitive で扱うため統一する）
 *
 * 招待マッチングと OIDC 経由のユーザー紐付けの両方でこの関数を使うことで、
 * 「招待時 abc@example.com、ログイン時 ABC@example.com」のような表記揺れを吸収する。
 *
 * 将来 Gmail の "+alias" や "." の取り扱い、Unicode 正規化（NFKC）等を追加する場合は
 * 本関数を更新する。
 */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}
