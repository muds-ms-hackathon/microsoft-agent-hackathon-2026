export interface FakeUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  displayName: string;
  roles: string[];
}

export const users: Record<string, FakeUser> = {
  admin: {
    id: "1",
    email: "admin@example.com",
    emailVerified: true,
    name: "admin",
    displayName: "Admin User (管理者)",
    roles: ["admin"],
  },
  user: {
    id: "2",
    email: "user@example.com",
    emailVerified: true,
    name: "user",
    displayName: "Regular User (一般ユーザー)",
    roles: ["member"],
  },
  guest: {
    id: "3",
    email: "guest@example.com",
    emailVerified: true,
    name: "guest",
    displayName: "Guest User (ゲスト)",
    roles: ["guest"],
  },
};

let nextId = Object.keys(users).length + 1;

export function getUserByKey(key: string): FakeUser | undefined {
  return users[key];
}

export function getAllUsers(): [string, FakeUser][] {
  return Object.entries(users);
}

export interface CreateUserInput {
  email: string;
  name: string;
  displayName?: string;
  roles?: string[];
}

export function createUser(input: CreateUserInput): {
  key: string;
  user: FakeUser;
} {
  const existing = Object.values(users).find((u) => u.email === input.email);
  if (existing) {
    throw new Error(`メールアドレス ${input.email} は既に登録されています`);
  }

  const id = String(nextId++);
  const key = input.name.toLowerCase().replace(/\s+/g, "-");

  if (users[key]) {
    throw new Error(`ユーザーキー ${key} は既に存在します`);
  }

  const user: FakeUser = {
    id,
    email: input.email,
    emailVerified: true,
    name: input.name,
    displayName: input.displayName ?? input.name,
    roles: input.roles ?? ["member"],
  };

  users[key] = user;
  return { key, user };
}
