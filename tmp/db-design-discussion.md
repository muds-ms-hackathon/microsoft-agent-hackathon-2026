# DBテーブル設計 議論ログ

## Step 1: エンティティの洗い出し

### 候補
- Meeting（会議）
- Agenda（議題）
- Decision（決定事項）
- OpenIssue（未決事項）
- Task（タスク）
- Ambiguity（曖昧箇所）
- Member（メンバー）
- MeetingLog（会議ログ）

---

## Step 2: MeetingSeries と Meeting を分けるか？

**Q: 「毎週の定例」と「1回の会議」は別テーブルにすべきか？**

- 案A: Meeting 1テーブルのみ
- 案B: MeetingSeries（定例そのもの）と Meeting（1回の開催）に分ける

**結論: 案B（2テーブルに分ける）**

理由: それぞれが扱いたい情報が異なるため。
- `MeetingSeries` → 定例の名前・参加メンバー・開催曜日・会議室など「シリーズとして変わらない情報」
- `Meeting` → 開催日・実際の参加者・会議ログなど「その回ごとに変わる情報」

---

## Step 3: Meeting のステータス

**Q: Meeting はどんな状態を持つか？**

**議論:**
- `done` と `closed` を分けるか検討したが、タスク化やレビューはすぐに完了しない。会議の中で全てが完了したかどうかは Meeting で追うより Task や Ambiguity の状態で追えばよい。
- 次回アジェンダ生成は「状態」ではなく「アクション（手動または特定タイミングのトリガー）」として扱う。
- このシステムは会議中にリアルタイムで使うものではなく（§14.3 より MTGツール・文字起こし機能は除外）、会議後にテキストを貼り付けて使うため `in_progress` は不要。

**結論:**
```
scheduled  → 予定されている
done       → 会議が終わった（ログを投入できる状態）
cancelled  → キャンセルされた
```

---

## Step 4: Task のステータス

**Q: タスクが生まれる瞬間はどこか？**

- AIが抽出（会議ログ投入後）→ 人間が確認・確定
- 人間が直接作成（最初から確定済み）

**Q: `draft` → `confirmed` の間に「レビュー中」は必要か？**

オーナー以外も確認するケースがあるため、「確認中（reviewing）」があると良い。

**Q: `overdue`（期限超過）ステータスは必要か？**

不要。タスクの着手状況と期限は別の概念であり、`due_date` と現在日時の比較で動的に判断できる。客観的事実を重複して持つ必要はない。

**結論:**
```
draft       → AIが抽出した、未確認
reviewing   → 誰かが確認中
confirmed   → 確定した（直接作成はここからスタート）
in_progress → 着手中
done        → 完了
rejected    → 却下された
```

遷移:
```
[draft] → [reviewing] → [confirmed] → [in_progress] → [done]
                              ↓
                          [rejected]
```

---

---

## Step 5: Ambiguity のステータス

**Q: Ambiguity はどんな状態を持つか？**

**議論:**
- 当初 `dismissed`（対応不要）を候補に挙げたが、曖昧箇所は必ず Decision / OpenIssue / Task のいずれかに解消されるべきであり、dismissed は不要と判断。
- `resolved` の細分化も検討したが、解消先との紐付きはリレーション（外部キー）で別途追うため、ステータスはシンプルで良い。
- ステータスは「この曖昧箇所が今どの段階にあるか」のみを表す。「どの Decision/OpenIssue/Task に解消されたか」はリレーションで管理する。

**結論:**
```
extracted   → AIが抽出した、未確認
reviewing   → 誰かが確認中
resolved    → いずれかに解消された（Decision / OpenIssue / Task）
```

---

---

## Step 6: Decision のステータス

**Q: 曖昧でない抽出結果も全件レビューを挟むべきか？**

- 案A: 全部レビューを挟む（draft → reviewing → confirmed）
- 案B: とりあえず確定、後から修正可能

**議論:**
- 要件 §10.1「曖昧箇所のみ人が確認する」という設計思想と合わせると、全件レビュー強制は運用が重くなる。
- 案Bが適切。ただし「誰がいつ何を修正したか」の差分ログ（AuditLog）は必須。
- **設計方針として確立:** レビューフローが必要かどうかは曖昧さの有無で決まる。

**結論:**
```
confirmed   → AI抽出時点で確定（デフォルト）
overturned  → 後の会議で覆された
```

`draft` は不要。修正履歴は AuditLog で追う。

---

---

## Step 7: OpenIssue のステータス

**Q: `scheduled` は必要か？予定会議のFKがあれば動的に判断できるのでは？**

**議論:**
- 未決で何も決まっていない状態と、いつ話すかが決まっている状態は、UI上でパッと区別できる必要がある。
- それはOpenIssueそのものの状態なので、ステータスで持つべき。

