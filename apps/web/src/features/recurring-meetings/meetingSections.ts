// 会議一覧をセクション分けするための最小型。
// 実際の API レスポンスは追加フィールドを持つが、関数は heldAt しか使わないので
// ジェネリックで上位フィールドを保ったまま返せるようにする。
export type MeetingForSection = {
  id: string;
  heldAt: string;
};

export type MeetingSections<T extends MeetingForSection> = {
  upcoming: T[];
  past: T[];
};

// 会議一覧を「今後」と「過去」に分割する。
// 仕様:
// - upcoming: heldAt >= now → heldAt 昇順（近い順）
// - past:    heldAt <  now → heldAt 降順（直近順）
// 現在時刻ちょうどは upcoming 側に含めて「これから」のセクションで扱いやすくする。
export function partitionMeetings<T extends MeetingForSection>(
  meetings: T[],
  now: Date = new Date(),
): MeetingSections<T> {
  const nowMs = now.getTime();
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const m of meetings) {
    const heldMs = new Date(m.heldAt).getTime();
    if (heldMs >= nowMs) {
      upcoming.push(m);
    } else {
      past.push(m);
    }
  }
  upcoming.sort(
    (a, b) => new Date(a.heldAt).getTime() - new Date(b.heldAt).getTime(),
  );
  past.sort(
    (a, b) => new Date(b.heldAt).getTime() - new Date(a.heldAt).getTime(),
  );
  return { upcoming, past };
}
