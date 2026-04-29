# カラム候補一覧

## User
| カラム | 型 | 制約 |
|--------|-----|------|
| id | uuid | PK |
| external_id | varchar | NOT NULL, UNIQUE（Entra ID のオブジェクトID） |
| provider | varchar | NOT NULL, DEFAULT 'entra' |
| name | varchar | NOT NULL |
| email | varchar | NOT NULL, UNIQUE |
| created_at | timestamp | NOT NULL |
| updated_at | timestamp | NOT NULL |
| deleted_at | timestamp | |

---

## MeetingSeries
| カラム | 型 | 制約 |
|--------|-----|------|
| id | uuid | PK |
| name | varchar | NOT NULL |
| description | text | |
| created_by | uuid | FK → User |
| created_at | timestamp | NOT NULL |
| updated_at | timestamp | NOT NULL |
| deleted_at | timestamp | |

---

## MeetingSeriesMember
| カラム | 型 | 制約 |
|--------|-----|------|
| series_id | uuid | PK, FK → MeetingSeries |
| user_id | uuid | PK, FK → User |

---

## Meeting
| カラム | 型 | 制約 |
|--------|-----|------|
| id | uuid | PK |
| series_id | uuid | NOT NULL, FK → MeetingSeries |
| status | enum | NOT NULL, DEFAULT 'scheduled' |
| held_at | timestamp | NOT NULL |
| transcript_text | text | |
| ai_summary_text | text | |
| created_at | timestamp | NOT NULL |
| updated_at | timestamp | NOT NULL |

status: `scheduled` / `done` / `cancelled`

---

## MeetingAttendee
| カラム | 型 | 制約 |
|--------|-----|------|
| meeting_id | uuid | PK, FK → Meeting |
| user_id | uuid | PK, FK → User |
| status | enum | NOT NULL, DEFAULT 'suggested' |
| suggested_reason | text | |

status: `suggested` / `confirmed` / `declined`

---

## MeetingDocument
| カラム | 型 | 制約 |
|--------|-----|------|
| id | uuid | PK |
| meeting_id | uuid | NOT NULL, FK → Meeting |
| type | varchar | NOT NULL |
| content | text | NOT NULL |
| created_by | enum | NOT NULL |
| created_at | timestamp | NOT NULL |

type: `minutes` / `material` / ...
created_by: `human` / `ai`

---

## TopicRequest
| カラム | 型 | 制約 |
|--------|-----|------|
| id | uuid | PK |
| series_id | uuid | NOT NULL, FK → MeetingSeries |
| requested_by | uuid | NOT NULL, FK → User |
| content | text | NOT NULL |
| created_at | timestamp | NOT NULL |

---

## AgendaItem
| カラム | 型 | 制約 |
|--------|-----|------|
| id | uuid | PK |
| title | varchar | NOT NULL |
| description | text | |
| priority | int | NOT NULL, DEFAULT 0 |
| created_at | timestamp | NOT NULL |
| updated_at | timestamp | NOT NULL |

---

## AgendaItemSource
| カラム | 型 | 制約 |
|--------|-----|------|
| agenda_item_id | uuid | PK, FK → AgendaItem |
| source_type | enum | PK |
| source_id | uuid | PK |

source_type: `open_issue` / `topic_request`

---

## MeetingAgendaItem
| カラム | 型 | 制約 |
|--------|-----|------|
| meeting_id | uuid | PK, FK → Meeting |
| agenda_item_id | uuid | PK, FK → AgendaItem |
| order | int | NOT NULL |

---

## Issue（決定事項・未決事項を統合）
| カラム | 型 | 制約 |
|--------|-----|------|
| id | uuid | PK |
| meeting_id | uuid | NOT NULL, FK → Meeting（発生元） |
| content | text | NOT NULL |
| status | enum | NOT NULL, DEFAULT 'draft' |
| decision_deadline | date | （open 時のみ使用） |
| scheduled_meeting_id | uuid | FK → Meeting（open 時のみ使用） |
| resolved_at | timestamp | （resolved 時のみ使用） |
| resolved_by | uuid | FK → User（resolved 時のみ使用） |
| created_at | timestamp | NOT NULL |
| updated_at | timestamp | NOT NULL |

status: `draft` / `reviewing` / `open` / `resolved` / `rejected` / `cancelled`

---

## Task
| カラム | 型 | 制約 |
|--------|-----|------|
| id | uuid | PK |
| meeting_id | uuid | FK → Meeting（発生元、人間作成時は nullable） |
| content | text | NOT NULL |
| status | enum | NOT NULL, DEFAULT 'draft' |
| due_date | date | |
| created_by | uuid | FK → User |
| created_at | timestamp | NOT NULL |
| updated_at | timestamp | NOT NULL |

status: `draft` / `reviewing` / `todo` / `in_progress` / `done` / `rejected`

---

## TaskAssignee
| カラム | 型 | 制約 |
|--------|-----|------|
| task_id | uuid | PK, FK → Task |
| user_id | uuid | PK, FK → User |
| assigned_at | timestamp | NOT NULL |

---

## Ambiguity
| カラム | 型 | 制約 |
|--------|-----|------|
| id | uuid | PK |
| meeting_id | uuid | NOT NULL, FK → Meeting |
| content | text | NOT NULL |
| status | enum | NOT NULL, DEFAULT 'draft' |
| resolution_type | enum | （resolved 時のみ使用） |
| resolved_issue_id | uuid | FK → Issue（nullable） |
| resolved_task_id | uuid | FK → Task（nullable） |
| created_at | timestamp | NOT NULL |
| updated_at | timestamp | NOT NULL |

status: `draft` / `reviewing` / `resolved` / `rejected`
resolution_type: `issue` / `task` / `discarded`

---

## AuditLog
| カラム | 型 | 制約 |
|--------|-----|------|
| id | uuid | PK |
| target_type | varchar | NOT NULL |
| target_id | uuid | NOT NULL |
| field_name | varchar | NOT NULL |
| before_value | text | |
| after_value | text | |
| change_source | enum | NOT NULL |
| changed_by | uuid | FK → User |
| changed_at | timestamp | NOT NULL |

target_type: `task` / `decision` / `open_issue` / `ambiguity` / ...
change_source: `ai` / `human`

---

## ReadLog
| カラム | 型 | 制約 |
|--------|-----|------|
| task_id | uuid | PK, FK → Task |
| user_id | uuid | PK, FK → User |
| read_at | timestamp | NOT NULL |
