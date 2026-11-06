// Added for Groupon Desk (fork of Paseo, Apache-2.0): loads the repo's override for the status
// mode's parsing rules. The file is ordinary repo content, so a bot that rewords its comments is
// fixed by committing a JSON edit — every Desk picks it up on pull, no app release.
import { useEffect, useState } from "react";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { DEFAULT_PR_STATUS_RULES, mergePrStatusRules, type PrStatusRules } from "./status-rules";

export const PR_ACTIVITY_RULES_PATH = ".desk/pr-activity-rules.json";

/** The repo's rules override laid over the defaults; the defaults while it loads or is absent. */
export function usePrStatusRules(client: DaemonClient | null, cwd: string): PrStatusRules {
  const [rules, setRules] = useState<PrStatusRules>(DEFAULT_PR_STATUS_RULES);

  useEffect(() => {
    if (!client) {
      return;
    }
    let cancelled = false;
    setRules(DEFAULT_PR_STATUS_RULES);
    void (async () => {
      try {
        const read = await client.readFile(cwd, PR_ACTIVITY_RULES_PATH);
        if (cancelled) {
          return;
        }
        const parsed: unknown = JSON.parse(new TextDecoder().decode(read.bytes));
        setRules(mergePrStatusRules(parsed));
      } catch {
        // Absent or unreadable file: the defaults stand.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, cwd]);

  return rules;
}
