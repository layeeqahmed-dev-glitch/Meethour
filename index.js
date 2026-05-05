require('dotenv').config();
const express = require("express");
const app = express();
app.use(express.json());
const axios = require("axios");
const qs = require("querystring");
const connectDB = require('./db');
const Meeting = require('./models/meetings');
const convertHubspotTimezone = require('./timezoneMap');
const Token = require('./models/token');
// const session = require('express-session');
const mongoose = require('mongoose');
const Test = require("./models/test");

connectDB()
  .then(() => {
    console.log("✅ MongoDB connected successfully (no DNS override)");
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err);
  });

// Parse all incoming request bodies as plain text
app.use(express.text({ type: "*/*" }));

// let lastExecutionTime = 0;

// // Configure session middleware to store user session data
// app.use(session({
//   secret: process.env.SESSION_SECRET || 'your-secret-key',
//   resave: false,
//   saveUninitialized: true,
//   cookie: { secure: false }
// }));


//server tesing 
app.post("/testing", async (req, res) => {
  try {
    const data = await Test.create(req.body);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//root
app.get('/', (req, res) => {
  res.send('Server is responding!');
});

// // Step 1: HubSpot OAuth Callback
// app.get('/callback', async (req, res) => {
//   try {

//     //to get code form url
//     const code = req.query.code;

//     //if no code throw err
//     if (!code) {
//       return res.status(400).send('No code provided!');
//     }

//     //taking the code from callback and exchanging to this api (code to get hubspot token)  
//     const tokenResponse = await axios.post(
//       'https://api.hubapi.com/oauth/v1/token',
//       qs.stringify({
//         grant_type: 'authorization_code',
//         client_id: process.env.HUBSPOT_CLIENT_ID,
//         client_secret: process.env.HUBSPOT_CLIENT_SECRET,
//         redirect_uri: process.env.HUBSPOT_REDIRECT_URI,
//         code: code
//       }),
//       //data type format
//       { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
//     );

//     //extracting the access token from the API response
//     const hubspotAccessToken = tokenResponse.data.access_token;

//     //extracting the refresh token from the API response
//     const hubspotRefreshToken = tokenResponse.data.refresh_token;

//     //post request to fetch HubSpot portal info from access token
//     const portalRes = await axios.get(`https://api.hubapi.com/oauth/v1/access-tokens/${hubspotAccessToken}`);

//     // Getting HubSpot portal ID from access token
//     const portalId = portalRes.data.hub_id;


//     //loggin the portalID
//     console.log(' HubSpot token saved for portal:', portalId);


//     // Only save to DB if MongoDB is connected
//     if (mongoose.connection.readyState === 1) {

//       //check for hubspotPortalId if exist update it & if not create new 
//       await Token.findOneAndUpdate(
//         { hubspotPortalId: portalId },
//         {
//           //declaring the variable for storing token in db
//           hubspotAccessToken,
//           //declaring the variable for storing refresh token in db
//           hubspotRefreshToken,
//           //clearing old meethour token so status can reset to pending on reinstall
//           meethourAccessToken: null,
//           status: 'pending'
//         },
//         { upsert: true, new: true }
//       );
//       //loggin that we saved token to db
//       console.log(' Token saved to DB');
//       //else log error
//     } else {
//       console.log(' DB not available - token not saved');
//       // req.session.portalId = portalId;  // Save in session as backup
//     }

//     //storing portalId in session
//     // req.session.portalId = portalId;

//     const meethourRedirect = `${process.env.APP_BASE_URL}/meethour-callback`;

//     //redirecting to meehtour service login page to get access token for creating meeting on token account
//     res.redirect(
//       `https://portal.meethour.io/serviceLogin?client_id=0pvx3tst84t7x3kym5wyvstnvol679mwmovk&redirect_uri=${encodeURIComponent(meethourRedirect)}&device_type=web&response_type=get`
//     );
//   }

//   //if anything fails log that error
//   catch (err) {
//     console.error('OAuth Error Details:', {
//       message: err.message,
//       response: err.response?.data,   // <-- This shows HubSpot's exact error reason
//       status: err.response?.status
//     });
//     res.status(500).send(`Installation failed! ${err.message}`);
//   }
// });

// Step 1: HubSpot OAuth Callback
// Step 1: HubSpot OAuth Callback
app.get('/callback', async (req, res) => {
  try {

    //to get code from url
    const code = req.query.code;

    //if no code throw err
    if (!code) {
      return res.status(400).send('No code provided!');
    }

    // Wait for DB to connect before doing anything else
    // This is needed because Vercel is serverless and DB may not be connected yet
    await connectDB();

    //taking the code from callback and exchanging to this api (code to get hubspot token)  
    const tokenResponse = await axios.post(
      'https://api.hubapi.com/oauth/v1/token',
      qs.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.HUBSPOT_CLIENT_ID,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET,
        redirect_uri: process.env.HUBSPOT_REDIRECT_URI,
        code: code
      }),
      //data type format
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    //extracting the access token from the API response
    const hubspotAccessToken = tokenResponse.data.access_token;

    //extracting the refresh token from the API response
    const hubspotRefreshToken = tokenResponse.data.refresh_token;

    //post request to fetch HubSpot portal info from access token
    const portalRes = await axios.get(`https://api.hubapi.com/oauth/v1/access-tokens/${hubspotAccessToken}`);

    // Getting HubSpot portal ID from access token
    const portalId = portalRes.data.hub_id;

    //logging the portalID
    console.log('HubSpot token saved for portal:', portalId);

    //check for hubspotPortalId if exist update it & if not create new 
    await Token.findOneAndUpdate(
      { hubspotPortalId: portalId },
      {
        //declaring the variable for storing token in db
        hubspotAccessToken,
        //declaring the variable for storing refresh token in db
        hubspotRefreshToken,
        //clearing old meethour token so status can reset to pending on reinstall
        meethourAccessToken: null,
        status: 'pending'
      },
      { upsert: true, new: true }
    );

    //logging that we saved token to db
    console.log('✅ Token saved with status: pending');

    const meethourRedirect = `${process.env.APP_BASE_URL}/meethour-callback`;

    //redirecting to meethour service login page to get access token for creating meeting on that account
    res.redirect(
      `https://portal.meethour.io/serviceLogin?client_id=0pvx3tst84t7x3kym5wyvstnvol679mwmovk&redirect_uri=${encodeURIComponent(meethourRedirect)}&device_type=web&response_type=get`
    );

    //if anything fails log that error
  } catch (err) {
    console.error('OAuth Error Details:', {
      message: err.message,
      response: err.response?.data,
      status: err.response?.status
    });
    res.status(500).send(`Installation failed! ${err.message}`);
  }
});

// Step 2: MeetHour Callback redirect url after meethour login
app.get('/meethour-callback', async (req, res) => {
  //extracting the token after login
  try {

    // Wait for DB to connect before doing anything else
    // This is needed because Vercel is serverless and DB may not be connected yet
    await connectDB();

    const token = req.query.access_token;

    //if token not found throw error
    if (!token) {
      return res.status(400).send('No MeetHour token found!');
    }

    //  Find the most recent pending record and multiples records are pending pick the latest one
    const pendingRecord = await Token.findOne({ status: 'pending' }).sort({ createdAt: -1 });

    //if not found pending record return this
    if (!pendingRecord) {
      return res.status(400).send('Session expired! Please reinstall the app.');
    }

    //  Update with MeetHour token and mark as active
    await Token.findOneAndUpdate(

      // pick the latest user who is in pending state
      { hubspotPortalId: pendingRecord.hubspotPortalId },
      //Attach MeetHour token to that same HubSpot user and mark as completed
      {
        meethourAccessToken: token,
        status: 'active' // now active!
      }
    );

    //loggin
    console.log(' MeetHour token saved for portal:', pendingRecord.hubspotPortalId);

    //printing this text after successfulle connecting meethour in hubspot
    res.send(' MeetHour connected successfully! You can close this tab.');


    //logging the error 
  } catch (err) {
    console.error('MeetHour Callback Error:', err.message);
    res.status(500).send('Something went wrong!');
  }
});

//random password generator for meeting becuase passcode is req param to create meeting in hubspot
function generatePasscode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let passcode = '';
  for (let i = 0; i < 8; i++) {
    passcode += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return passcode;
}


//creating webhook meeting from hubspot API
// app.post("/create-meeting", async (req, res) => {
//   try {
//     console.log("------ NEW REQUEST ------");
//     console.log("BODY:", JSON.stringify(req.body, null, 2));

//     //getting timestamp millisecond
//     // const now = Date.now();

//     // //blocking req if it made in less then 4s  
//     //   if (now - lastExecutionTime < 4000) {
//     //     console.log(" Duplicate request blocked");
//     //     return res.json({
//     //       conferenceId: "dup-" + now,
//     //       conferenceUrl: "https://meethour.io",
//     //       conferenceDetails: "Duplicate request ignored"
//     //     });
//     //   }

//     // lastExecutionTime = now;

//     const invitees = req.body.invitees || [];

//     //if no invitee from hubspot then
//     if (invitees.length === 0) {
//       //log no invitee if there is no mentioned
//       console.log(" No invitees");
//       return res.json({
//         conferenceId: "no-attendees-" + now,
//         conferenceUrl: "https://meethour.io",
//         conferenceDetails: "No attendees provided"
//       });
//     }

//     // Get portalId from request
//     const portalId = req.body.portalId;

//     //if we dont find portalId log no portalid found
//     if (!portalId) {
//       console.log(" No portalId in request");
//       return res.json({
//         conferenceId: "error-" + now,
//         conferenceUrl: "https://meethour.io",
//         conferenceDetails: "Portal ID missing"
//       });
//     }

//     // Fetch MeetHour token from DB dynamically
//     const tokenRecord = await Token.findOne({ hubspotPortalId: portalId });

//     // Check if user exists in DB and has MeetHour token
//     if (!tokenRecord || !tokenRecord.meethourAccessToken) {
//       console.log("No MeetHour token found for portal:", portalId);

//       // Return error response if MeetHour is not connected
//       return res.json({
//         conferenceId: "error-" + now,
//         conferenceUrl: "https://meethour.io",
//         conferenceDetails: "MeetHour not connected for this account"
//       });
//     }

//     //getting token from tokenrecord from database 
//     const token = tokenRecord.meethourAccessToken; // ✅ Dynamic token!

//     //converting valid input (time) into js date object 
//     const start = new Date(req.body.startTime);

//     //converting js obj date to str and collecting just the date by doing this[0] =>date!
//     const meeting_date = start.toISOString().split("T")[0];

//     //converting 24hr to 12hr format
//     let hours = start.getHours();
//     const minutes = start.getMinutes();
//     const meridiem = hours >= 12 ? "PM" : "AM";
//     hours = hours % 12 || 12;

//     //converting if time (intr) to (str) and it has 2 digits like 03 => 3 to create meeting in meethour 
//     const meeting_time =
//       `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

//     const attend = invitees
//       //if there is no email to invitee dont select that user
//       .filter(i => i?.email)
//       //checking for first name and storing making it as first_name,last_name
//       .map(i => ({
//         first_name: i.firstName,
//         last_name: i.lastName || "",
//         email: i.email
//       }));

//     //these all will be sent to meethour api (schedulemeeting) to schedule meeting.
//     const payload = {
//       meeting_name: req.body.topic,
//       meeting_date,
//       meeting_time,
//       meeting_meridiem: meridiem,
//       timezone: convertHubspotTimezone(req.body.timezone),
//       passcode: generatePasscode(),
//       attend,
//       send_calendar_invite: 1
//     };

//     //making post req to meethour for scheduling meeting
//     const response = await axios.post(
//       "https://api.meethour.io/api/v1.2/meeting/schedulemeeting",
//       payload,
//       {
//         headers: {
//           Authorization: `Bearer ${token}`,
//           "Content-Type": "application/json"
//         }
//       }
//     );

//     //extracting the data after creating meeting to show in meetings tab in hubspot
//     const meeting = response.data.data;

//     //converting time into readable format so that we can send details with this time & date format
//     const formattedTime = new Date(req.body.startTime).toLocaleString("en-US", {
//       dateStyle: "medium",
//       timeStyle: "short"
//     });

//     //Meeting details that will shown in the meetings tab in hubspot
//     const details = `
//       <b>Layeeq Ahmed is inviting you to a scheduled meeting.</b><br>
//       <b>Topic:</b> ${meeting.topic}<br>
//       <b>Time:</b> ${formattedTime} (${convertHubspotTimezone(req.body.timezone)})<br>
//       <b>Join Meeting:</b> ${meeting.joinURL}<br>
//       <b>Meeting ID:</b> ${meeting.meeting_id}<br>
//       <b>Passcode:</b> ${meeting.passcode}<br>
//     `;

//     //meeting datails that will be updated in database
//     await Meeting.create({
//       hubspotMeetingId: `${req.body.portalId}-${req.body.startTime}`,
//       hubspotPortalId: portalId,
//       meethourMeetingId: meeting.meeting_id,
//       meethourMeetingUrl: meeting.joinURL,
//       meetingName: req.body.topic || "HubSpot Meeting",
//       conferenceId: String(meeting.id)  // ✅ save conferenceId
//     });

//     console.log('Meeting saved to DB! ✅');

//     return res.json({
//       conferenceId: meeting.id,
//       conferenceUrl: meeting.joinURL,
//       conferenceDetails: details
//     });

//   } catch (err) {
//     console.log("ERROR:", err.response?.data || err.message);
//     console.log("❌ STACK:", err.stack);
//     return res.json({
//       conferenceId: "error-" + Date.now(),
//       conferenceUrl: "https://meethour.io",
//       conferenceDetails: "Temporary issue, try again"
//     });
//   }
// });

app.post("/create-meeting", async (req, res) => {
  try {
    console.log("------ NEW REQUEST ------");
    console.log("BODY:", JSON.stringify(req.body, null, 2));
    console.log("TIMEZONE:", req.body.timezone);
    // Wait for DB to connect before doing anything else
    // This is needed because Vercel is serverless and DB may not be connected yet
    await connectDB();

    const invitees = req.body.invitees || [];

    //if no invitee from hubspot then
    if (invitees.length === 0) {
      //log no invitee if there is no mentioned
      console.log(" No invitees");
      return res.json({
        conferenceId: "no-attendees-" + Date.now(),
        conferenceUrl: "https://meethour.io",
        conferenceDetails: "No attendees provided"
      });
    }

    // Get portalId from request
    const portalId = req.body.portalId;

    //if we dont find portalId log no portalId found
    if (!portalId) {
      console.log(" No portalId in request");
      return res.json({
        conferenceId: "error-" + Date.now(),
        conferenceUrl: "https://meethour.io",
        conferenceDetails: "Portal ID missing"
      });
    }

    // Fetch MeetHour token from DB dynamically
    const tokenRecord = await Token.findOne({ hubspotPortalId: portalId });

    // Check if user exists in DB and has MeetHour token
    if (!tokenRecord || !tokenRecord.meethourAccessToken) {
      console.log("No MeetHour token found for portal:", portalId);

      // Return error response if MeetHour is not connected
      return res.json({
        conferenceId: "error-" + Date.now(),
        conferenceUrl: "https://meethour.io",
        conferenceDetails: "MeetHour not connected for this account"
      });
    }

    //getting token from tokenRecord from database 
    const token = tokenRecord.meethourAccessToken;

    //converting valid input (time) into js date object 
    // Convert UTC timestamp from HubSpot to JS Date object
    const start = new Date(req.body.startTime);

    // Convert UTC to IST by using Asia/Kolkata timezone
    // toLocaleString gives us the time in IST as a string, then we wrap it in new Date()
    const istDate = new Date(start.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

    // Extract date in YYYY-MM-DD format from IST date
    const meeting_date = `${istDate.getFullYear()}-${String(istDate.getMonth() + 1).padStart(2, "0")}-${String(istDate.getDate()).padStart(2, "0")}`;

    // Extract hours and minutes from IST date (not UTC)
    let hours = istDate.getHours();
    const minutes = istDate.getMinutes();

    // Determine AM or PM
    const meridiem = hours >= 12 ? "PM" : "AM";

    // Convert 24hr to 12hr format
    hours = hours % 12 || 12;

    // Pad hours and minutes to 2 digits e.g. 3 => 03
    const meeting_time = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

    console.log("meeting_date:", meeting_date);
    console.log("meeting_time:", meeting_time);
    console.log("meridiem:", meridiem);

    const attend = invitees
      //if there is no email to invitee dont select that user
      .filter(i => i?.email)
      //checking for first name and storing making it as first_name,last_name
      .map(i => ({
        first_name: i.firstName,
        last_name: i.lastName || "",
        email: i.email
      }));

    //these all will be sent to meethour api (schedulemeeting) to schedule meeting
    const payload = {
      meeting_name: req.body.topic,
      meeting_date,
      meeting_time,
      meeting_meridiem: meridiem,
      timezone: convertHubspotTimezone(req.body.timezone),
      passcode: generatePasscode(),
      attend,
      send_calendar_invite: 1
    };

    //making post req to meethour for scheduling meeting
    const response = await axios.post(
      "https://api.meethour.io/api/v1.2/meeting/schedulemeeting",
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    //extracting the data after creating meeting to show in meetings tab in hubspot
    const meeting = response.data.data;

    //converting time into readable format so that we can send details with this time & date format
    const formattedTime = istDate.toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata"
    });

    //// Fetch user name from HubSpot using userId sent in request
    const ownerRes = await axios.get(
      `https://api.hubapi.com/crm/v3/owners/${req.body.userId}`,
      { headers: { Authorization: `Bearer ${tokenRecord.hubspotAccessToken}` } }
    );
    const ownerName = `${ownerRes.data.firstName} ${ownerRes.data.lastName}`;

    //Meeting details that will be shown in the meetings tab in hubspot
    const details = `
      <b>${ownerName} is inviting you to a scheduled meeting.</b><br>
      <b>Topic:</b> ${meeting.topic}<br>
      <b>Time:</b> ${formattedTime} (${convertHubspotTimezone(req.body.timezone)})<br>
      <b>Join Meeting:</b> ${meeting.joinURL}<br>
      <b>Meeting ID:</b> ${meeting.meeting_id}<br>
      <b>Passcode:</b> ${meeting.passcode}<br>
    `;

    //meeting details that will be saved in the database
    await Meeting.create({
      hubspotMeetingId: `${req.body.portalId}-${req.body.startTime}`,
      hubspotPortalId: portalId,
      meethourMeetingId: meeting.meeting_id,
      meethourMeetingUrl: meeting.joinURL,
      meetingName: req.body.topic || "HubSpot Meeting",
      conferenceId: String(meeting.id)  // save conferenceId
    });

    console.log('Meeting saved to DB! ✅');

    return res.json({
      conferenceId: meeting.id,
      conferenceUrl: meeting.joinURL,
      conferenceDetails: details
    });

  } catch (err) {
    console.log("ERROR:", err.response?.data || err.message);
    console.log("❌ STACK:", err.stack);
    return res.json({
      conferenceId: "error-" + Date.now(),
      conferenceUrl: "https://meethour.io",
      conferenceDetails: "Temporary issue, try again"
    });
  }
});


// delete meeting route
app.post("/delete-meeting", async (req, res) => {
  try {
    console.log("------ DELETE MEETING REQUEST ------");
    console.log("BODY:", JSON.stringify(req.body, null, 2));

    const portalId = req.body.portalId;
    const conferenceId = req.body.conferenceId; // ✅ get conferenceId


    //checking for portal id
    if (!portalId) {
      console.log("❌ No portalId found");
      return res.status(400).send('Portal ID missing');
    }

    //checking for confrence ID
    if (!conferenceId) {
      console.log("❌ No conferenceId found");
      return res.status(400).send('Conference ID missing');
    }

    // Fetch MeetHour token from DB to del meeting from that token account
    const tokenRecord = await Token.findOne({ hubspotPortalId: String(portalId) });

    if (!tokenRecord || !tokenRecord.meethourAccessToken) {
      console.log("❌ No MeetHour token found for portal:", portalId);
      return res.status(400).send('MeetHour not connected for this account');
    }

    const token = tokenRecord.meethourAccessToken;

    //  Find meeting by conferenceId
    const meetingRecord = await Meeting.findOne({ conferenceId: String(conferenceId) });

    if (!meetingRecord) {
      console.log("❌ Meeting not found in DB");
      return res.status(404).send('Meeting not found');
    }

    console.log("Found meeting in DB:", meetingRecord.meethourMeetingId);

    // Call MeetHour delete API to delete meeting
    const response = await axios.post(
      "https://api.meethour.io/api/v1.2/meeting/deletemeeting",
      { meeting_id: meetingRecord.meethourMeetingId },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log(" Meeting deleted from MeetHour:", response.data);

    //  Delete from DB as well
    await Meeting.findOneAndDelete({ conferenceId: String(conferenceId) });
    console.log(" Meeting deleted from DB!");
    return res.status(200).send('Meeting deleted successfully!');

  } catch (err) {
    console.error("Delete Meeting Error:", err.response?.data || err.message);
    return res.status(500).send('Something went wrong!');
  }
});

//localhost running @ 3000
if (process.env.NODE_ENV !== 'production') {
  app.listen(3000, () => console.log("Server running on port 3000"));
}

module.exports = app;