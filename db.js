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
    console.log("🔍 USING URI:", process.env.MONGO_URI); // 👈 ADD THIS

    const db = await mongoose.connect(process.env.MONGO_URI);

    isConnected = db.connections[0].readyState;
    console.log('MongoDB Connected! ✅');

  } catch (error) {
    console.warn('⚠️ MongoDB connection failed:', error.message);
  }
};

module.exports = connectDB;