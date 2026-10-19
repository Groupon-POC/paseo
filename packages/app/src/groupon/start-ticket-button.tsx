// Added for Groupon Desk (fork of Paseo, Apache-2.0): the New workspace page's Start a ticket button.

import { Ticket } from "lucide-react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { GROUPON_TICKET } from "./strings";

/** Beside Import session, in the same shape: a ghost button in the header on compact layouts, a pill under the composer otherwise. */
export function StartTicketButton({ compact, onPress }: { compact: boolean; onPress: () => void }) {
  return (
    <View style={compact ? null : styles.wide}>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={Ticket}
        onPress={onPress}
        style={compact ? null : styles.pill}
        testID="new-workspace-start-ticket"
      >
        {GROUPON_TICKET.button}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wide: {
    alignItems: "flex-start",
  },
  pill: {
    borderRadius: theme.borderRadius.full,
    borderColor: theme.colors.borderAccent,
  },
}));
