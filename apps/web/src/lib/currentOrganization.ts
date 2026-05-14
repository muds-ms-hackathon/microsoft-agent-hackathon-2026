// 「現在選択中の組織」を管理する atom 群。
//
// 真実源: localStorage（current_organization_id キー）に一本化する。
// 公開 atom は派生 read-only であり、書き込みは set / clear の write-only atom
// を介して行う。auth.ts の id_token と同じ構造で、UI と localStorage の
// 二重管理を構造的に排除している。
//
// 値の意味:
//   - 文字列: 選択中の組織 ID
//   - null  : 未選択（組織 0 件 or ログアウト直後）

import { type Atom, atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

// jotai/utils は SyncStorage 型を public な entry point から再エクスポートして
// いないため、atomWithStorage が受け付ける形に合わせてローカルで定義する。
type StringStorage = {
  getItem: (key: string, initialValue: string | null) => string | null;
  setItem: (key: string, newValue: string | null) => void;
  removeItem: (key: string) => void;
  subscribe: (
    key: string,
    callback: (value: string | null) => void,
    initialValue: string | null,
  ) => (() => void) | undefined;
};

const CURRENT_ORGANIZATION_ID_KEY = "current_organization_id";

// JSON エンコードを介さない raw 文字列ストレージ。
// 既定の createJSONStorage は値を JSON 化するため、外部ツール等で
// localStorage を覗いた際にダブルクォートで囲まれた値になる。それを避ける。
const stringStorage: StringStorage = {
  getItem(key, initialValue) {
    if (typeof window === "undefined") return initialValue;
    return localStorage.getItem(key);
  },
  setItem(key, newValue) {
    if (typeof window === "undefined") return;
    if (newValue === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, newValue);
    }
  },
  removeItem(key) {
    if (typeof window === "undefined") return;
    localStorage.removeItem(key);
  },
  subscribe(key, callback, _initialValue) {
    if (typeof window === "undefined") return undefined;
    const handler = (e: StorageEvent) => {
      if (e.storageArea !== localStorage) return;
      // localStorage.clear() の場合は key=null で発火するため、それも null 扱い。
      if (e.key === null || e.key === key) {
        callback(e.newValue);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  },
};

// 真実源としての atom（モジュール外には公開しない）。
const currentOrganizationIdStorageAtom = atomWithStorage<string | null>(
  CURRENT_ORGANIZATION_ID_KEY,
  null,
  stringStorage,
  { getOnInit: true },
);

// 公開 read-only atom。
export const currentOrganizationIdAtom: Atom<string | null> = atom((get) =>
  get(currentOrganizationIdStorageAtom),
);

// 書き込み専用 atom。値をセットする。
export const setCurrentOrganizationIdAtom = atom(
  null,
  (_get, set, organizationId: string) => {
    set(currentOrganizationIdStorageAtom, organizationId);
  },
);

// 書き込み専用 atom。null にする（未選択状態に戻す）。
// logout 時や、選択中の組織が削除されたケースで利用する。
export const clearCurrentOrganizationIdAtom = atom(null, (_get, set) => {
  set(currentOrganizationIdStorageAtom, null);
});
