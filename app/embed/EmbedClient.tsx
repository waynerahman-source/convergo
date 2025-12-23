// app/embed/EmbedClient.tsx
"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import ChatPanel from "./ChatPanel";

export default function EmbedClient() {
  const params = useSearchParams();

  // site is your tenant key (e.g. "mydiarycompanion")
  const site = useMemo(() => {
    const s = params.get("site");
    return (s && s.trim()) || "mydiarycompanion";
  }, [params]);

  // Optional: allow theme/debug flags later
  const debug = useMemo(() => params.get("debug") === "1", [params]);

  return <ChatPanel site={site} debug={debug} />;
}
