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

export function parseToken(token: string): AuthState["user"] {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
    };
  } catch {
    return null;
  }
}

function getInitialState(): AuthState {
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
