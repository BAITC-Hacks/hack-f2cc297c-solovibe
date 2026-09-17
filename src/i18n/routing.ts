import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ru", "kk", "en"],
  defaultLocale: "ru",
  localePrefix: "always",
  localeDetection: true,
});