**結論:**
```
open        → 未決のまま（AI抽出時点でデフォルト）
scheduled   → 次回会議の議題に設定済み
resolved    → Decision または Task に変換された
cancelled   → 対応不要と判断された
```

---

---

## Step 8: リレーション設計

### 基本リレーション

```
MeetingSeries 1 ──< Meeting
Meeting       1 ──< Agenda
Meeting       1 ──< Decision
Meeting       1 ──< Task
Meeting       1 ──< Ambiguity
Meeting       1 ──< OpenIssue（発生元会議）
OpenIssue     N ──> Meeting（予定会議）
Task          N ── N Member（担当者）
```

### Ambiguity の解消先リレーション

**Q: 解消先（Decision / OpenIssue / Task）とどう紐づけるか？**

- 案A: 3つの外部キーを持つ（nullable）
- 案B: ポリモーフィック（resolved_type + resolved_id）
- 第3案: 中間テーブル（AmbiguityResolution）

**議論:**
- 件数より「変更コスト」で判断するのがベストプラクティス。
- A → 3 の移行はテーブル追加から段階的にできるため比較的容易。
- 3 → A の移行は type に応じた振り分けが必要で面倒。
- MVP フェーズでデータ量が少ない今は案Aで始め、必要になったら3に移行するのが合理的。
- 解消先は現時点で3種類固定の見込み。

**結論: 案A**
```
Ambiguity
- resolved_decision_id   (nullable FK)
- resolved_open_issue_id (nullable FK)
- resolved_task_id       (nullable FK)
```

---

### Task と Member の多対多

担当者は複数人つけるケースが必ずあるため中間テーブルで管理。

```
TaskAssignee
- task_id   (FK)
- member_id (FK)
```

### Agenda のリレーション設計

**Q: Agenda をどう設計するか？**

**議論:**
- 追跡したいのは「どのMTGで話したか」「どんな未決事項を通ってきたか」の2軸。
- 1つの議題トピックが複数の会議にまたがって追跡されるため、AgendaItem と Meeting は多対多。
- AgendaItem は AI Agent が OpenIssue と人間入力（TopicRequest）をもとに生成する。
- 人間入力は別テーブル（TopicRequest）で管理し、AI がそれを読んで AgendaItem を生成。
- 重複・関連する OpenIssue や TopicRequest をまとめて1つの AgendaItem にするケースがあるため、ソースとの紐付きは中間テーブルで管理。
- ソースの種類は OpenIssue と TopicRequest の2種類で固定見込みのため、ポリモーフィックで対応。

**結論:**
```
TopicRequest（人間が入力した「次回話したいこと」）
- requested_by
- content
- meeting_series_id

AgendaItem（AIが生成した議題項目）

AgendaItemSource（ソースとの紐付き・中間テーブル）
- agenda_item_id
- source_type: "open_issue" | "topic_request"
- source_id

MeetingAgendaItem（AgendaItem と Meeting の中間テーブル）
- meeting_id
- agenda_item_id
```

---

## Step 9: テキスト系データの設計

**Q: 文字起こし・議事録・AI要約などをどこに持つか？**

**論点1: DBのTEXT型 vs Blob Storage**

- MVP段階では文字起こし1件あたり数万字、1,000件でも約10MBとDBとして問題ない規模。
- Blob Storageへの移行タイミングは「DBサイズがコスト圧迫になったとき」「ファイルとして扱いたいニーズが出たとき」「Azure AI SearchのインデクサーをBlob Storageから直接つなぎたいとき」。
- **結論: MVPはDB TEXT型で持ち、スケール時にストレージへ移行する。**

**論点2: Meeting のカラムに持つ（案A）vs MeetingDocument テーブル（案B）**

- ドキュメントの種類は今後増える可能性が大いにある（入力系・AI出力系）ため、案Aの固定カラムでは対応しきれない。
- ただし文字起こしとAI要約は1:1、議事録・関連資料は1:Nと性質が異なる。
- 1:1 のものを MeetingDocument に入れると毎回JOINが必要になりクエリが複雑になる。

**結論: 案B-2（1:1はMeetingカラム、1:NはMeetingDocumentテーブル）**

```
Meeting
- transcript_text   (1:1)
- ai_summary_text   (1:1)

MeetingDocument（議事録・関連資料など 1:N）
- meeting_id
- type: "minutes" | "material" | ...
- content (TEXT)
- created_by: "human" | "ai"
- created_at
```

---

---

## Step 10: 抜け漏れ確認

### 1. Member / MeetingAttendee

**議論:**
- User をベースエンティティとして持つ。
- 定例のデフォルトメンバーは MeetingSeriesMember で管理。変動はあるが履歴は不要（削除で対応）。
- その回の参加者・参加候補は MeetingAttendee で管理。AIが提案するケースもある。

