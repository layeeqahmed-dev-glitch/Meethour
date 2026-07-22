import React, { useState, useEffect } from "react";
import {
  Tile,
  Tabs,
  Tab,
  Text,
  Link,
  Flex,
  Button,
  ButtonRow,
  LoadingSpinner,
  hubspot,
} from "@hubspot/ui-extensions";

hubspot.extend(({ context }) => <Dashboard context={context} />);

const Dashboard = ({ context }) => {
  const [selected, setSelected] = useState("my-meetings");
  const [meetingType, setMeetingType] = useState("upcoming");
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selected !== "my-meetings") return;

    let cancelled = false;
    setLoading(true);

    hubspot
      .fetch(
        `https://meethourhubs.vercel.app/api/meethour-meetings?portalId=${context.portal.id}&type=${meetingType}`,
      )
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setMeetings(data.meetings || data.responseBody?.meetings || []);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected, meetingType]);

  return (
    <Tile>
      <Tabs selected={selected} onSelectedChange={setSelected}>
        <Tab tabId="my-meetings" title="My Meetings">
          <ButtonRow>
            <Button
              variant={meetingType === "upcoming" ? "primary" : "secondary"}
              onClick={() => setMeetingType("upcoming")}
            >
              Upcoming
            </Button>
            <Button
              variant={meetingType === "completed" ? "primary" : "secondary"}
              onClick={() => setMeetingType("completed")}
            >
              Completed
            </Button>
          </ButtonRow>
          <Text>
            DEBUG: loading={String(loading)}, meetings.length={meetings.length}
          </Text>
          <MeetingsList meetings={meetings} loading={loading} />
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
        <Flex key={m.id} direction="column" gap="xs">
          <Text variant="microcopy">{m.topic}</Text>
          <Text>
            {m.startTime} ({m.timezone})
          </Text>
          <Link href={m.joinURL}>Join Meeting</Link>
        </Flex>
      ))}
    </>
  );
};

export default Dashboard;