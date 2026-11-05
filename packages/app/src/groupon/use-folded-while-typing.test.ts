// @vitest-environment jsdom
// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for folding a block while the composer holds text.

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComposerTextSource } from "@/composer/text-source";
import { FOLD_DELAY_MS, useFoldedWhileTyping } from "./use-folded-while-typing";

function textSource(initial: string): ComposerTextSource & { set: (text: string) => void } {
  let text = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => text,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next) => {
      text = next;
      for (const listener of listeners) listener();
    },
  };
}

describe("useFoldedWhileTyping", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("folds only after the delay", () => {
    const source = textSource("");
    const { result } = renderHook(() => useFoldedWhileTyping(source));
    act(() => source.set("h"));
    act(() => {
      vi.advanceTimersByTime(FOLD_DELAY_MS - 1);
    });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });

  it("does not restart the delay on every key", () => {
    const source = textSource("");
    const { result } = renderHook(() => useFoldedWhileTyping(source));
    act(() => source.set("h"));
    act(() => {
      vi.advanceTimersByTime(FOLD_DELAY_MS - 1);
    });
    act(() => source.set("he"));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });

  it("opens at once when the text is gone, and stays open if it went within the delay", () => {
    const source = textSource("");
    const { result } = renderHook(() => useFoldedWhileTyping(source));
    act(() => source.set("h"));
    act(() => source.set(""));
    act(() => {
      vi.advanceTimersByTime(FOLD_DELAY_MS);
    });
    expect(result.current).toBe(false);

    act(() => source.set("h"));
    act(() => {
      vi.advanceTimersByTime(FOLD_DELAY_MS);
    });
    expect(result.current).toBe(true);
    act(() => source.set(""));
    expect(result.current).toBe(false);
  });

  it("starts folded on a draft that already holds text, and ignores blanks", () => {
    expect(renderHook(() => useFoldedWhileTyping(textSource("draft"))).result.current).toBe(true);
    const blank = textSource("");
    const { result } = renderHook(() => useFoldedWhileTyping(blank));
    act(() => blank.set(" \n"));
    act(() => {
      vi.advanceTimersByTime(FOLD_DELAY_MS);
    });
    expect(result.current).toBe(false);
  });
});
