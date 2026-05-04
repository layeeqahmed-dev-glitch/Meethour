require('dotenv').config();
const axios = require('axios');

const registerWebhooks = async () => {
  try {
    const response = await axios.put(
      `https://api.hubapi.com/crm/extensions/videoconferencing/2026-03/settings/${process.env.HUBSPOT_APP_ID}?hapikey=${process.env.HUBSPOT_DEVELOPER_KEY}`,
      {
        createMeetingUrl: `${process.env.APP_BASE_URL}/create-meeting`,
        updateMeetingUrl: `${process.env.APP_BASE_URL}/update-meeting`,
        deleteMeetingUrl: `${process.env.APP_BASE_URL}/delete-meeting`
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    console.log('✅ Webhooks registered successfully!', response.data);
  } catch (err) {
    console.error('❌ Failed to register webhooks:', err.response?.data || err.message);
  }
};

registerWebhooks();