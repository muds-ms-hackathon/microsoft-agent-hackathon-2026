import { describe, expect, it } from "vitest";
import {
  type BuildDecisionGraphInput,
  buildDecisionGraph,
} from "../src/lib/decision-graph-serialization.js";

// 各テストが必要な部分だけ上書きできるよう、空の会議スコープを基底とする。
function baseInput(
  overrides: Partial<BuildDecisionGraphInput> = {},
): BuildDecisionGraphInput {
  return {
    meeting: {
      id: "m1",
      title: "第3回 定例",
      heldAt: new Date("2026-05-17T10:00:00Z"),
      previousMeeting: null,
      nextMeetings: [],
      ...overrides.meeting,
    },
    decisionItems: overrides.decisionItems ?? [],
    tasks: overrides.tasks ?? [],
    ambiguousInfos: overrides.ambiguousInfos ?? [],
    topicRequests: overrides.topicRequests ?? [],
  };
}

describe("buildDecisionGraph", () => {
  it("関連が無くても当該会議ノードのみを返し、エッジは空になる", () => {
    const graph = buildDecisionGraph(baseInput());

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({
      id: "meeting:m1",
      type: "meeting",
      label: "第3回 定例",
    });
    expect(graph.nodes[0].data).toMatchObject({ current: true });
    expect(graph.edges).toEqual([]);
  });

  it("前回・次回会議を会議ノードと chain エッジで連ねる", () => {
    const graph = buildDecisionGraph(
      baseInput({
        meeting: {
          id: "m1",
          title: "第3回",
          heldAt: new Date("2026-05-17T10:00:00Z"),
          previousMeeting: { id: "m0", title: "第2回" },
          nextMeetings: [{ id: "m2", title: "第4回" }],
        },
      }),
    );

    const meetingIds = graph.nodes
      .filter((n) => n.type === "meeting")
      .map((n) => n.id)
      .sort();
    expect(meetingIds).toEqual(["meeting:m0", "meeting:m1", "meeting:m2"]);

    // 前回 → 今回、今回 → 次回 の 2 本
    const chains = graph.edges.filter((e) => e.type === "chain");
    expect(chains).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "meeting:m0", target: "meeting:m1" }),
        expect.objectContaining({ source: "meeting:m1", target: "meeting:m2" }),
      ]),
    );
    expect(chains).toHaveLength(2);

    // 今回以外の会議ノードは current=false
    const prev = graph.nodes.find((n) => n.id === "meeting:m0");
    expect(prev?.data).toMatchObject({ current: false });
  });

  it("会議が生んだ決定・タスクを produces エッジで結ぶ", () => {
    const graph = buildDecisionGraph(
      baseInput({
        decisionItems: [
          {
            id: "d1",
            title: "予算を承認する",
            status: "confirmed",
            decisionState: "confirmed",
            blockingItemId: null,
            plannedMeeting: null,
          },
        ],
        tasks: [
          {
            id: "t1",
            title: "資料を作成する",
            status: "todo",
            decisionItemId: null,
            blockingItemId: null,
          },
        ],
      }),
    );

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "decision:d1", type: "decision" }),
        expect.objectContaining({ id: "task:t1", type: "task" }),
      ]),
    );
    const produces = graph.edges.filter((e) => e.type === "produces");
    expect(produces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "meeting:m1",
          target: "decision:d1",
        }),
        expect.objectContaining({ source: "meeting:m1", target: "task:t1" }),
      ]),
    );
  });

  it("決定由来のタスクは derives エッジで結び、会議からの produces は張らない", () => {
    const graph = buildDecisionGraph(
      baseInput({
        decisionItems: [
          {
            id: "d1",
            title: "方針を決定",
            status: "confirmed",
            decisionState: "confirmed",
            blockingItemId: null,
            plannedMeeting: null,
          },
        ],
        tasks: [
          {
            id: "t1",
            title: "決定に基づく作業",
            status: "todo",
            decisionItemId: "d1",
            blockingItemId: null,
          },
        ],
      }),
    );

    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "decision:d1",
          target: "task:t1",
          type: "derives",
        }),
      ]),
    );
    // 決定由来のタスクは会議 → タスクの produces を重複して張らない
    expect(
      graph.edges.some((e) => e.target === "task:t1" && e.type === "produces"),
    ).toBe(false);
  });

  it("次回会議へ持ち越された決定を carryover エッジと会議ノードで表す", () => {
    const graph = buildDecisionGraph(
      baseInput({
        decisionItems: [
          {
            id: "d1",
            title: "次回再検討",
            status: "open",
            decisionState: "open",
            blockingItemId: null,
            plannedMeeting: { id: "m2", title: "第4回" },
          },
        ],
      }),
    );

    // planned 先の会議がノードとして追加される
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "meeting:m2", type: "meeting" }),
      ]),
    );
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "decision:d1",
          target: "meeting:m2",
          type: "carryover",
        }),
      ]),
    );
  });

  it("blockingItemId が集合内なら blocks エッジを張り、集合外なら張らない", () => {
    const graph = buildDecisionGraph(
      baseInput({
        decisionItems: [
          {
            id: "d1",
            title: "前提となる決定",
            status: "confirmed",
            decisionState: "confirmed",
            blockingItemId: null,
            plannedMeeting: null,
          },
          {
            id: "d2",
            title: "d1 に依存する決定",
            status: "open",
            decisionState: "open",
            blockingItemId: "d1",
            plannedMeeting: null,
          },
        ],
        tasks: [
          {
            id: "t1",
            title: "外部依存タスク",
            status: "todo",
            decisionItemId: null,
            blockingItemId: "unknown-id",
          },
        ],
      }),
    );

    const blocks = graph.edges.filter((e) => e.type === "blocks");
    expect(blocks).toEqual([
      expect.objectContaining({ source: "decision:d1", target: "decision:d2" }),
    ]);
  });

  it("未決事項の解決先を resolves エッジで結ぶ", () => {
    const graph = buildDecisionGraph(
      baseInput({
        decisionItems: [
          {
            id: "d1",
            title: "解決先の決定",
            status: "confirmed",
            decisionState: "confirmed",
            blockingItemId: null,
            plannedMeeting: null,
          },
        ],
        tasks: [
          {
            id: "t1",
            title: "解決先のタスク",
            status: "todo",
            decisionItemId: null,
            blockingItemId: null,
          },
        ],
        ambiguousInfos: [
          {
            id: "a1",
            body: "担当者が未定",
            status: "resolved",
            resolvedToTaskId: "t1",
            resolvedToDecisionItemId: null,
          },
          {
            id: "a2",
            body: "判断保留",
            status: "resolved",
            resolvedToTaskId: null,
            resolvedToDecisionItemId: "d1",
          },
        ],
      }),
    );

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ambiguous:a1",
          type: "ambiguous",
          label: "担当者が未定",
        }),
      ]),
    );
    const resolves = graph.edges.filter((e) => e.type === "resolves");
    expect(resolves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "ambiguous:a1", target: "task:t1" }),
        expect.objectContaining({
          source: "ambiguous:a2",
          target: "decision:d1",
        }),
      ]),
    );
  });

  it("次回議題を topic ノードと agenda エッジで当該会議に結ぶ", () => {
    const graph = buildDecisionGraph(
      baseInput({
        topicRequests: [{ id: "tr1", title: "次回の論点", priority: "high" }],
      }),
    );

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "topic:tr1",
          type: "topic",
          label: "次回の論点",
        }),
      ]),
    );
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "topic:tr1",
          target: "meeting:m1",
          type: "agenda",
        }),
      ]),
    );
  });

  it("全ノード ID が一意であり、全エッジの端点がノード集合に含まれる", () => {
    const graph = buildDecisionGraph(
      baseInput({
        meeting: {
          id: "m1",
          title: "第3回",
          heldAt: new Date("2026-05-17T10:00:00Z"),
          previousMeeting: { id: "m0", title: "第2回" },
          nextMeetings: [{ id: "m2", title: "第4回" }],
        },
        decisionItems: [
          {
            id: "d1",
            title: "決定",
            status: "confirmed",
            decisionState: "confirmed",
            blockingItemId: null,
            plannedMeeting: { id: "m2", title: "第4回" },
          },
        ],
        tasks: [
          {
            id: "t1",
            title: "タスク",
            status: "todo",
            decisionItemId: "d1",
            blockingItemId: null,
          },
        ],
        topicRequests: [{ id: "tr1", title: "議題", priority: null }],
      }),
    );

    const ids = graph.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);

    const idSet = new Set(ids);
    for (const edge of graph.edges) {
      expect(idSet.has(edge.source)).toBe(true);
      expect(idSet.has(edge.target)).toBe(true);
    }

    // エッジ ID も一意
    const edgeIds = graph.edges.map((e) => e.id);
    expect(new Set(edgeIds).size).toBe(edgeIds.length);
  });
});