**結論:**
```
User（ユーザーアカウント）

MeetingSeriesMember（定例のデフォルトメンバー）
- series_id
- user_id

MeetingAttendee（その回の実際の参加者・参加候補）
- meeting_id
- user_id
- status: "suggested" | "confirmed" | "declined"
- suggested_reason
```

---

### 2. ReadLog の設計

一旦 Task のみ対象。今後増える可能性は0ではないが、MVPはシンプルに直接FKで持つ。

```
ReadLog
- task_id (FK)
- user_id (FK)
- read_at
```

### 3. AuditLog のスコープ・設計方針

**Q: ログテーブルとして持つか、イベントとして持つか？**

**議論:**
- イベントソーシングは現在の状態の取得が複雑（replay・スナップショット）、クエリが難しい、スキーマ変更が困難。
- ドメインイベントは中間的な選択肢だが、Service Bus などの追加インフラが必要。
- インフラコスト: CRUD+AuditLog $50〜150/月 vs イベントソーシング $150〜400/月。
- エンジニアリングコストの差が最も大きく、イベントソーシングは4〜6倍の工数。
- 通知・リマインドはバッチ処理で対応できる。

**結論: CRUD + AuditLog**

対象テーブル: Task / Decision / OpenIssue / Ambiguity 全て。

```
AuditLog
- target_type: "task" | "decision" | "open_issue" | "ambiguity" | ...
- target_id
- field_name
- before_value
- after_value
- change_source: "ai" | "human"
- changed_by (user_id FK)
- changed_at
```

---

### 4. Briefing

要件書 §16.4 に記載があったが、Agenda（AgendaItem）が会議前の事前共有資料の役割を担うため不要。テーブルとして持たない。

---

## 全テーブル一覧（確定版）

**リソース系:**
```
User
MeetingSeries
MeetingSeriesMember（series_id, user_id）
Meeting（transcript_text, ai_summary_text を持つ）
MeetingAttendee（meeting_id, user_id, status, suggested_reason）
MeetingDocument（議事録・関連資料など 1:N）
TopicRequest（人間が入力した「次回話したいこと」）
AgendaItem（AIが生成した議題項目）
AgendaItemSource（AgendaItem とソースの中間テーブル）
MeetingAgendaItem（AgendaItem と Meeting の中間テーブル）
Decision
OpenIssue
Task
TaskAssignee（task_id, user_id）
Ambiguity
```

**イベント系:**
```
AuditLog（AI提案→人間確定の差分記録）
ReadLog（タスク既読状況）
```

---

### 5. 認証方式

**Q: ログインはどう扱うか？**

- 案A: 自前実装（email + password）
- 案B: Microsoft Entra ID（Azure AD）
- 案C: Auth0 / Clerk などの外部サービス

**結論: 案B（Microsoft Entra ID）**

チーム向けB2Bツールでありazureスタックを使う前提のため自然な選択。パスワードはDBに持たず認証はEntra IDに委託。

```
User
- external_id  varchar NOT NULL UNIQUE（Entra ID のオブジェクトID）
- provider     varchar NOT NULL DEFAULT 'entra'
```

---

---

## Step 11: Decision / OpenIssue の統合

**Q: Decision と OpenIssue は別テーブルか、Issue として1テーブルか？**

**議論:**
- パフォーマンス観点では規模的に誤差。
- open → resolved への遷移が自然で、同じ議題の経緯をトレースできる。
- フィールドの差異（decision_deadline / resolved_at）は nullable で許容範囲。
- Ambiguity の解消先も Issue 1本になりシンプルになる。

**結論: Issue として統合**

```
status: draft / reviewing / open / resolved / rejected / cancelled
```

- open    = 未決事項
- resolved = 決定事項

あわせて以下も確定:
- Task の `confirmed` → `todo` に変更
- Ambiguity の解消先: resolved_issue_id / resolved_task_id / resolution_type（discarded）

---

## Step 12: 残課題の確認

### Issue の scheduled ステータス
`scheduled_meeting_id` が設定されているかどうかで動的に判断する。別ステータスは不要。

### Ambiguity の変更履歴
案A（CRUD + AuditLog）で対応。Ambiguity テーブルを UPDATE し、変更は AuditLog で追う。

### AgendaItemSource の source_type
`"open_issue"` → `"issue"` に変更（Decision/OpenIssue の統合に伴う）。

### 論理削除（soft delete）
削除後も参照されるテーブルのみ `deleted_at` を追加。

| テーブル | 判断 | 理由 |
|----------|------|------|
| User | 必要 | AuditLog 等から参照される。退職者の履歴保持。 |
| MeetingSeries | 必要 | 廃止後も過去の会議履歴を残す。 |
| Task / Issue / Ambiguity | 不要 | rejected / cancelled ステータスで表現できる。 |
| Meeting | 不要 | cancelled ステータスで表現できる。 |
| 中間テーブル・ログ系 | 不要 | 物理削除または追記のみ。 |

---

## カラム設計

`tmp/db-columns.md` 参照。
