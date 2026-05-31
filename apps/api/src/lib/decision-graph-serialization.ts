// 1 会議スコープの「意思決定の文脈グラフ（因果チェーン）」を構築する純粋関数群。
//
// 会議・決定事項・タスク・未決事項・次回議題を「ノード」、それらの来歴
// （会議の連なり／決定からの派生／依存／未決の解決先など）を「エッジ」として返す。
// レスポンスはフロントエンドの React Flow がそのまま扱える形（nodes / edges）に揃える。
//
// Prisma の payload 型には直接依存させず、必要なフィールドだけの構造的型を入力に取る。
// これにより、クエリ側の select / include 変更と疎結合になり、単体テストも書きやすくなる。

export type GraphNodeType =
  | "meeting"
  | "decision"
  | "task"
  | "ambiguous"
  | "topic";

export type GraphEdgeType =
  // 会議の連なり（前回 → 今回 → 次回）
  | "chain"
  // 会議が決定/タスクを生んだ
  | "produces"
  // 決定から派生したタスク
  | "derives"
  // 決定が次回会議へ持ち越された
  | "carryover"
  // 前提となる項目への依存
  | "blocks"
  // 未決事項の解決先
  | "resolves"
  // 次回議題（議題 → 会議）
  | "agenda";

export type GraphNode = {
  id: string;
  type: GraphNodeType;
  label: string;
  data: Record<string, unknown>;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  type: GraphEdgeType;
};

export type DecisionGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

// --- 入力型（純粋関数が必要とする最小フィールドのみ） ---

export type GraphMeetingInput = {
  id: string;
  title: string;
  heldAt: Date;
  previousMeeting: { id: string; title: string } | null;
  nextMeetings: { id: string; title: string }[];
};

export type GraphDecisionInput = {
  id: string;
  title: string;
  status: string;
  decisionState: string | null;
  blockingItemId: string | null;
  plannedMeeting: { id: string; title: string } | null;
};

export type GraphTaskInput = {
  id: string;
  title: string;
  status: string;
  decisionItemId: string | null;
  blockingItemId: string | null;
};

export type GraphAmbiguousInput = {
  id: string;
  body: string;
  status: string;
  resolvedToTaskId: string | null;
  resolvedToDecisionItemId: string | null;
};

export type GraphTopicInput = {
  id: string;
  title: string;
  priority: string | null;
};

export type BuildDecisionGraphInput = {
  meeting: GraphMeetingInput;
  decisionItems: GraphDecisionInput[];
  tasks: GraphTaskInput[];
  ambiguousInfos: GraphAmbiguousInput[];
  topicRequests: GraphTopicInput[];
};

const meetingNodeId = (id: string) => `meeting:${id}`;
const decisionNodeId = (id: string) => `decision:${id}`;
const taskNodeId = (id: string) => `task:${id}`;
const ambiguousNodeId = (id: string) => `ambiguous:${id}`;
const topicNodeId = (id: string) => `topic:${id}`;

/**
 * 1 会議スコープの意思決定文脈グラフを構築する。
 * 入力の各リレーションからノード集合とエッジ集合を組み立てて返す。
 *
 * 設計方針:
 * - ノード ID は種別プレフィックス付き（例 "decision:xxx"）で衝突を防ぐ。
 * - エッジは両端がノード集合に存在する場合のみ張る。会議スコープ外を指す
 *   blockingItemId / resolvedTo* は端点が無いため自然に除外される。
 * - 決定由来のタスクは決定からの derives を優先し、会議からの produces は重複させない。
 */
