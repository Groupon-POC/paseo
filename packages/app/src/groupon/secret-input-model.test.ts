// Added for Groupon Desk (fork of Paseo, Apache-2.0): the eye on a passphrase field.
import { describe, expect, it, vi } from "vitest";
import {
  SECRET_HIDDEN_BY_DEFAULT,
  secretFieldView,
  secretToggleHandler,
} from "./secret-input-model";

describe("secretFieldView", () => {
  it("is hidden by default: dots, a password input, the eye offering to show", () => {
    expect(SECRET_HIDDEN_BY_DEFAULT).toBe(false);
    expect(secretFieldView(SECRET_HIDDEN_BY_DEFAULT)).toEqual({
      secureTextEntry: true,
      webInputType: "password",
      icon: "eye",
      accessibilityLabel: "Show passphrase",
    });
  });

  it("shows the typed text once the eye is on", () => {
    expect(secretFieldView(true)).toEqual({
      secureTextEntry: false,
      webInputType: "text",
      icon: "eye-off",
      accessibilityLabel: "Hide passphrase",
    });
  });
});

describe("secretToggleHandler", () => {
  function harness() {
    let visible = SECRET_HIDDEN_BY_DEFAULT;
    const setVisible = (update: (current: boolean) => boolean) => {
      visible = update(visible);
    };
    return { toggle: secretToggleHandler(setVisible), visible: () => visible };
  }

  it("flips the visibility on each press", () => {
    const field = harness();
    field.toggle();
    expect(field.visible()).toBe(true);
    field.toggle();
    expect(field.visible()).toBe(false);
  });

  it("never submits: the press stops at the eye", () => {
    const field = harness();
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    field.toggle(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(field.visible()).toBe(true);
  });
});
