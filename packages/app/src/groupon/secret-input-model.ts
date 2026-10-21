// Added for Groupon Desk (fork of Paseo, Apache-2.0): the eye on a passphrase field, without the screen.

/**
 * A secret field shows dots until the person taps the eye at its right edge, and then the typed
 * text (the owner's word of 2026-10-21: every field where the vault secret is typed has the eye).
 * Hidden by default; the eye flips that and nothing else, so it never submits the form.
 */

import { GROUPON_SECRET_INPUT } from "./strings";

export interface SecretFieldView {
  /** React Native's prop; on the web it renders the input as `type="password"` or `type="text"`. */
  secureTextEntry: boolean;
  /** The input's type on the web, which follows `secureTextEntry`. */
  webInputType: "password" | "text";
  /** The eye's icon: "eye" while hidden (tap to show), "eye-off" while shown (tap to hide). */
  icon: "eye" | "eye-off";
  accessibilityLabel: string;
}

export const SECRET_HIDDEN_BY_DEFAULT = false;

export function secretFieldView(visible: boolean): SecretFieldView {
  return {
    secureTextEntry: !visible,
    webInputType: visible ? "text" : "password",
    icon: visible ? "eye-off" : "eye",
    accessibilityLabel: visible ? GROUPON_SECRET_INPUT.hide : GROUPON_SECRET_INPUT.show,
  };
}

/** The bits of a press event the toggle uses; a web click carries both, a native press neither. */
export interface TogglePressEvent {
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

/**
 * The eye's press handler: flips the visibility and stops the press there, so no form or parent
 * handler above it sees a submit.
 */
export function secretToggleHandler(
  setVisible: (update: (visible: boolean) => boolean) => void,
): (event?: TogglePressEvent) => void {
  return (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setVisible((visible) => !visible);
  };
}
