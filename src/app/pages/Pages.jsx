import React, { useState, useEffect } from "react";
import {
  Tile,
  Tabs,
  Tab,
  Text,
  Link,
  LoadingSpinner,
  hubspot,
} from "@hubspot/ui-extensions";

hubspot.extend(() => <Dashboard />);

const Dashboard = () => {
  const [selected, setSelected] = useState("my-meetings");
  const [meetingType, setMeetingType] = useState("upcoming");
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selected !== "my-meetings") return;

    setLoading(true);
    hubspot
      .fetch(
        `https://meethourhubs.vercel.app/api/meethour-meetings?portalId=${hubspot.context.portalId}&type=${meetingType}`,
      )
      .then((res) => res.json())
      .then((data) => {
        setMeetings(data.meetings || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selected, meetingType]);

  return (
    <Tile>
      <Tabs selected={selected} onSelectedChange={setSelected}>
        <Tab tabId="my-meetings" title="My Meetings">
          <Tabs selected={meetingType} onSelectedChange={setMeetingType}>
            <Tab tabId="upcoming" title="Upcoming">
              <MeetingsList meetings={meetings} loading={loading} />
            </Tab>
            <Tab tabId="completed" title="Completed">
              <MeetingsList meetings={meetings} loading={loading} />
            </Tab>
          </Tabs>
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

const MeetingsList = ({ meetings, loading }) => {
  if (loading) return <LoadingSpinner label="Loading meetings..." />;
  if (!meetings.length) return <Text>No meetings found.</Text>;

  return (
    <>
      {meetings.map((m) => (
        <Tile key={m.id} compact>
          <Text format={{ fontWeight: "bold" }}>{m.topic}</Text>
          <Text>
            {m.startTime} ({m.timezone})
          </Text>
          <Link href={m.joinURL}>Join Meeting</Link>
        </Tile>
      ))}
    </>
  );
};

export default Dashboard;