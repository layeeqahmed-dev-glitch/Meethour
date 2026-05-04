const mongoose = require('mongoose');

let isConnected = false; 
const connectDB = async () => {
  if (isConnected) {
    console.log('=> Using existing database connection');
    return;
  }

  if (!process.env.MONGO_URI) {
    console.warn('⚠️ MONGO_URI not set - running without database');
    return;
  }

  try {
    console.log("🔍 USING URI:", process.env.MONGO_URI);

    const db = await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
      tls: true,                  // ✅ enable TLS/SSL
      tlsAllowInvalidCertificates: false,
    });

    isConnected = db.connections[0].readyState;
    console.log('MongoDB Connected! ✅');

  } catch (error) {
    console.warn('⚠️ MongoDB connection failed:', error.message);
  }
};

module.exports = connectDB;