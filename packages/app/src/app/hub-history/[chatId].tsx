// Added for Groupon Desk (fork of Paseo, Apache-2.0): one chat of the History route.
import { useLocalSearchParams } from "expo-router";
import { HubHistoryChatScreen } from "@/groupon/history-chat-screen";

export default function HubHistoryChatRoute() {
  const params = useLocalSearchParams<{ chatId: string; title?: string; context?: string }>();
  return (
    <HubHistoryChatScreen chatId={params.chatId} title={params.title} context={params.context} />
  );
}
