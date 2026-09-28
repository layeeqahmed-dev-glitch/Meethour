const mongoose = require('mongoose');

const TokenSchema = new mongoose.Schema({

  // HubSpot information
  hubspotPortalId: {
    type: String,
    default: null,
    unique: true,
    sparse: true
  },

  hubspotAccessToken: {
    type: String,
    default: null
  },

  hubspotRefreshToken: {
    type: String,
    default: null
  },

  // Temporary state used during HubSpot seamless installation
  installState: {
    type: String,
    default: null,
    unique: true,
    sparse: true,
    index: true
  },

  hubspotReturnUrl: {
    type: String,
    default: null
  },

  // MeetHour information
  meethourUserEmail: {
    type: String,
    default: null
  },

  meethourUserId: {
    type: String,
    default: null
  },

  meethourUserName: {
    type: String,
    default: null
  },

  meethourAccessToken: {
    type: String,
    default: null
  },

  status: {
    type: String,
    enum: ['pending', 'meethour_connected', 'active'],
    default: 'pending'
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }

});

module.exports = mongoose.model('Token', TokenSchema);