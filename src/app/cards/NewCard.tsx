import React, { useEffect, useState } from "react";
import {
  Tile,
  Tabs,
  Button,
  Tab,
  Text,
  ButtonRow,
  Flex,
  LoadingSpinner,
  hubspot,
} from "@hubspot/ui-extensions";

type Meeting = {
  id: string;
  topic: string;
  duration: string | number;
  invitees?: string | number;
  startTime: string;
  timezone: string;
  passcode?: string;
  joinURL: string;
};

type Recording = {
  id: string;
  topic: string;
  type: string;
  duration: string;
  date: string;
};

type MeetingsResponse = {
  meetings?: Meeting[];
};

type RecordingsResponse = {
  recordings?: Recording[];
};

type DashboardProps = {
  context: any;
};

hubspot.extend(({ context }) => <Dashboard context={context} />);

const Dashboard = ({ context }: DashboardProps) => {
  const [selected, setSelected] = useState("my-meetings");

  const [meetingType, setMeetingType] = useState<"upcoming" | "completed">(
    "upcoming"
  );

  const [meetingsCache, setMeetingsCache] = useState<{
    upcoming: Meeting[] | null;
    completed: Meeting[] | null;
  }>({
    upcoming: null,
    completed: null,
  });

  const [loading, setLoading] = useState(false);

  const [recordingsCache, setRecordingsCache] = useState<{
    meethour: Recording[] | null;
    dropbox: Recording[] | null;
    onedrive: Recording[] | null;
    customs3: Recording[] | null;
  }>({
    meethour: null,
    dropbox: null,
    onedrive: null,
    customs3: null,
  });

  const [recordingsLoading, setRecordingsLoading] = useState(false);

  const [recordingType, setRecordingType] = useState<
    "meethour" | "dropbox" | "onedrive" | "customs3"
  >("meethour");

  // ---------------------------------------
  // Fetch Meetings
  // ---------------------------------------
  useEffect(() => {
    if (selected !== "my-meetings") return;
    if (meetingsCache[meetingType] !== null) return;

    let cancelled = false;

    setLoading(true);

    hubspot
      .fetch(
        `https://meethourhubs.vercel.app/api/meethour-meetings?portalId=${context.portal.id}&type=${meetingType}&_t=${Date.now()}`
      )
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to fetch meetings");
        }

        return res.json() as Promise<MeetingsResponse>;
      })
      .then((data) => {
        if (cancelled) return;

        setMeetingsCache((prev) => ({
          ...prev,
          [meetingType]: data.meetings || [],
        }));

        setLoading(false);
      })
      .catch((error) => {
        console.error("Meetings fetch error:", error);

        if (!cancelled) {
          setMeetingsCache((prev) => ({
            ...prev,
            [meetingType]: [],
          }));

          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selected, meetingType, context.portal.id, meetingsCache]);

  // ---------------------------------------
  // Fetch Recordings
  // ---------------------------------------
  useEffect(() => {
    if (selected !== "my-recordings") return;
    if (recordingsCache[recordingType] !== null) return;

    let cancelled = false;

    setRecordingsLoading(true);

    hubspot
      .fetch(
        `https://meethourhubs.vercel.app/api/meethour-recordings?portalId=${context.portal.id}&type=${recordingType}&_t=${Date.now()}`
      )
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to fetch recordings");
        }

        return res.json() as Promise<RecordingsResponse>;
      })
      .then((data) => {
        if (cancelled) return;

        setRecordingsCache((prev) => ({
          ...prev,
          [recordingType]: data.recordings || [],
        }));

        setRecordingsLoading(false);
      })
      .catch((error) => {
        console.error("Recordings fetch error:", error);

        if (!cancelled) {
          setRecordingsCache((prev) => ({
            ...prev,
            [recordingType]: [],
          }));

          setRecordingsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selected, recordingType, context.portal.id, recordingsCache]);

  return (
    <Tile>
      <Tabs selected={selected} onSelectedChange={setSelected}>
        {/* ---------------------------------------
            MY MEETINGS
        --------------------------------------- */}
        <Tab tabId="my-meetings" title="My Meetings">
          <Flex direction="column" gap="lg">
            <ButtonRow>
              <Button
                variant={
                  meetingType === "upcoming" ? "primary" : "secondary"
                }
                onClick={() => setMeetingType("upcoming")}
              >
                Upcoming Meetings
              </Button>

              <Button
                variant={
                  meetingType === "completed" ? "primary" : "secondary"
                }
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

        {/* ---------------------------------------
            MY RECORDINGS
        --------------------------------------- */}
        <Tab tabId="my-recordings" title="My Recordings">
          <Flex direction="column" gap="lg">
            <ButtonRow>
              <Button
                variant={
                  recordingType === "meethour" ? "primary" : "secondary"
                }
                onClick={() => setRecordingType("meethour")}
              >
                MeetHour
              </Button>

              <Button
                variant={
                  recordingType === "dropbox" ? "primary" : "secondary"
                }
                onClick={() => setRecordingType("dropbox")}
              >
                Dropbox
              </Button>

              <Button
                variant={
                  recordingType === "onedrive" ? "primary" : "secondary"
                }
                onClick={() => setRecordingType("onedrive")}
              >
                OneDrive
              </Button>

              <Button
                variant={
                  recordingType === "customs3" ? "primary" : "secondary"
                }
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
      </Tabs>
    </Tile>
  );
};

