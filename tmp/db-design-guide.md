# データテーブル設計の手順

## Step 1: 登場人物（エンティティ）を洗い出す

要件書の「扱う情報」「出力情報」からリソース名を列挙します。

> 例: Meeting, Task, Decision, OpenIssue, Ambiguity, Agenda, Member...

**コツ:** 名詞を拾う。「会議ログ」「タスク一覧」「曖昧箇所」など。

---

## Step 2: リソース系 vs イベント系を分ける

| 種類 | 説明 | 例 |
|------|------|-----|
| **リソース系** | 「今の状態」を持つもの。更新される | Meeting, Task, Decision |
| **イベント系** | 「起きたこと」の記録。追記のみ、削除しない | AuditLog, ReviewLog, ReadLog |

**なぜ分けるか:** リソースは上書き更新、イベントは追記だけ。混ぜると「なぜこうなったか」が追えなくなります。

Decision Loop では要件 §15.1 に「差分とログを保持する」とあるので、イベント系が重要です。

---

## Step 3: 状態遷移を書く

状態を持つリソース（主に Task と Ambiguity）は、取りうる状態とその遷移を図にします。

**Task の例:**
```
[pending] → [in_progress] → [done]
               ↓
           [overdue]
```

**Ambiguity（曖昧箇所）の例:**
```
[extracted] → [under_review] → [confirmed]
                                    ↓
                               [rejected]
```

**コツ:** 状態遷移を先に書くと、カラムに何が必要かが自然に決まります。例えば `confirmed_at` `confirmed_by` `rejected_reason` など。

---

## Step 4: 関係性（リレーション）を整理する

「誰が誰を持つか」を整理します。

```
Meeting 1 ──< Agenda
Meeting 1 ──< Decision
Meeting 1 ──< OpenIssue
Meeting 1 ──< Ambiguity
Meeting 1 ──< Task
Task 1 ──< ReviewLog  (誰がどう修正したか)
Task N ──< Member N   (担当者)
```

**コツ:** `1対多` か `多対多` かを区別する。多対多は中間テーブルが必要です（例: `task_assignees`）。

---

## Step 5: 時間軸を意識する

定例会議は「前回→今回→次回」の継続性が命です。

- `Meeting` に `series_id`（同じ定例シリーズの識別子）を持たせる
- `Task` に `created_at_meeting_id` と `closed_at_meeting_id` を持たせる
- `Agenda` が「前回の持ち越しか、今回の新規か」を区別できるようにする

---

## Step 6: AI提案と人間確定の差分を保持する

要件 §10.3 「AI提案と最終確定の差分を残す」は設計に直結します。

```
Ambiguity テーブル
- ai_proposed_owner    (AIが提案した担当者)
- confirmed_owner      (人間が確定した担当者)
- ai_proposed_deadline
- confirmed_deadline
- reviewed_by
- reviewed_at
```

これを Review テーブルとして独立させるか、Ambiguity に埋め込むかは規模次第です。

---

## この要件のテーブル候補まとめ

```
リソース系:
  MeetingSeries  (定例の「シリーズ」単位)
  Meeting        (1回の会議)
  Agenda         (議題)
  Decision       (決定事項)
  OpenIssue      (未決事項)
  Task           (タスク)
  Ambiguity      (曖昧箇所)
  Member         (メンバー)

イベント系:
  AuditLog       (AI提案→人間確定の差分記録)
  ReadLog        (タスク既読状況)
```

---

## 初心者が陥りやすいポイント

1. **状態を boolean で持つ** → `is_done: bool` より `status: enum` の方が拡張しやすい
2. **削除する** → 論理削除（`deleted_at`）にして履歴を残す
3. **AI提案を上書きする** → 元の提案を消さず、確定値を別カラムに持つ
4. **Meeting に全部詰め込む** → 1テーブルが肥大化するので、概念ごとに分ける
