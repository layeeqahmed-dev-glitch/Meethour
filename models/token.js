const mongoose = require('mongoose');

const InstallSession = mongoose.models.InstallSession || mongoose.model("InstallSession", new mongoose.Schema({
  sessionId: String,            // sent to MeetHour as its own `state`
  returnUrl: String,
  meethourUserEmail: String,
  meethourUserId: String,
  meethourUserName: String,
  meethourAccessToken: String,
  state: String,                // HubSpot state token
  createdAt: { type: Date, default: Date.now, expires: 1800 },
}));

const TokenSchema = new mongoose.Schema({
  hubspotPortalId: {
    type: String,
    required: true,
    unique: true
  },
  hubspotAccessToken: {
    type: String,
    default: null
  },
  hubspotRefreshToken: {
    type: String,
    default: null
  },
  meethourUserEmail: {
    type: String,
    default: null
  },
  meethourUserName: {
    type: String,
    default: null
  },
  meethourUserId: {
    type: String,
    default: null
  },
  meethourAccessToken: {
    type: String,
    default: null
  },
  hubspotFormId: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'active'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Token = mongoose.models.Token || mongoose.model('Token', TokenSchema);
module.exports = Token;
module.exports.InstallSession = InstallSession;