// ---------------------------------------
// Meeting Card
// ---------------------------------------
const MeetingCard = ({
  m,
  type,
}: {
  m: Meeting;
  type: "upcoming" | "completed";
}) => {
  return (
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

        {type === "upcoming" && m.joinURL && (
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
};

// ---------------------------------------
// Meetings List
// ---------------------------------------
const MeetingsList = ({
  meetings,
  loading,
  type,
}: {
  meetings: Meeting[] | null;
  loading: boolean;
  type: "upcoming" | "completed";
}) => {
  if (loading || meetings === null) {
    return <LoadingSpinner label="Loading meetings..." />;
  }

  if (!meetings.length) {
    return <Text>No meetings found.</Text>;
  }

  return (
    <Flex direction="column" gap="lg">
      {meetings.map((m) => (
        <MeetingCard key={m.id} m={m} type={type} />
      ))}
    </Flex>
  );
};

// ---------------------------------------
// Recording Card
// ---------------------------------------
const RecordingCard = ({ r }: { r: Recording }) => {
  return (
    <Tile>
      <Flex direction="column" gap="sm">
        <Flex direction="row" gap="xs" wrap="nowrap">
          <Text format={{ fontWeight: "bold" }}>Recording :</Text>
          <Text>{r.topic}</Text>
        </Flex>

        <Flex direction="row" gap="xs" wrap="nowrap">
          <Text format={{ fontWeight: "bold" }}>Type :</Text>
          <Text>{r.type}</Text>
        </Flex>

        <Flex direction="row" gap="xs" wrap="nowrap">
          <Text format={{ fontWeight: "bold" }}>Duration :</Text>
          <Text>{r.duration}</Text>
        </Flex>

        <Flex direction="row" gap="xs" wrap="nowrap">
          <Text format={{ fontWeight: "bold" }}>Date :</Text>
          <Text>{r.date}</Text>
        </Flex>

        <Button
          href={{
            url: `https://portal.meethour.io/customer/view_recording/${r.id}`,
            external: true,
          }}
          variant="secondary"
          size="md"
          type="button"
        >
          Play Recording
        </Button>
      </Flex>
    </Tile>
  );
};

// ---------------------------------------
// Recordings List
// ---------------------------------------
const RecordingsList = ({
  recordings,
  loading,
}: {
  recordings: Recording[] | null;
  loading: boolean;
}) => {
  if (loading || recordings === null) {
    return <LoadingSpinner label="Loading recordings..." />;
  }

  if (!recordings.length) {
    return <Text>No recordings found.</Text>;
  }

  return (
    <Flex direction="column" gap="lg">
      {recordings.map((r) => (
        <RecordingCard key={`${r.id}-${r.date}`} r={r} />
      ))}
    </Flex>
  );
};

export default Dashboard;