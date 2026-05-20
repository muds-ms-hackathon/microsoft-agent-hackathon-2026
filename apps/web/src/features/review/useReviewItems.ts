import { useCallback, useState } from "react";
import type { ReviewItem } from "./types";

const STORAGE_KEY = "review_items_v5";

function loadItems(): ReviewItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ReviewItem[];
  } catch {
    return [];
  }
}

export function useReviewItems() {
  const [items, setItemsState] = useState<ReviewItem[]>(loadItems);

  const save = useCallback((next: ReviewItem[]) => {
    setItemsState(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const addItem = useCallback(
    (draft: Omit<ReviewItem, "id" | "status">) => {
      save([{ ...draft, id: crypto.randomUUID(), status: "pending" }, ...items]);
    },
    [items, save],
  );

  // status・type・担当者・期限など任意のフィールドを一括更新する。
  // レビューページで「承認」「修正して承認」「却下」「曖昧解消」を統一的に扱うために使う。
  const updateItem = useCallback(
    (id: string, updates: Partial<Omit<ReviewItem, "id">>) => {
      save(items.map((i) => (i.id === id ? { ...i, ...updates } : i)));
    },
    [items, save],
  );

  return { items, addItem, updateItem };
}
