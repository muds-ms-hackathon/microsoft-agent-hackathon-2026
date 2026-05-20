import type { Prisma, PrismaClient } from "@prisma/client";

// 解析ランの状態。schema.prisma の enum AnalysisRunStatus と一致させる。
export type AnalysisRunStatus = "queued" | "analyzing" | "completed" | "failed";

/**
 * 状態遷移テーブル。 `from` に対して許容される `to` の集合を定義する。
 * - queued → analyzing（AI Service が解析開始時）
 * - analyzing → completed（解析成功）/ failed（解析失敗）
 * - completed / failed は終端状態（再遷移不可）
 *
 * 「queued → failed」のような遷移は外部 API（PATCH /internal/analysis-runs/:id）
 * では許可していないため、本テーブルにも含めない。Service Bus 送信失敗時等の
 * 内部経路で queued レコードを失敗にする場合は、本関数を経由しない direct
 * update を使う（meetings.ts:POST /:id/analyze）。
 */
export const VALID_TRANSITIONS: Record<
  AnalysisRunStatus,
  ReadonlyArray<AnalysisRunStatus>
> = {
  queued: ["analyzing"],
  analyzing: ["completed", "failed"],
  completed: [],
  failed: [],
};

export class InvalidAnalysisRunTransitionError extends Error {
  readonly from: AnalysisRunStatus;
  readonly to: AnalysisRunStatus;
  constructor(from: AnalysisRunStatus, to: AnalysisRunStatus) {
    super(`不正な状態遷移: ${from} → ${to}`);
    this.name = "InvalidAnalysisRunTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function canTransition(
  from: AnalysisRunStatus,
  to: AnalysisRunStatus,
): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

// 遷移時に同時に書き込むカラム類。Prisma UpdateInput と互換に絞り込み。
export type AnalysisRunUpdateExtras = Omit<
  Prisma.MeetingAnalysisRunUpdateInput,
  "status" | "startedAt" | "completedAt" | "failedAt"
>;

export type TransitionOutcome =
  | { kind: "transitioned"; from: AnalysisRunStatus }
  | { kind: "noop"; current: AnalysisRunStatus } // 既に target の状態だった
  | { kind: "conflict"; current: AnalysisRunStatus } // CAS で取り逃した
  | { kind: "not_found" };

/**
 * 解析ランの状態を遷移させる。
 *
 * Compare-and-swap で同時更新の競合を検出する。
 * 遷移ターゲットに応じて startedAt / completedAt / failedAt を自動セットする。
 *
 * - 不正遷移は InvalidAnalysisRunTransitionError を投げる
 * - すでに target の状態なら { kind: "noop" } を返す（冪等）
 * - CAS で取り逃した場合は { kind: "conflict" } を返す（呼び出し側で 409）
 * - レコード不在は { kind: "not_found" }
 */
export async function transitionAnalysisRunStatus(
  client: PrismaClient | Prisma.TransactionClient,
  id: string,
  to: AnalysisRunStatus,
  extras?: AnalysisRunUpdateExtras,
): Promise<TransitionOutcome> {
  const current = await client.meetingAnalysisRun.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!current) {
    return { kind: "not_found" };
  }
  const from = current.status as AnalysisRunStatus;
  if (from === to) {
    return { kind: "noop", current: from };
  }
  if (!canTransition(from, to)) {
    throw new InvalidAnalysisRunTransitionError(from, to);
  }

  const data: Prisma.MeetingAnalysisRunUpdateInput = {
    ...(extras ?? {}),
    status: to,
  };
  // 状態固有のタイムスタンプを自動セットする。extras 側では startedAt /
  // completedAt / failedAt は受け取らない（型で除外済み）。
  if (to === "analyzing") data.startedAt = new Date();
  if (to === "completed") data.completedAt = new Date();
  if (to === "failed") data.failedAt = new Date();

  // 取得時の status を条件に加えた CAS。並行更新が走っていた場合は 0 件になる。
  const result = await client.meetingAnalysisRun.updateMany({
    where: { id, status: from },
    data,
  });
  if (result.count === 0) {
    const latest = await client.meetingAnalysisRun.findUnique({
      where: { id },
      select: { status: true },
    });
    return {
      kind: "conflict",
      current: (latest?.status ?? from) as AnalysisRunStatus,
    };
  }
  return { kind: "transitioned", from };
}
