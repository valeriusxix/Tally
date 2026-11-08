import {
  appBasePath,
  appPathFromLocalRoute,
} from "@agent-native/core/client/api-path";
import { useAgentRouteState } from "@agent-native/core/client/navigation";

import {
  chatThreadPath,
  HOME_PATH,
  isChatPathname,
  NEW_CHAT_PATH,
  threadIdFromPath,
} from "@/lib/chat-paths";
import { TAB_ID } from "@/lib/tab-id";

export interface NavigationState {
  view?: string;
  path?: string;
  publicPath?: string;
  threadId?: string;
  /** Open contact on /people/:id — "remind him" means this one. */
  contactId?: string | null;
  /** Focused entry (?entry=) — "fix this" means this one. */
  entryId?: string | null;
  /** Open item on /stock/:id. */
  itemId?: string | null;
  /** Period shown on /recap (local dates). */
  period?: { from: string; to: string };
  /** Day shown on /today (local date), when not today. */
  date?: string;
}

export function useNavigationState() {
  useAgentRouteState<NavigationState>({
    browserTabId: TAB_ID,
    requestSource: TAB_ID,
    getNavigationState: ({ pathname, searchParams }) =>
      navigationStateForPath(pathname, searchParams),
    getCommandPath: commandPathForNavigation,
  });
}

export function commandPathForNavigation(command: NavigationState): string {
  const fallbackPath = pathForCommand(command);
  const path = typeof command?.path === "string" ? command.path : "";
  if (!path) return fallbackPath;

  const basePath = appBasePath();
  if (!basePath) return path;

  const suffixIndex = path.search(/[?#]/);
  const pathname = suffixIndex === -1 ? path : path.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : path.slice(suffixIndex);
  const publicPath =
    typeof command?.publicPath === "string" ? command.publicPath : "";
  const publicPathSuffixIndex = publicPath.search(/[?#]/);
  const declaredPublicPath =
    publicPathSuffixIndex === -1
      ? publicPath
      : publicPath.slice(0, publicPathSuffixIndex);
  const publicViewPath = appPathFromLocalRoute(pathForView(command?.view));
  if (
    matchesPathPrefix(pathname, basePath) &&
    (matchesPathPrefix(pathname, publicViewPath) ||
      (declaredPublicPath && declaredPublicPath === pathname))
  ) {
    return `${pathname.slice(basePath.length) || "/"}${suffix}`;
  }
  return path;
}

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function decodedSegment(pathname: string, prefix: string): string | null {
  const match = new RegExp(`^${prefix}/([^/]+)`).exec(pathname);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function navigationStateForPath(
  pathname: string,
  searchParams?: URLSearchParams,
): NavigationState {
  const threadId = threadIdFromPath(pathname);
  const view = viewForPath(pathname);
  const state: NavigationState = {
    view,
    path: pathname,
    publicPath: appPathFromLocalRoute(pathname),
    ...(threadId ? { threadId } : {}),
  };
  if (TALLY_VIEWS.has(view)) {
    state.contactId = decodedSegment(pathname, "/people");
    state.itemId = decodedSegment(pathname, "/stock");
    state.entryId = searchParams?.get("entry") ?? null;
    const date = searchParams?.get("date");
    if (view === "today" && date) state.date = date;
    if (view === "recap") {
      const from = searchParams?.get("from");
      const to = searchParams?.get("to");
      if (from && to) state.period = { from, to };
    }
  }
  return state;
}

const TALLY_VIEWS = new Set([
  "today",
  "needs-you",
  "people",
  "stock",
  "recap",
  "settings",
]);

function viewForPath(pathname: string): string {
  if (pathname === "/today" || pathname === "/") return "today";
  if (pathname.startsWith("/needs-you")) return "needs-you";
  if (pathname.startsWith("/people")) return "people";
  if (pathname.startsWith("/stock")) return "stock";
  if (pathname.startsWith("/recap")) return "recap";
  // Tally's business settings. The framework's own settings pages are
  // "app-settings" so "settings" keeps meaning the business profile.
  if (pathname.startsWith("/profile")) return "settings";
  if (isChatPathname(pathname)) return "chat";
  if (pathname === HOME_PATH) return "home";
  if (pathname.startsWith("/database")) return "database";
  if (pathname.startsWith("/extensions")) return "extensions";
  if (pathname.startsWith("/observability")) return "observability";
  if (pathname.startsWith("/settings/agent") || pathname.startsWith("/agent")) {
    return "agent";
  }
  if (pathname.startsWith("/settings")) return "app-settings";
  if (pathname.startsWith("/team")) return "app-settings";
  return "chat";
}

function pathForView(view?: string): string {
  switch (view) {
    case "today":
      return "/today";
    case "needs-you":
      return "/needs-you";
    case "people":
      return "/people";
    case "stock":
      return "/stock";
    case "recap":
      return "/recap";
    case "chat":
    case "ask":
      return NEW_CHAT_PATH;
    case "home":
      return HOME_PATH;
    case "database":
      return "/database";
    case "extensions":
      return "/extensions";
    case "observability":
      return "/observability";
    case "agent":
      return "/settings/agent";
    case "settings":
      return "/profile";
    case "app-settings":
      return "/settings";
    case "team":
      return "/settings/organization";
    default:
      return "/today";
  }
}

export function pathForCommand(command: any): string {
  const path = pathForView(command?.view);
  if (command?.view !== "chat" && command?.view !== "ask") return path;
  const threadId =
    typeof command?.threadId === "string" ? command.threadId.trim() : "";
  return threadId ? chatThreadPath(threadId) : path;
}
