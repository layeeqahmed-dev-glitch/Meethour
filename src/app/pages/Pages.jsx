import React, { useState, useEffect } from "react";
import {
  Tile,
  Tabs,
  Tab,
  Text,
  Link,
  Button,
  ButtonRow,
  Flex,
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
        `https://meethourhubs.vercel.app/api/meethour-meetings?portalId=${context.portal.id}&type=${meetingType}&_t=${Date.now()}`,
      )
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setMeetings(data.meetings || []);
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
          <MeetingsList
            meetings={meetings}
            loading={loading}
            type={meetingType}
          />
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

const MeetingsList = ({ meetings, loading, type }) => {
  if (loading) return <LoadingSpinner label="Loading meetings..." />;
  if (!meetings.length) return <Text>No meetings found.</Text>;

  return (
    <Flex direction="row" wrap="wrap" gap="md">
      {meetings.map((m) => (
        <Tile key={m.id}>
          <Flex direction="column" gap="xs">
            <Text format={{ fontWeight: "bold" }}>{m.topic}</Text>
            <Text variant="microcopy">
              {m.startTime} ({m.timezone})
            </Text>
            <Text variant="microcopy">Duration: {m.duration}</Text>
            {type === "upcoming" ? (
              <Link href={m.joinURL}>Join Meeting</Link>
            ) : (
              <Text variant="microcopy">
                Attended: {m.totalAttended || 0}
              </Text>
            )}
          </Flex>
        </Tile>
      ))}
    </Flex>
  );
};

export default Dashboard;