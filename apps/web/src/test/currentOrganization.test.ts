import { createStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearCurrentOrganizationIdAtom,
  currentOrganizationIdAtom,
  setCurrentOrganizationIdAtom,
} from "../lib/currentOrganization";

// 他タブからの localStorage 変更を擬似的に再現するヘルパー。
// 同一 window 内の localStorage.setItem では storage イベントが発火しないため、
// dispatchEvent で別タブからの通知を模す（auth.test.ts と同じ手法）。
function dispatchStorageEvent(key: string | null, newValue: string | null) {
  window.dispatchEvent(
    new StorageEvent("storage", {
      key,
      newValue,
      storageArea: localStorage,
    }),
  );
}

describe("currentOrganizationIdAtom", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("初期状態は null を返す", () => {
    const store = createStore();
    expect(store.get(currentOrganizationIdAtom)).toBeNull();
  });

  it("setCurrentOrganizationIdAtom 経由で書き込むと localStorage と atom の双方が更新される", () => {
    const store = createStore();

    store.set(setCurrentOrganizationIdAtom, "org-1");

    expect(localStorage.getItem("current_organization_id")).toBe("org-1");
    expect(store.get(currentOrganizationIdAtom)).toBe("org-1");
  });

  it("clearCurrentOrganizationIdAtom 経由で書き込むと localStorage から削除され atom も null になる", () => {
    const store = createStore();
    store.set(setCurrentOrganizationIdAtom, "org-1");

    store.set(clearCurrentOrganizationIdAtom);

    expect(localStorage.getItem("current_organization_id")).toBeNull();
    expect(store.get(currentOrganizationIdAtom)).toBeNull();
  });

  it("他タブからの変更（storage イベント）で atom が追従する", () => {
    const store = createStore();
    // atomWithStorage の subscribe は購読者がいる時のみ有効化されるため、
    // テストでも store.sub で明示的にサブスクライブする。
    const unsubscribe = store.sub(currentOrganizationIdAtom, () => {});

    try {
      localStorage.setItem("current_organization_id", "org-2");
      dispatchStorageEvent("current_organization_id", "org-2");

      expect(store.get(currentOrganizationIdAtom)).toBe("org-2");
    } finally {
      unsubscribe();
    }
  });

  it("他タブからの clear（storage イベント newValue=null）で atom が null に戻る", () => {
    const store = createStore();
    store.set(setCurrentOrganizationIdAtom, "org-1");
    const unsubscribe = store.sub(currentOrganizationIdAtom, () => {});

    try {
      dispatchStorageEvent("current_organization_id", null);
      expect(store.get(currentOrganizationIdAtom)).toBeNull();
    } finally {
      unsubscribe();
    }
  });

  it("localStorage.clear() 相当の storage イベント（key=null）でも atom がクリアされる", () => {
    const store = createStore();
    store.set(setCurrentOrganizationIdAtom, "org-1");
    const unsubscribe = store.sub(currentOrganizationIdAtom, () => {});

    try {
      dispatchStorageEvent(null, null);
      expect(store.get(currentOrganizationIdAtom)).toBeNull();
    } finally {
      unsubscribe();
    }
  });
});
