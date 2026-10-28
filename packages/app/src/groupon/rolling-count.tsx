// Added for Groupon Desk (fork of Paseo, Apache-2.0): a count that rolls to its new value; on a phone it simply changes.
import type { ReactElement } from "react";
import { Text } from "react-native";

/** The web build rolls the digits that changed (`rolling-count.web.tsx`); a phone shows the text. */
export function RollingCount({ text }: { text: string }): ReactElement {
  return <Text>{text}</Text>;
}
