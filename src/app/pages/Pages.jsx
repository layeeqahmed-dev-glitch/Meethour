import React, { useState, useEffect } from "react";
import {
  Tile,
  Tabs,
  Button,
  Tab,
  Text,
  ButtonRow,
  Flex,
  Box,
  LoadingSpinner,
  hubspot,
} from "@hubspot/ui-extensions";

hubspot.extend(({ context }) => <Dashboard context={context} />);

const Dashboard = ({ context }) => {
  const [selected, setSelected] = useState("my-meetings");
  const [meetingType, setMeetingType] = useState("upcoming");
  const [meetingsCache, setMeetingsCache] = useState({
    upcoming: null,
    completed: null,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selected !== "my-meetings") return;
    if (meetingsCache[meetingType]) return;

    let cancelled = false;
    setLoading(true);

    hubspot
      .serverless("getMeethourMeetings", {
        parameters: { portalId: context.portal.id, type: meetingType },
      })
      .then((data) => {
        if (cancelled) return;
        setMeetingsCache((prev) => ({
          ...prev,
          [meetingType]: data.meetings || [],
        }));
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
          <Box marginBottom="lg">
            <ButtonRow>
              <Button
                variant={meetingType === "upcoming" ? "primary" : "secondary"}
                onClick={() => setMeetingType("upcoming")}
              >
                Upcoming Meetings
              </Button>
              <Button
                variant={meetingType === "completed" ? "primary" : "secondary"}
                onClick={() => setMeetingType("completed")}
              >
                Completed Meetings
              </Button>
            </ButtonRow>
          </Box>
          <MeetingsList
            meetings={meetingsCache[meetingType] || []}
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

const MeetingCard = ({ m, type }) => (
  <Tile>
    <Flex direction="column" gap="sm">
      <Flex direction="row" gap="xs">
        <Text format={{ fontWeight: "bold" }}>Meeting Name :</Text>
        <Text>{m.topic}</Text>
      </Flex>
      <Flex direction="row" gap="xs">
        <Text format={{ fontWeight: "bold" }}>Duration :</Text>
        <Text>{m.duration} hr</Text>
      </Flex>
      <Flex direction="row" gap="xs">
        <Text format={{ fontWeight: "bold" }}>Attend :</Text>
        <Text>{m.totalAttended || 0}</Text>
      </Flex>
      <Flex direction="row" gap="xs">
        <Text format={{ fontWeight: "bold" }}>Date & Time :</Text>
        <Text>
          {m.startTime} ({m.timezone})
        </Text>
      </Flex>
      {type === "upcoming" && (
        <Button
          href={{
            url: m.joinURL,
            external: true,
          }}
          variant="secondary"
          size="md"
          type="button"
        >
          Join Meeting
        </Button>
      )}
    </Flex>
  </Tile>
);

const MeetingsList = ({ meetings, loading, type }) => {
  if (loading) return <LoadingSpinner label="Loading meetings..." />;
  if (!meetings.length) return <Text>No meetings found.</Text>;

  const rows = [];
  for (let i = 0; i < meetings.length; i += 2) {
    rows.push(meetings.slice(i, i + 2));
  }

  return (
    <Flex direction="column" gap="md">
      {rows.map((row, idx) => (
        <Flex key={idx} direction="row" gap="md">
          {row.map((m) => (
            <MeetingCard key={m.id} m={m} type={type} />
          ))}
        </Flex>
      ))}
    </Flex>
  );
};

export default Dashboard;