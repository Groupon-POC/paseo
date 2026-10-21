// Added for Groupon Desk (fork of Paseo, Apache-2.0): a passphrase field with the eye that shows it.

/**
 * The one field the Groupon screens use for a secret (the vault passphrase): dots by default, an
 * eye at the right edge that shows the typed text and hides it again (`secret-input-model.ts`).
 *
 * Constraints:
 * - The eye never submits: Enter in the field does (`onSubmitEditing`), the eye only flips.
 * - The text stays in the input when the eye flips; nothing here keeps or logs it.
 */

import { Eye, EyeOff } from "lucide-react-native";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { EditingTextInput } from "@/components/ui/text-input";
import type { Theme } from "@/styles/theme";
import {
  SECRET_HIDDEN_BY_DEFAULT,
  secretFieldView,
  secretToggleHandler,
} from "./secret-input-model";

const ThemedEye = withUnistyles(Eye);
const ThemedEyeOff = withUnistyles(EyeOff);
const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

interface SecretInputProps {
  onChangeText: (text: string) => void;
  onSubmitEditing?: () => void;
  placeholder?: string;
  editable?: boolean;
  /** `<testID>` on the input, `<testID>-visibility` on the eye. */
  testID: string;
}

export function SecretInput({
  onChangeText,
  onSubmitEditing,
  placeholder,
  editable,
  testID,
}: SecretInputProps) {
  const [visible, setVisible] = useState(SECRET_HIDDEN_BY_DEFAULT);
  const view = secretFieldView(visible);
  const handleToggle = useMemo(() => secretToggleHandler(setVisible), []);
  const Icon = view.icon === "eye" ? ThemedEye : ThemedEyeOff;
  return (
    <View style={styles.row}>
      <EditingTextInput
        initialValue=""
        onChangeText={onChangeText}
        secureTextEntry={view.secureTextEntry}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={placeholder}
        onSubmitEditing={onSubmitEditing}
        editable={editable}
        style={styles.input}
        testID={testID}
      />
      <ToolbarButton
        label={view.accessibilityLabel}
        onPress={handleToggle}
        style={styles.eye}
        testID={`${testID}-visibility`}
      >
        <Icon size={18} uniProps={mutedMapping} />
      </ToolbarButton>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  eye: {
    marginRight: theme.spacing[1],
  },
}));
