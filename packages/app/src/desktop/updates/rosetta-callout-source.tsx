// Changed for Groupon Desk (fork of Paseo, Apache-2.0): the Apple Silicon download is Groupon Desk's disk image, never Paseo's release.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SidebarCalloutDescriptionText } from "@/components/sidebar-callout";
import { getIsElectronMac } from "@/constants/platform";
import { useSidebarCallouts } from "@/contexts/sidebar-callout-context";
import { getDesktopRuntimeInfo, type DesktopRuntimeInfo } from "@/desktop/updates/desktop-updates";
import { GROUPON_DESK_DOWNLOAD_URL } from "@/groupon/environments";
import { useStableEvent } from "@/hooks/use-stable-event";
import { openExternalUrl } from "@/utils/open-external-url";

function RosettaCalloutDescription({ t }: { t: ReturnType<typeof useTranslation>["t"] }) {
  return (
    <>
      <SidebarCalloutDescriptionText>
        {t("desktop.rosetta.runningIntel")}
      </SidebarCalloutDescriptionText>
      <SidebarCalloutDescriptionText>{t("desktop.rosetta.highCpu")}</SidebarCalloutDescriptionText>
    </>
  );
}

export function RosettaCalloutSource() {
  const { t } = useTranslation();
  const callouts = useSidebarCallouts();
  const [runtimeInfo, setRuntimeInfo] = useState<DesktopRuntimeInfo | null>(null);
  const isElectronMac = getIsElectronMac();

  const openDownload = useStableEvent(() => {
    void openExternalUrl(GROUPON_DESK_DOWNLOAD_URL);
  });

  useEffect(() => {
    if (!isElectronMac) {
      return;
    }

    let cancelled = false;

    void getDesktopRuntimeInfo()
      .then((nextRuntimeInfo) => {
        if (!cancelled) {
          setRuntimeInfo(nextRuntimeInfo);
        }
        return nextRuntimeInfo;
      })
      .catch((error) => {
        console.warn("[RosettaCallout] Failed to load desktop runtime info", error);
      });

    return () => {
      cancelled = true;
    };
  }, [isElectronMac]);

  useEffect(() => {
    if (!isElectronMac || runtimeInfo?.runningUnderARM64Translation !== true) {
      return;
    }

    return callouts.show({
      id: "desktop-rosetta-warning",
      priority: 300,
      title: t("desktop.rosetta.title"),
      description: <RosettaCalloutDescription t={t} />,
      variant: "error",
      dismissible: false,
      actions: [
        {
          label: t("desktop.rosetta.download"),
          onPress: openDownload,
          variant: "primary",
        },
      ],
      testID: "rosetta-callout",
    });
  }, [callouts, isElectronMac, openDownload, runtimeInfo, t]);

  return null;
}
