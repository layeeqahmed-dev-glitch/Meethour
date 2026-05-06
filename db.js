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
      serverSelectionTimeoutMS: 5000,  // 30000 → 5000
      socketTimeoutMS: 10000,          // 45000 → 10000
      connectTimeoutMS: 5000,          // 30000 → 5000
      tls: true,
      tlsAllowInvalidCertificates: false,
    });

    isConnected = db.connections[0].readyState;
    console.log('MongoDB Connected! ✅');

  } catch (error) {
    console.warn('⚠️ MongoDB connection failed:', error.message);
  }
};

module.exports = connectDB;