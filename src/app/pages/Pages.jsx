import React, { useState, useEffect } from "react";
import {
  Tile,
  Tabs,
  Button,
  Divider,
  Tab,
  Text,
  ButtonRow,
  Flex,
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
  const [recordingsCache, setRecordingsCache] = useState({
    meethour: null,
    dropbox: null,
    onedrive: null,
    customs3: null,
  });
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [recordingType, setRecordingType] = useState("meethour");

  useEffect(() => {
    if (selected !== "my-meetings") return;
    if (meetingsCache[meetingType]) return;

    let cancelled = false;
    setLoading(true);

    hubspot
      .fetch(
        `https://meethourhubs.vercel.app/api/meethour-meetings?portalId=${context.portal.id}&type=${meetingType}&_t=${Date.now()}`,
      )
      .then((res) => res.json())
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

  useEffect(() => {
    if (selected !== "my-recordings") return;
    if (recordingsCache[recordingType]) return;

    let cancelled = false;
    setRecordingsLoading(true);

    hubspot
      .fetch(
        `https://meethourhubs.vercel.app/api/meethour-recordings?portalId=${context.portal.id}&type=${recordingType}&_t=${Date.now()}`,
      )
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setRecordingsCache((prev) => ({ ...prev, [recordingType]: data.recordings || [] }));
        setRecordingsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setRecordingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected, recordingType]);

  return (
    <Tile>
      <Tabs selected={selected} onSelectedChange={setSelected}>
        <Tab tabId="my-meetings" title="My Meetings">
          <Flex direction="column" gap="lg">
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
            <MeetingsList
              meetings={meetingsCache[meetingType]}
              loading={loading}
              type={meetingType}
            />
          </Flex>
        </Tab>
        <Tab tabId="my-recordings" title="My Recordings">
          <Flex direction="column" gap="lg">
            <ButtonRow>
              <Button
                variant={recordingType === "meethour" ? "primary" : "secondary"}
                onClick={() => setRecordingType("meethour")}
              >
                MeetHour
              </Button>
              <Button
                variant={recordingType === "dropbox" ? "primary" : "secondary"}
                onClick={() => setRecordingType("dropbox")}
              >
                Dropbox
              </Button>
              <Button
                variant={recordingType === "onedrive" ? "primary" : "secondary"}
                onClick={() => setRecordingType("onedrive")}
              >
                OneDrive
              </Button>
              <Button
                variant={recordingType === "customs3" ? "primary" : "secondary"}
                onClick={() => setRecordingType("customs3")}
              >
                CustomS3
              </Button>
            </ButtonRow>
            <RecordingsList
              recordings={recordingsCache[recordingType]}
              loading={recordingsLoading}
            />
          </Flex>
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
      <Flex direction="row" gap="xs" wrap="nowrap">
        <Text format={{ fontWeight: "bold" }}>Meeting Name :</Text>
        <Text>{m.topic}</Text>
      </Flex>
      <Flex direction="row" gap="xs" wrap="nowrap">
        <Text format={{ fontWeight: "bold" }}>Duration :</Text>
        <Text>{m.duration} hr</Text>
      </Flex>
      <Flex direction="row" gap="xs" wrap="nowrap">
        <Text format={{ fontWeight: "bold" }}>Invitees :</Text>
        <Text>{m.invitees || 0}</Text>
      </Flex>
      <Flex direction="row" gap="xs" wrap="nowrap">
        <Text format={{ fontWeight: "bold" }}>Date & Time :</Text>
        <Text>
          {m.startTime} ({m.timezone})
        </Text>
      </Flex>
      {type === "upcoming" && (
        <Flex direction="row" gap="xs" wrap="nowrap">
          <Text format={{ fontWeight: "bold" }}>Passcode :</Text>
          <Text>{m.passcode || "N/A"}</Text>
        </Flex>
      )}
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
  if (loading || meetings === null)
    return <LoadingSpinner label="Loading meetings..." />;
  if (!meetings.length) return <Text>No meetings found.</Text>;

  return (
    <Flex direction="column" gap="lg">
      {meetings.map((m) => (
        <MeetingCard key={m.id} m={m} type={type} />
      ))}
    </Flex>
  );
};

const RecordingCard = ({ r, context }) => (
  <Tile>
    <Flex direction="column" gap="md">
      <Text format={{ fontWeight: "bold", fontSize: "large" }}>
        {r.topic}
      </Text>
      <Divider />
      <Flex direction="column" gap="xs">
        <Text format={{ fontWeight: "bold" }} >Meeting ID: {r.id}</Text>
        <Text format={{ fontWeight: "bold" }} >Date: {r.date}</Text>
        <Text format={{ fontWeight: "bold" }} >Duration: {r.duration}</Text>
      </Flex>
      <Divider />
      <Flex direction="row" justify="center">
        <Button
          href={{
            url: `https://portal.meethour.io/customer/view_recording/${r.id}`,
            external: true,
          }}
          variant="primary"
          size="md"
          type="button"
        >
          Play Video
        </Button>
      </Flex>
    </Flex>
  </Tile>
);

const RecordingsList = ({ recordings, loading, context }) => {
  if (loading || recordings === null)
    return <LoadingSpinner label="Loading recordings..." />;
  if (!recordings.length) return <Text>No recordings found.</Text>;

  return (
    <Flex direction="column" gap="lg">
      {recordings.map((r) => (
        <RecordingCard key={r.id + r.date} r={r} context={context} />
      ))}
    </Flex>
  );
};

export default Dashboard;