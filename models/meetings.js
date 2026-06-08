const mongoose = require("mongoose");

const MeetingSchema = new mongoose.Schema({
  hubspotMeetingId: {
    type: String,
    required: true,
  },
  hubspotPortalId: {
    type: String,
    required: true,
  },
  meethourMeetingId: {
    type: String,
    required: true,
  },
  meethourMeetingUrl: {
    type: String,
    required: true,
  },
  meetingName: {
    type: String,
  },
  conferenceId: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  timezonePending: {
    type: Boolean,
    default: false,
  },
  pendingTimezone: {
    type: String,
    default: null,
  }
});

module.exports = mongoose.model("Meeting", MeetingSchema);