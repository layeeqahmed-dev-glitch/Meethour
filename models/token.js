const mongoose = require('mongoose');

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
  meethourAccessToken: {
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

module.exports = mongoose.model('Token', TokenSchema);