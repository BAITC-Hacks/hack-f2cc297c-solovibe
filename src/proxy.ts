import createMiddleware from "next-intl/middleware";
import { NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const localize = createMiddleware(routing);
export default function proxy(request: NextRequest) {
  // A fresh visitor starts in Russian; an explicit choice persists through the locale cookie.
  const headers = new Headers(request.headers);
  headers.set("accept-language", "ru");
  return localize(new NextRequest(request, { headers }));
}
export const config = { matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"] };
