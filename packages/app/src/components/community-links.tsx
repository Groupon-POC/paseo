// Changed for Groupon Desk (fork of Paseo, Apache-2.0): Paseo's Star, Sponsor and Community links draw nothing here (the owner's word, 2026-10-20); the two call sites stay as upstream has them.
import { useCallback } from "react";

const GROUPON_DESK_HIDES_COMMUNITY_LINKS = true;
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Heart } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { GitHubIcon } from "@/components/icons/github-icon";
import { DiscordIcon } from "@/components/icons/discord-icon";
import { openExternalUrl } from "@/utils/open-external-url";

const renderGitHubIcon = (color: string) => <GitHubIcon color={color} size={14} />;
const renderDiscordIcon = (color: string) => <DiscordIcon color={color} size={14} />;

export function CommunityLinks() {
  const handleOpenGitHub = useCallback(() => {
    void openExternalUrl("https://github.com/getpaseo/paseo");
  }, []);

  const handleOpenSponsor = useCallback(() => {
    void openExternalUrl("https://github.com/sponsors/boudra");
  }, []);

  const handleOpenDiscord = useCallback(() => {
    void openExternalUrl("https://discord.gg/jz8T2uahpH");
  }, []);

  // Groupon Desk is not Paseo's product page: no star, sponsor or community links.
  if (GROUPON_DESK_HIDES_COMMUNITY_LINKS) return null;

  return (
    <View style={styles.row}>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={renderGitHubIcon}
        onPress={handleOpenGitHub}
        testID="community-links-github-star"
      >
        Star
      </Button>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={Heart}
        onPress={handleOpenSponsor}
        testID="community-links-sponsor"
      >
        Sponsor
      </Button>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={renderDiscordIcon}
        onPress={handleOpenDiscord}
        testID="community-links-discord"
      >
        Community
      </Button>
    </View>
  );
}

const styles = StyleSheet.create(() => ({
  row: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 0,
  },
}));
