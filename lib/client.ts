const PID_PREFIX = "qroom:pid:";
const NAME_PREFIX = "qroom:name:";

export function getClientId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem("qroom:client");
  if (!id) {
    id = window.crypto.randomUUID();
    window.localStorage.setItem("qroom:client", id);
  }
  return id;
}

export function getPid(code: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(`${PID_PREFIX}${code}`);
}

export function setPid(code: string, pid: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${PID_PREFIX}${code}`, pid);
}

export function clearPid(code: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`${PID_PREFIX}${code}`);
}

export function getStoredName(code: string): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(`${NAME_PREFIX}${code}`) ?? "";
}

export function setStoredName(code: string, name: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${NAME_PREFIX}${code}`, name);
}