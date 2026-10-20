// Changed for Groupon Desk (fork of Paseo, Apache-2.0): expectations follow messages that name no engine or name Groupon Desk.
import { test } from "../support/fixtures";
import { installHostClientsScenario, readHost } from "../support/helpers/plugin-hosts";

test("plugin discovers offline hosts and borrows another host without installing there", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const hosts = await installHostClientsScenario(page);
  try {
    await hosts.expectOnline();
    await readHost(page, "selected", "selected:plugins=true");
    await readHost(page, "Secondary", `${hosts.serverId}:plugins=false`);
    await hosts.disposeSecondaryAndExpectObservationReleased();
    await readHost(page, "Secondary", `${hosts.serverId}:plugins=false`);
    await readHost(page, "missing", "Unknown host: missing");
    await hosts.reloadAndExpectObservationReleased();
    await readHost(page, "Secondary", `${hosts.serverId}:plugins=false`);
    await page.screenshot({ path: test.info().outputPath("two-hosts.png") });
    await hosts.restartSecondary();
    await hosts.expectOnline();
    await readHost(page, "Secondary", `${hosts.serverId}:plugins=false`);
    await hosts.useCompactLayout();
    await readHost(page, "Secondary", `${hosts.serverId}:plugins=false`);
    await page.screenshot({ path: test.info().outputPath("two-hosts-compact.png") });
    await hosts.disconnectSecondary();
    await readHost(page, "Secondary", `Host is disconnected: ${hosts.serverId}`);
    await readHost(page, "selected", "selected:plugins=true");
  } finally {
    await hosts.close();
  }
});
