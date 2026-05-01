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

export function getUserByKey(key: string): FakeUser | undefined {
  return users[key];
}

export function getAllUsers(): [string, FakeUser][] {
  return Object.entries(users);
}
