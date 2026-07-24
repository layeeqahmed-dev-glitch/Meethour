const axios = require("axios");
const mongoose = require("mongoose");

const TokenSchema = new mongoose.Schema({
  hubspotPortalId: String,
  meethourAccessToken: String,
});
const Token =
  mongoose.models.Token || mongoose.model("Token", TokenSchema);

let cachedConnection = null;

async function connectDB(uri) {
  if (cachedConnection) return cachedConnection;
  cachedConnection = await mongoose.connect(uri);
  return cachedConnection;
}

exports.main = async (context) => {
  const { portalId, type } = context.parameters;

  try {
    await connectDB(context.secrets.MONGO_URI);

    const tokenRecord = await Token.findOne({
      hubspotPortalId: String(portalId),
    });

    if (!tokenRecord || !tokenRecord.meethourAccessToken) {
      return { success: false, message: "MeetHour token not found" };
    }

    const meethourToken = tokenRecord.meethourAccessToken;

    const endpoint =
      type === "completed"
        ? "https://api.meethour.io/api/v1.2/meeting/completedmeetings"
        : "https://api.meethour.io/api/v1.2/meeting/upcomingmeetings";

    const meetingsRes = await axios.post(
      endpoint,
      {},
      {
        headers: {
          Authorization: `Bearer ${meethourToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    const meetings = (meetingsRes.data.meetings || []).map((m) => ({
      id: m.id,
      topic: m.topic,
      startTime: m.start_time,
      timezone: m.timezone,
      duration: m.duration,
      joinURL: m.joinURL,
      totalAttended: m.total_attended,
    }));

    return { success: true, meetings };
  } catch (err) {
    return {
      success: false,
      error: err.response?.data || err.message,
    };
  }
};