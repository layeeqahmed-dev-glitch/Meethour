import React, { useState } from "react";
import { Tile, Tabs, Tab, Text, hubspot } from "@hubspot/ui-extensions";

hubspot.extend(() => <Dashboard />);

const Dashboard = () => {
  const [selected, setSelected] = useState("my-meetings");

  return (
    <Tile>
      <Tabs selected={selected} onSelectedChange={setSelected}>
        <Tab tabId="my-meetings" title="My Meetings">
          <Text>My Meetings — coming soon</Text>
        </Tab>
        <Tab tabId="my-recordings" title="My Recordings">
          <Text>My Recordings — coming soon</Text>
        </Tab>
        <Tab tabId="all-meetings" title="Show All Meetings">
          <Text>Show All Meetings — coming soon</Text>
        </Tab>
        <Tab tabId="setup" title="Setup">
          <Text>Setup — coming soon</Text>
        </Tab>
      </Tabs>
    </Tile>
  );
};

export default Dashboard;