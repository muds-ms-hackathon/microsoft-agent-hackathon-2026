export type OrgRole = "owner" | "admin" | "member";

export type Organization = {
  id: string;
  name: string;
  description: string | null;
  role: OrgRole;
  createdAt: string;
  updatedAt: string;
};

export type Member = {
  userId: string;
  name: string;
  displayName: string;
  email: string;
  role: OrgRole;
  joinedAt: string;
};

export type RecurringMeeting = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  scheduleCron: string;
  // 配下に紐付く個別 Meeting のデフォルト所要時間（分）。個別 Meeting 側で上書き可。
  defaultDurationMinutes: number;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationDetail = {
  id: string;
  name: string;
  description: string | null;
  role: OrgRole;
  createdAt: string;
  updatedAt: string;
  recurringMeetings: RecurringMeeting[];
};
