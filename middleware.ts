import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/session";
import { HOME, SCREENS, Role } from "@/lib/permissions";

// EVERYONE signs in — office staff and field staff alike. This runs before every page and
// every API call: no valid login cookie means the page redirects to /login and the API
// answers 401. (Who may do WHAT is still decided per route, in lib/permissions.ts.)
//
// Only these stay open: the login page and the login/logout calls themselves, plus the
// static files the browser needs before anyone has signed in (see `matcher` below).

const OPEN_PAGES = ["/login"];
const OPEN_API = ["/api/auth/login", "/api/auth/logout", "/api/auth/student"]; // student = group code + name sign-in
const OFFICE_PAGES = ["/admin", "/manager", "/coordinator", "/ops"];

// Students (joined with a group code) and suppliers (warehouse) are not office or field staff. They may
// use ONLY their own screen and the ordering APIs below; every other page / API is closed to them here,
// before any route runs. (Each ordering route still checks the role and the group itself.)
const LIMITED_ROLES = ["student", "supplier"];
const LIMITED_API = ["/api/auth/", "/api/products", "/api/dietary", "/api/ordering", "/api/requests", "/api/orders", "/api/groups", "/api/events"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // Already signed in? Don't show the login page again (e.g. after pressing Back): go to "/",
  // which sends each person to their own screen. Logout clears the cookie first, so it still works.
  if (pathname === "/login") {
    const existing = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
    if (existing) return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }
  if (OPEN_PAGES.includes(pathname) || OPEN_API.includes(pathname)) return NextResponse.next();

  // Self sign-up and the quick-login page are gone: accounts are created by the Super Admin.
  if (pathname === "/onboarding" || pathname === "/dev-login") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    if (isApi) return NextResponse.json({ error: "sign in required" }, { status: 401 });
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (LIMITED_ROLES.includes(session.role)) {
    const home = HOME[session.role];
    if (isApi) {
      // PATCH /api/workers/:id is only used to change your own language; that route refuses anything else.
      const ownLanguage = req.method === "PATCH" && pathname.startsWith("/api/workers/");
      if (!ownLanguage && !LIMITED_API.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : p + "/"))) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    } else if (pathname !== home && !pathname.startsWith(home + "/")) {
      return NextResponse.redirect(new URL(home, req.url));
    }
    return NextResponse.next();
  }

  // The new ordering screens: only the roles listed in SCREENS (lib/permissions.ts) may open them.
  if (!isApi) {
    const screen = Object.keys(SCREENS).find((p) => ["/group-orders", "/catalogue", "/student", "/supplier"].includes(p) && (pathname === p || pathname.startsWith(p + "/")));
    if (screen && !SCREENS[screen].includes(session.role as Role)) return NextResponse.redirect(new URL(HOME[session.role] ?? "/", req.url));
  }

  // Cleaners and maintenance staff have no business on the office screens.
  if (!isApi && session.role === "worker" && [...OFFICE_PAGES, "/group-orders", "/catalogue", "/student", "/supplier"].some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|logo.png|manifest.json|sw.js).*)"],
};