export function buildDecisionGraph(
  input: BuildDecisionGraphInput,
): DecisionGraph {
  const { meeting, decisionItems, tasks, ambiguousInfos, topicRequests } =
    input;

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  // 生 id → ノード id の逆引き。blockingItemId が決定・タスクのどちらを指すか
  // 不明（スキーマ上は単なる文字列）なため、登録済みノードから一意に解決する。
  const rawIdToNodeId = new Map<string, string>();

  // ノードを重複なく登録する。既に同 ID があれば最初の登録を優先する。
  const addNode = (node: GraphNode, rawId: string) => {
    if (nodes.has(node.id)) return;
    nodes.set(node.id, node);
    rawIdToNodeId.set(rawId, node.id);
  };

  // エッジを登録する。両端がノード集合に存在する場合のみ張る。
  const addEdge = (source: string, target: string, type: GraphEdgeType) => {
    if (!nodes.has(source) || !nodes.has(target)) return;
    edges.push({ id: `${type}:${source}->${target}`, source, target, type });
  };

  // --- ノード登録 ---
  // 当該会議（current=true）。
  addNode(
    {
      id: meetingNodeId(meeting.id),
      type: "meeting",
      label: meeting.title,
      data: { current: true, heldAt: meeting.heldAt },
    },
    meeting.id,
  );
  if (meeting.previousMeeting) {
    addNode(
      {
        id: meetingNodeId(meeting.previousMeeting.id),
        type: "meeting",
        label: meeting.previousMeeting.title,
        data: { current: false },
      },
      meeting.previousMeeting.id,
    );
  }
  for (const next of meeting.nextMeetings) {
    addNode(
      {
        id: meetingNodeId(next.id),
        type: "meeting",
        label: next.title,
        data: { current: false },
      },
      next.id,
    );
  }

  for (const d of decisionItems) {
    addNode(
      {
        id: decisionNodeId(d.id),
        type: "decision",
        label: d.title,
        data: { status: d.status, decisionState: d.decisionState },
      },
      d.id,
    );
    // 持ち越し先の会議が会議チェーンに無い場合もノードとして補う。
    if (d.plannedMeeting) {
      addNode(
        {
          id: meetingNodeId(d.plannedMeeting.id),
          type: "meeting",
          label: d.plannedMeeting.title,
          data: { current: false },
        },
        d.plannedMeeting.id,
      );
    }
  }

  for (const t of tasks) {
    addNode(
      {
        id: taskNodeId(t.id),
        type: "task",
        label: t.title,
        data: { status: t.status },
      },
      t.id,
    );
  }

  for (const a of ambiguousInfos) {
    addNode(
      {
        id: ambiguousNodeId(a.id),
        type: "ambiguous",
        label: a.body,
        data: { status: a.status },
      },
      a.id,
    );
  }

  for (const tr of topicRequests) {
    addNode(
      {
        id: topicNodeId(tr.id),
        type: "topic",
        label: tr.title,
        data: { priority: tr.priority },
      },
      tr.id,
    );
  }

  // --- エッジ登録（全ノード登録後に実施し、端点解決を確実にする） ---
  // 会議の連なり: 前回 → 今回 → 次回。
  if (meeting.previousMeeting) {
    addEdge(
      meetingNodeId(meeting.previousMeeting.id),
      meetingNodeId(meeting.id),
      "chain",
    );
  }
  for (const next of meeting.nextMeetings) {
    addEdge(meetingNodeId(meeting.id), meetingNodeId(next.id), "chain");
  }

  for (const d of decisionItems) {
    // 会議が決定を生んだ。
    addEdge(meetingNodeId(meeting.id), decisionNodeId(d.id), "produces");
    // 前提となる項目への依存。
    if (d.blockingItemId) {
      const blocker = rawIdToNodeId.get(d.blockingItemId);
      if (blocker) addEdge(blocker, decisionNodeId(d.id), "blocks");
    }
    // 次回会議への持ち越し。
    if (d.plannedMeeting) {
      addEdge(
        decisionNodeId(d.id),
        meetingNodeId(d.plannedMeeting.id),
        "carryover",
      );
    }
  }

  for (const t of tasks) {
    // 決定由来なら決定 → タスク、それ以外は会議 → タスク。
    if (t.decisionItemId && nodes.has(decisionNodeId(t.decisionItemId))) {
      addEdge(decisionNodeId(t.decisionItemId), taskNodeId(t.id), "derives");
    } else {
      addEdge(meetingNodeId(meeting.id), taskNodeId(t.id), "produces");
    }
    if (t.blockingItemId) {
      const blocker = rawIdToNodeId.get(t.blockingItemId);
      if (blocker) addEdge(blocker, taskNodeId(t.id), "blocks");
    }
  }

  for (const a of ambiguousInfos) {
    // 未決事項の解決先（タスク化 / 決定化）。
    if (a.resolvedToTaskId) {
      addEdge(
        ambiguousNodeId(a.id),
        taskNodeId(a.resolvedToTaskId),
        "resolves",
      );
    }
    if (a.resolvedToDecisionItemId) {
      addEdge(
        ambiguousNodeId(a.id),
        decisionNodeId(a.resolvedToDecisionItemId),
        "resolves",
      );
    }
  }

  for (const tr of topicRequests) {
    // 次回議題は当該会議に向けたものとして会議へ結ぶ。
    addEdge(topicNodeId(tr.id), meetingNodeId(meeting.id), "agenda");
  }

  return { nodes: [...nodes.values()], edges };
}
