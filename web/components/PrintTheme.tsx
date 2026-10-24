"use client";

import { useEffect } from "react";

/** Switches to the light theme while printing, so evidence pages print black on white. */
export default function PrintTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const light = () => root.classList.remove("dark");
    const dark = () => root.classList.add("dark");
    window.addEventListener("beforeprint", light);
    window.addEventListener("afterprint", dark);
    return () => {
      window.removeEventListener("beforeprint", light);
      window.removeEventListener("afterprint", dark);
    };
  }, []);
  return null;
}
