// Added for Groupon Desk (fork of Paseo, Apache-2.0): a prompt typed in the window names the signed-in person.
import { afterEach, describe, expect, it } from "vitest";
import { dispatchComposerAgentMessage, type ComposerSendClient } from "@/composer/actions";
import type { UserMessageItem } from "@/types/stream";
import { setMessageAuthorSource } from "./message-author-source";

const olga = { userId: "u-olga", name: "Olga Owner", device: "Mac app" };

function send(): Promise<{
  options: Parameters<ComposerSendClient["sendAgentMessage"]>[2];
  optimistic: UserMessageItem;
}> {
  let options: Parameters<ComposerSendClient["sendAgentMessage"]>[2] | null = null;
  let optimistic: UserMessageItem | null = null;
  return dispatchComposerAgentMessage({
    client: {
      sendAgentMessage: async (_agentId, _text, sent) => {
        options = sent;
      },
      uploadFile: async () => ({ requestId: "r", file: null, error: null }),
    },
    agentId: "agent",
    text: "check the rounding",
    attachments: [],
    encodeImages: async () => [],
    submission: {
      begin: (_agentId, message) => {
        optimistic = message;
      },
      accept: () => undefined,
      reject: () => "rejected",
    },
  }).then(() => {
    if (!options || !optimistic) throw new Error("nothing was sent");
    return { options, optimistic };
  });
}

describe("the composer's author", () => {
  afterEach(() => setMessageAuthorSource(() => undefined));

  it("sends the signed-in person as the prompt's author and draws the optimistic row as theirs", async () => {
    setMessageAuthorSource(() => olga);
    const { options, optimistic } = await send();
    expect(options.author).toEqual(olga);
    expect(optimistic.author).toEqual(olga);
  });

  it("sends no author when nobody is signed in, as before", async () => {
    const { options, optimistic } = await send();
    expect("author" in options).toBe(false);
    expect(optimistic.author).toBeUndefined();
  });
});
