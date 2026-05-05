import { atom } from "jotai";

const ID_TOKEN_KEY = "id_token";

export interface AuthState {
  isAuthenticated: boolean;
  idToken: string | null;
  user: {
    sub: string;
    email: string;
    name: string;
  } | null;
}

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ID_TOKEN_KEY);
}

function setStoredToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem(ID_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(ID_TOKEN_KEY);
  }
}

// JWT のペイロードは Base64URL（RFC 7515）でエンコードされており、
// 標準 Base64 とは `-`/`_` および省略パディングの扱いが異なる。
// また `atob` の戻り値はバイナリ文字列なので UTF-8 として再デコードする必要がある。
function decodeBase64UrlJson(part: string): unknown {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function parseToken(token: string): AuthState["user"] {
  try {
    const payload = decodeBase64UrlJson(token.split(".")[1]) as {
      sub: string;
      email: string;
      name: string;
    };
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
    };
  } catch {
    return null;
  }
}

export function getInitialState(): AuthState {
  const token = getStoredToken();
  if (token) {
    const user = parseToken(token);
    return {
      isAuthenticated: !!user,
      idToken: token,
      user,
    };
  }
  return {
    isAuthenticated: false,
    idToken: null,
    user: null,
  };
}

export const authAtom = atom<AuthState>(getInitialState());

export const loginAtom = atom(null, (_get, set, token: string) => {
  setStoredToken(token);
  const user = parseToken(token);
  set(authAtom, {
    isAuthenticated: !!user,
    idToken: token,
    user,
  });
});

export const logoutAtom = atom(null, (_get, set) => {
  setStoredToken(null);
  set(authAtom, {
    isAuthenticated: false,
    idToken: null,
    user: null,
  });
});

export function getIdToken(): string | null {
  return getStoredToken();
}
