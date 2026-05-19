// hono/client の ClientResponse 型はメソッドが多く構築不可能なため、テストでは
// 最低限のフィールド (ok / status / json) だけ持つスタブを返す。
// as never キャストをこのヘルパー 1 箇所に集約することで、各テストファイルで
// 同じ mockJson を重複定義する必要がなくなる。
// vi.mocked(...).mockResolvedValue(mockJson(data)) の形で使う。
export function mockJson<T>(data: T, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as never;
}
