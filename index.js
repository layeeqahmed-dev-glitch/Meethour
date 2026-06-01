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
    console.log(" MongoDB connected successfully (no DNS override)");
  })
  .catch(err => {
    console.error(' MongoDB connection failed:', err);
  });

// Parse all incoming request bodies as plain text
app.use(express.text({ type: "*/*" }));

console.log('Calling refreshHubspotToken...');
//hubspot token refresh function
const refreshHubspotToken = async (portalId) => {
  const tokenRecord = await Token.findOne({ hubspotPortalId: String(portalId) });

  const response = await axios.post(
    "https://api.hubapi.com/oauth/v1/token",
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.HUBSPOT_CLIENT_ID,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET,
      refresh_token: tokenRecord.hubspotRefreshToken
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  await Token.findOneAndUpdate(
    { hubspotPortalId: portalId },
    {
      hubspotAccessToken: response.data.access_token,
      hubspotRefreshToken: response.data.refresh_token
    }
  );

  return response.data.access_token;
};

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
  res.send('Server is responding on meethourhubs.vercel.app !');
});

// Step 1: HubSpot OAuth Callback
app.get('/callback', async (req, res) => {
  try {
    const code = req.query.code;

    if (!code) {
      return res.status(400).send('No code provided!');
    }

    await connectDB();

    const tokenResponse = await axios.post(
      'https://api.hubapi.com/oauth/v1/token',
      qs.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.HUBSPOT_CLIENT_ID,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET,
        redirect_uri: process.env.HUBSPOT_REDIRECT_URI,
        code: code
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const hubspotAccessToken = tokenResponse.data.access_token;
    const hubspotRefreshToken = tokenResponse.data.refresh_token;

    const portalRes = await axios.get(`https://api.hubapi.com/oauth/v1/access-tokens/${hubspotAccessToken}`);
    const portalId = portalRes.data.hub_id;

    console.log('HubSpot token saved for portal:', portalId);

    await Token.findOneAndUpdate(
      { hubspotPortalId: portalId },
      {
        hubspotAccessToken,
        hubspotRefreshToken,
        meethourAccessToken: null,
        status: 'pending'
      },
      { upsert: true, new: true }
    );

    console.log('Token saved with status: pending');

    // create property group first
    try {
      await axios.post(
        'https://api.hubapi.com/crm/v3/properties/deals/groups',
        {
          name: 'meet_hour',
          label: 'Meet Hour',
          displayOrder: 1
        },
        {
          headers: {
            Authorization: `Bearer ${hubspotAccessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('Property group created');
    } catch (err) {
      console.log('Group skipped (may exist):', err.response?.data?.message);
    }

    // create deal properties in customer's HubSpot account
    const properties = [
      {
        name: 'meeting_date',
        label: 'Meeting Date',
        type: 'date',
        fieldType: 'date',
        groupName: 'meet_hour',
        displayOrder: 0
      },
      {
        name: 'meeting_time',
        label: 'Meeting Time',
        type: 'enumeration',
        fieldType: 'select',
        groupName: 'meet_hour',
        displayOrder: 1,
        options: [
          { label: '12:00', value: '12:00', displayOrder: 0 },
          { label: '12:15', value: '12:15', displayOrder: 1 },
          { label: '12:30', value: '12:30', displayOrder: 2 },
          { label: '12:45', value: '12:45', displayOrder: 3 },
          { label: '01:00', value: '01:00', displayOrder: 4 },
          { label: '01:15', value: '01:15', displayOrder: 5 },
          { label: '01:30', value: '01:30', displayOrder: 6 },
          { label: '01:45', value: '01:45', displayOrder: 7 },
          { label: '02:00', value: '02:00', displayOrder: 8 },
          { label: '02:15', value: '02:15', displayOrder: 9 },
          { label: '02:30', value: '02:30', displayOrder: 10 },
          { label: '02:45', value: '02:45', displayOrder: 11 },
          { label: '03:00', value: '03:00', displayOrder: 12 },
          { label: '03:15', value: '03:15', displayOrder: 13 },
          { label: '03:30', value: '03:30', displayOrder: 14 },
          { label: '03:45', value: '03:45', displayOrder: 15 },
          { label: '04:00', value: '04:00', displayOrder: 16 },
          { label: '04:15', value: '04:15', displayOrder: 17 },
          { label: '04:30', value: '04:30', displayOrder: 18 },
          { label: '04:45', value: '04:45', displayOrder: 19 },
          { label: '05:00', value: '05:00', displayOrder: 20 },
          { label: '05:15', value: '05:15', displayOrder: 21 },
          { label: '05:30', value: '05:30', displayOrder: 22 },
          { label: '05:45', value: '05:45', displayOrder: 23 },
          { label: '06:00', value: '06:00', displayOrder: 24 },
          { label: '06:15', value: '06:15', displayOrder: 25 },
          { label: '06:30', value: '06:30', displayOrder: 26 },
          { label: '06:45', value: '06:45', displayOrder: 27 },
          { label: '07:00', value: '07:00', displayOrder: 28 },
          { label: '07:15', value: '07:15', displayOrder: 29 },
          { label: '07:30', value: '07:30', displayOrder: 30 },
          { label: '07:45', value: '07:45', displayOrder: 31 },
          { label: '08:00', value: '08:00', displayOrder: 32 },
          { label: '08:15', value: '08:15', displayOrder: 33 },
          { label: '08:30', value: '08:30', displayOrder: 34 },
          { label: '08:45', value: '08:45', displayOrder: 35 },
          { label: '09:00', value: '09:00', displayOrder: 36 },
          { label: '09:15', value: '09:15', displayOrder: 37 },
          { label: '09:30', value: '09:30', displayOrder: 38 },
          { label: '09:45', value: '09:45', displayOrder: 39 },
          { label: '10:00', value: '10:00', displayOrder: 40 },
          { label: '10:15', value: '10:15', displayOrder: 41 },
          { label: '10:30', value: '10:30', displayOrder: 42 },
          { label: '10:45', value: '10:45', displayOrder: 43 },
          { label: '11:00', value: '11:00', displayOrder: 44 },
          { label: '11:15', value: '11:15', displayOrder: 45 },
          { label: '11:30', value: '11:30', displayOrder: 46 },
          { label: '11:45', value: '11:45', displayOrder: 47 }
        ]
      },
      {
        name: 'meeting_meridiem',
        label: 'Meeting Meridiem',
        type: 'enumeration',
        fieldType: 'select',
        groupName: 'meet_hour',
        displayOrder: 2,
        options: [
          { label: 'AM', value: 'AM', displayOrder: 0 },
          { label: 'PM', value: 'PM', displayOrder: 1 }
        ]
      },
      {
        name: 'timezone',
        label: 'Timezone',
        type: 'enumeration',
        fieldType: 'select',
        groupName: 'meet_hour',
        displayOrder: 3,
        options: [
          "Etc/GMT+12", "Pacific/Midway", "Pacific/Niue", "America/Adak", "US/Aleutian", "US/Hawaii", "Pacific/Honolulu", "Pacific/Tahiti", "Pacific/Rarotonga", "Pacific/Marquesas", "America/Anchorage", "America/Sitka", "US/Alaska", "America/Nome", "America/Metlakatla", "America/Yakutat", "America/Juneau", "America/Vancouver", "America/Tijuana", "America/Los_Angeles", "Pacific/Pitcairn", "America/Yellowknife", "America/Whitehorse", "America/Inuvik", "America/Phoenix", "Mexico/BajaSur", "America/Hermosillo", "America/Dawson_Creek", "America/Denver", "America/Mazatlan", "America/Ojinaga", "America/Chihuahua", "US/Arizona", "America/Creston", "America/Dawson", "America/Edmonton", "America/Boise", "America/Cambridge_Bay", "Canada/Saskatchewan", "America/Winnipeg", "America/Indiana/Knox", "America/Rainy_River", "America/Rankin_Inlet", "America/Resolute", "America/Indiana/Tell_City", "America/Tegucigalpa", "America/Swift_Current", "America/Regina", "Pacific/Easter", "America/El_Salvador", "America/Costa_Rica", "America/Matamoros", "Pacific/Johnston", "America/North_Dakota/Beulah", "America/North_Dakota/Center", "US/Central", "America/Bahia_Banderas", "America/Mexico_City", "America/Merida", "America/Menominee", "America/North_Dakota/New_Salem", "America/Managua", "Pacific/Galapagos", "America/Guatemala", "Mexico/General", "US/East-Indiana", "America/Belize", "US/Michigan", "America/Indiana/Vincennes", "America/Indiana/Vevay", "America/Toronto", "America/Atikokan", "America/Nipigon", "America/Thunder_Bay", "America/Rio_Branco", "America/Port-au-Prince", "America/Panama", "America/Indiana/Winamac", "America/Indiana/Marengo", "America/New_York", "America/Nassau", "America/Kentucky/Monticello", "America/Monterrey", "America/Kentucky/Louisville", "America/Louisville", "America/Knox_IN", "America/Lima", "America/Jamaica", "US/Eastern", "US/Indiana-Starke", "America/Iqaluit", "America/Indiana/Indianapolis", "America/Indianapolis", "America/Havana", "America/Guayaquil", "America/Cayman", "America/Eirunepe", "America/Detroit", "America/Grand_Turk", "America/Chicago", "America/Cancun", "Atlantic/Bermuda", "America/Curacao", "America/Pangnirtung", "America/Anguilla", "America/Santo_Domingo", "America/Santiago", "America/La_Paz", "America/Puerto_Rico", "America/Antigua", "America/Grenada", "America/St_Thomas", "America/Dominica", "America/Tortola", "America/Porto_Velho", "America/Aruba", "America/Thule", "America/Moncton", "America/Marigot", "America/Manaus", "America/Blanc-Sablon", "America/Guadeloupe", "America/Goose_Bay", "America/Kralendijk", "America/St_Vincent", "America/St_Barthelemy", "America/Guyana", "America/Martinique", "America/Lower_Princes", "America/Cuiaba", "America/Port_of_Spain", "America/St_Lucia", "America/Campo_Grande", "America/Barbados", "America/Montserrat", "America/Bogota", "America/Boa_Vista", "America/St_Kitts", "America/Asuncion", "America/Halifax", "America/Caracas", "America/St_Johns", "Canada/Newfoundland", "America/Argentina/Ushuaia", "America/Sao_Paulo", "America/Santarem", "America/Argentina/Jujuy", "America/Jujuy", "America/Argentina/Tucuman", "America/Argentina/San_Luis", "America/Argentina/San_Juan", "America/Argentina/Catamarca", "America/Bahia", "America/Argentina/Salta", "America/Miquelon", "America/Recife", "America/Paramaribo", "America/Araguaina", "America/Godthab", "America/Montevideo", "America/Argentina/Mendoza", "America/Mendoza", "America/Maceio", "America/Argentina/Buenos_Aires", "America/Buenos_Aires", "America/Belem", "Antarctica/Palmer", "Antarctica/Rothera", "Atlantic/Stanley", "America/Cayenne", "America/Noronha", "Atlantic/South_Georgia", "Atlantic/Azores", "America/Scoresbysund", "Atlantic/Cape_Verde", "America/Danmarkshavn", "Atlantic/St_Helena", "Atlantic/Faeroe", "Etc/Greenwich", "Africa/Abidjan", "Africa/Accra", "Atlantic/Faroe", "Antarctica/Troll", "Africa/Bamako", "Africa/Bissau", "Africa/Conakry", "Africa/Casablanca", "Africa/Dakar", "Europe/Isle_of_Man", "Europe/Dublin", "Africa/Freetown", "Atlantic/Madeira", "Africa/El_Aaiun", "Atlantic/Canary", "Europe/Jersey", "Europe/Lisbon", "Africa/Lome", "Europe/London", "UTC", "Africa/Monrovia", "Africa/Nouakchott", "Africa/Ouagadougou", "Africa/Timbuktu", "Atlantic/Reykjavik", "Europe/Guernsey", "Africa/Sao_Tome", "Europe/Oslo", "Europe/Paris", "Europe/Podgorica", "Europe/Prague", "Europe/Rome", "Europe/Sarajevo", "Europe/San_Marino", "Africa/Algiers", "Europe/Amsterdam", "Europe/Andorra", "Africa/Malabo", "Europe/Belgrade", "Europe/Berlin", "Europe/Malta", "Europe/Bratislava", "Africa/Brazzaville", "Europe/Brussels", "Europe/Budapest", "Africa/Ceuta", "Europe/Copenhagen", "Africa/Porto-Novo", "Africa/Douala", "Europe/Gibraltar", "Africa/Kinshasa", "Africa/Lagos", "Africa/Libreville", "Europe/Ljubljana", "Arctic/Longyearbyen", "Africa/Luanda", "Europe/Luxembourg", "Europe/Madrid", "Europe/Monaco", "Africa/Ndjamena", "Africa/Niamey", "Europe/Vaduz", "Europe/Skopje", "Europe/Stockholm", "Europe/Tirane", "Africa/Tunis", "Europe/Vatican", "Europe/Vienna", "Europe/Warsaw", "Africa/Windhoek", "Europe/Zagreb", "Europe/Zurich", "Africa/Bangui", "Europe/Riga", "Asia/Damascus", "Asia/Amman", "Europe/Athens", "Asia/Beirut", "Europe/Bucharest", "Africa/Bujumbura", "Africa/Cairo", "Africa/Johannesburg", "Europe/Chisinau", "Europe/Tiraspol", "Asia/Hebron", "Africa/Gaborone", "Asia/Gaza", "Africa/Harare", "Europe/Helsinki", "Asia/Jerusalem", "Africa/Juba", "Africa/Khartoum", "Africa/Kigali", "Europe/Kiev", "Europe/Kaliningrad", "Africa/Blantyre", "Africa/Lubumbashi", "Europe/Zaporozhye", "Africa/Lusaka", "Africa/Mbabane", "Africa/Maputo", "Europe/Mariehamn", "Africa/Maseru", "Asia/Nicosia", "Europe/Sofia", "Europe/Tallinn", "Africa/Tripoli", "Europe/Uzhgorod", "Europe/Vilnius", "Africa/Mogadishu", "Europe/Moscow", "Asia/Kuwait", "Indian/Antananarivo", "Antarctica/Syowa", "Africa/Asmara", "Asia/Baghdad", "Africa/Dar_es_Salaam", "Africa/Djibouti", "Asia/Qatar", "Israel", "Europe/Istanbul", "Turkey", "Africa/Kampala", "Indian/Mayotte", "Asia/Bahrain", "Europe/Minsk", "Indian/Comoro", "Africa/Nairobi", "Africa/Addis_Ababa", "Asia/Riyadh", "Asia/Aden", "Europe/Simferopol", "Asia/Istanbul", "Europe/Volgograd", "Asia/Tehran", "Europe/Samara", "Asia/Baku", "Asia/Dubai", "Canada/Atlantic", "Asia/Muscat", "Indian/Mauritius", "Indian/Reunion", "Asia/Tbilisi", "Indian/Mahe", "Asia/Yerevan", "Asia/Kabul", "Asia/Aqtobe", "Antarctica/Mawson", "Asia/Ashgabat", "Asia/Ashkhabad", "Asia/Dushanbe", "Asia/Karachi", "Asia/Qyzylorda", "Indian/Maldives", "Asia/Oral", "Asia/Aqtau", "Asia/Tashkent", "Asia/Yekaterinburg", "Asia/Colombo", "Asia/Dacca", "Asia/Calcutta", "Asia/Kolkata", "Asia/Katmandu", "Asia/Kathmandu", "Asia/Almaty", "Antarctica/Vostok", "Asia/Bishkek", "Indian/Chagos", "Asia/Dhaka", "Asia/Omsk", "Asia/Thimbu", "Asia/Thimphu", "Asia/Urumqi", "Indian/Cocos", "Asia/Rangoon", "Antarctica/Casey", "Antarctica/Davis", "Asia/Bangkok", "Indian/Christmas", "Asia/Ho_Chi_Minh", "Asia/Jakarta", "Asia/Hovd", "Asia/Krasnoyarsk", "Asia/Novokuznetsk", "Asia/Novosibirsk", "Asia/Phnom_Penh", "US/Mountain", "Asia/Pontianak", "Asia/Vientiane", "Asia/Brunei", "Asia/Choibalsan", "Asia/Hong_Kong", "Asia/Irkutsk", "Asia/Kuala_Lumpur", "Asia/Shanghai", "Asia/Kuching", "US/Pacific", "Asia/Macao", "Asia/Macau", "Asia/Makassar", "Australia/Perth", "Asia/Manila", "Singapore", "Asia/Singapore", "Australia/Sydney", "Asia/Taipei", "Asia/Ulaanbaatar", "Australia/Eucla", "Asia/Jayapura", "Asia/Chita", "Asia/Dili", "Pacific/Palau", "Asia/Khandyga", "Asia/Pyongyang", "Asia/Seoul", "Asia/Tokyo", "Asia/Yakutsk", "Australia/Broken_Hill", "Australia/Adelaide", "Australia/Darwin", "Australia/Lindeman", "Australia/Brisbane", "Australia/Canberra", "Antarctica/DumontDUrville", "Pacific/Yap", "Pacific/Guam", "Australia/Hobart", "Pacific/Port_Moresby", "Pacific/Saipan", "Australia/Currie", "Antarctica/Macquarie", "Asia/Vladivostok", "Pacific/Chuuk", "Australia/Lord_Howe", "Australia/LHI", "Pacific/Guadalcanal", "Pacific/Gambier", "Pacific/Norfolk", "Pacific/Pohnpei", "Asia/Magadan", "Asia/Srednekolymsk", "Pacific/Noumea", "Pacific/Pago_Pago", "Pacific/Bougainville", "Pacific/Efate", "Pacific/Kosrae", "Asia/Sakhalin", "Asia/Anadyr", "Antarctica/McMurdo", "Pacific/Auckland", "Kwajalein", "Pacific/Funafuti", "Pacific/Kwajalein", "Pacific/Majuro", "Pacific/Wallis", "Asia/Kamchatka", "Pacific/Fiji", "Pacific/Tarawa", "Pacific/Wake", "Pacific/Nauru", "Pacific/Chatham", "Pacific/Apia", "Pacific/Samoa", "Pacific/Fakaofo", "Pacific/Tongatapu", "Pacific/Enderbury", "Pacific/Kiritimati"
        ].map((tz, index) => ({ label: tz, value: tz, displayOrder: index }))
      }
    ];

    for (const prop of properties) {
      try {
        await axios.post(
          'https://api.hubapi.com/crm/v3/properties/deals',
          prop,
          {
            headers: {
              Authorization: `Bearer ${hubspotAccessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        console.log('Property created:', prop.name);
      } catch (err) {
        console.log('Property skipped (may exist):', prop.name, err.response?.data?.message);
      }
    }

    const meethourRedirect = `${process.env.APP_BASE_URL}/meethour-callback`;

    res.redirect(
      `https://portal.meethour.io/serviceLogin?client_id=0pvx3tst84t7x3kym5wyvstnvol679mwmovk&redirect_uri=${encodeURIComponent(meethourRedirect)}&device_type=web&response_type=get`
    );

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
  try {
    await connectDB();

    const token = req.query.access_token;

    if (!token) {
      return res.status(400).send('No MeetHour token found!');
    }

    const pendingRecord = await Token.findOne({ status: 'pending' }).sort({ createdAt: -1 });

    if (!pendingRecord) {
      return res.status(400).send('Session expired! Please reinstall the app.');
    }

    // Fetch MeetHour user profile to get user ID
    const profileRes = await axios.post(
      'https://api.meethour.io/api/v1.2/customer/user_details',
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );

    console.log('MeetHour profile:', JSON.stringify(profileRes.data, null, 2));

    const meethourUserEmail = profileRes.data?.data?.email;
    const meethourUserName = profileRes.data?.data?.name;
    const meethourUserId = profileRes.data?.data?.id;

    console.log('Updating portal:', pendingRecord.hubspotPortalId);
    console.log('Token to save:', token);

    await Token.findOneAndUpdate(
      { hubspotPortalId: pendingRecord.hubspotPortalId },
      {
        meethourAccessToken: token,
        meethourUserEmail: meethourUserEmail || null,
        meethourUserName: meethourUserName || null,
        meethourUserId: meethourUserId || null,
        status: 'active'
      }
    );

    console.log('MeetHour token saved for portal:', pendingRecord.hubspotPortalId);
    console.log('MeetHour user email saved:', meethourUserEmail);

    res.send('MeetHour connected successfully! You can close this tab.');

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
    const meethourUserEmail = tokenRecord.meethourUserEmail;
    const meethourUserName = tokenRecord.meethourUserName;
    const meethourUserId = tokenRecord.meethourUserId;
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
    console.log("meeting_meridiem:", meridiem);

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
      meeting_name: req.body.topic || "Demo with client",
      meeting_date,
      meeting_time,
      meeting_meridiem: meridiem,
      timezone: convertHubspotTimezone(req.body.timezone),
      passcode: generatePasscode(),
      attend,
      send_calendar_invite: 1,
      hostusers: meethourUserId ? [Number(tokenRecord.meethourUserId)] : []
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
    const formattedTime = new Date(req.body.startTime).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata"
    });

    //// Fetch user name from HubSpot using userId sent in request
    const freshHubspotToken = await refreshHubspotToken(portalId);

    // phir use karo
    console.log("========== OWNER DEBUG ==========");

    console.log(
      "FULL REQUEST BODY:",
      JSON.stringify(req.body, null, 2)
    );

    let ownerName = "Host";

    const idToUse = req.body.organizerUserId || req.body.userId;

    console.log("USER ID FROM REQUEST:", idToUse);

    if (idToUse) {
      const ownerRes = await axios.get(
        `https://api.hubapi.com/crm/v3/owners?userId=${idToUse}`,
        {
          headers: {
            Authorization: `Bearer ${freshHubspotToken}`
          }
        }
      );

      const matchedOwner = ownerRes.data.results.find(
        owner =>
          String(owner.userId) === String(idToUse) ||
          String(owner.userIdIncludingInactive) === String(idToUse)
      );

      console.log("MATCHED OWNER:", matchedOwner);

      if (matchedOwner) {
        ownerName =
          `${matchedOwner.firstName || ""} ${matchedOwner.lastName || ""}`.trim();
      }
    }

    console.log("FINAL OWNER NAME:", ownerName);

    console.log("========== END DEBUG ==========");

    //Meeting details that will be shown in the meetings tab in hubspot
    const details = `
        <b>${ownerName} is inviting you to a scheduled meeting.</b>
        <b>Topic:</b> ${meeting.topic}
        <b>Time:</b> ${formattedTime} (${convertHubspotTimezone(req.body.timezone)})<br>
        <b>Join MeetHour Meeting</b>: ${meeting.joinURL}<br>
        <b>Meeting ID:</b> ${meeting.meeting_id}
        <b>Passcode:</b> ${meeting.passcode}
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

    console.log('Meeting saved to DB!');

    return res.json({
      conferenceId: meeting.id,
      conferenceUrl: meeting.joinURL,
      conferenceDetails: details
    });

    // return res.json({
    //   conferenceId: String(meeting.id),
    //   conferenceUrl: meeting.joinURL
    // });

  } catch (err) {
    console.log("ERROR:", err.response?.data || err.message);
    console.log(" STACK:", err.stack);
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

    // Wait for DB to connect (needed for Vercel serverless)
    await connectDB();

    const portalId = req.body.portalId;
    const conferenceId = req.body.conferenceId;

    if (!portalId) {
      console.log(" No portalId found");
      return res.status(400).send('Portal ID missing');
    }

    if (!conferenceId) {
      console.log(" No conferenceId found");
      return res.status(400).send('Conference ID missing');
    }

    // Fetch MeetHour token from DB
    const tokenRecord = await Token.findOne({ hubspotPortalId: String(portalId) });

    if (!tokenRecord || !tokenRecord.meethourAccessToken) {
      console.log(" No MeetHour token found for portal:", portalId);
      return res.status(400).send('MeetHour not connected for this account');
    }
    const token = tokenRecord.meethourAccessToken;

    // Find meeting in DB by conferenceId
    const meetingRecord = await Meeting.findOne({ conferenceId: String(conferenceId) });

    if (!meetingRecord) {
      console.log(" Meeting not found in DB");
      return res.status(404).send('Meeting not found');
    }

    console.log("Found meeting in DB:", meetingRecord.meethourMeetingId);

    // Delete meeting from MeetHour
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

    // Delete from DB
    await Meeting.findOneAndDelete({ conferenceId: String(conferenceId) });
    console.log(" Meeting deleted from DB!");

    return res.status(200).send('Meeting deleted successfully!');

  } catch (err) {
    console.error(" Delete Meeting Error:", err.response?.data || err.message);
    return res.status(500).send('Something went wrong!');
  }
});

app.post('/deal-webhook', async (req, res) => {
  try {
    await connectDB();

    const events = req.body;
    if (!Array.isArray(events)) return res.sendStatus(200);

    for (const event of events) {
      const { subscriptionType, portalId, objectId, propertyValue } = event;

      if (subscriptionType !== 'deal.propertyChange') continue;

      console.log(`Deal ${objectId} stage changed to: ${propertyValue} for portal: ${portalId}`);

      const tokenRecord = await Token.findOne({ hubspotPortalId: String(portalId) });
      console.log('tokenRecord:', tokenRecord ? 'found' : 'NOT FOUND');

      if (!tokenRecord || !tokenRecord.meethourAccessToken) {
        console.log('No token found for portal:', portalId);
        continue;
      }

      const hubspotToken = await refreshHubspotToken(portalId);

      const pipelineRes = await axios.get(
        'https://api.hubapi.com/crm/v3/pipelines/deals',
        { headers: { Authorization: `Bearer ${hubspotToken}` } }
      );

      const TRIGGER_LABELS = ['appointment scheduled', 'presentation scheduled'];
      let triggerStageIds = [];

      for (const pipeline of pipelineRes.data.results) {
        for (const stage of pipeline.stages) {
          if (TRIGGER_LABELS.includes(stage.label.toLowerCase())) {
            triggerStageIds.push(stage.id);
          }
        }
      }

      console.log('Trigger stage IDs:', triggerStageIds);
      console.log('Incoming propertyValue:', propertyValue);

      if (!triggerStageIds.includes(propertyValue)) {
        console.log('Stage not matched, skipping');
        continue;
      }

      const dealRes = await axios.get(
        `https://api.hubapi.com/crm/v3/objects/deals/${objectId}?associations=contacts&properties=dealname,dealstage,hubspot_owner_id,meeting_date,meeting_meridiem,meeting_time,timezone`,
        { headers: { Authorization: `Bearer ${hubspotToken}` } }
      );

      const deal = dealRes.data;
      const dealName = deal.properties.dealname;
      const ownerId = deal.properties.hubspot_owner_id;

      console.log('Raw meeting_date:', deal.properties.meeting_date);
      console.log('Raw meeting_time:', deal.properties.meeting_time);
      console.log('Raw meeting_meridiem:', deal.properties.meeting_meridiem);
      console.log('Raw timezone:', deal.properties.timezone);

      const contactId = deal.associations?.contacts?.results?.[0]?.id;
      if (!contactId) {
        console.log('No contact associated with deal');
        continue;
      }

      const contactRes = await axios.get(
        `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?properties=email,firstname,lastname`,
        { headers: { Authorization: `Bearer ${hubspotToken}` } }
      );
      const contact = contactRes.data.properties;

      let ownerName = 'Host';
      if (ownerId) {
        const ownerRes = await axios.get(
          `https://api.hubapi.com/crm/v3/owners/${ownerId}`,
          { headers: { Authorization: `Bearer ${hubspotToken}` } }
        );
        const owner = ownerRes.data;
        ownerName = `${owner.firstName || ''} ${owner.lastName || ''}`.trim();
      }

      const meeting_date = deal.properties.meeting_date;
      // CHANGE 1: dropdown value is already a clean string like "04:00", use as-is
      const meeting_time = deal.properties.meeting_time;
      const meeting_meridiem = deal.properties.meeting_meridiem;
      const timezone = deal.properties.timezone;

      console.log('meeting_date:', meeting_date);
      console.log('meeting_time:', meeting_time, meeting_meridiem);
      console.log('timezone:', timezone);

      const meetingPayload = {
        meeting_name: dealName || 'Demo Call',
        meeting_date,
        meeting_time,
        meeting_meridiem,
        timezone,
        passcode: generatePasscode(),
        attend: [{
          first_name: contact.firstname || '',
          last_name: contact.lastname || '',
          email: contact.email
        }],
        hostusers: tokenRecord.meethourUserId ? [Number(tokenRecord.meethourUserId)] : [],
        send_calendar_invite: 1
      };


      const meetingRes = await axios.post(
        'https://api.meethour.io/api/v1.2/meeting/schedulemeeting',

        meetingPayload,
        {
          headers: {
            Authorization: `Bearer ${tokenRecord.meethourAccessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('MeetHour raw:', JSON.stringify(meetingRes.data, null, 2));

      const meeting = meetingRes.data.data;
      console.log('Meeting created:', meeting.joinURL);

      await Meeting.create({
        hubspotMeetingId: `${portalId}-${objectId}-${Date.now()}`,
        hubspotPortalId: String(portalId),
        meethourMeetingId: meeting.meeting_id,
        meethourMeetingUrl: meeting.joinURL,
        meetingName: dealName || 'Demo Call',
        conferenceId: String(meeting.id)
      });
      console.log('Meeting saved to DB!');

      // CHANGE 2 & 3: log as engagement type MEETING so it shows in HubSpot Meetings tab
      const formattedTime = `${meeting_time} ${meeting_meridiem} (${timezone})`;
      const startTimestamp = new Date(`${meeting_date} ${meeting_time} ${meeting_meridiem}`).getTime();

      await axios.post(
        'https://api.hubspot.com/engagements/v1/engagements',
        {
          engagement: {
            active: true,
            ownerId: ownerId ? Number(ownerId) : undefined,
            type: 'MEETING',
            timestamp: startTimestamp || Date.now()
          },
          associations: {
            contactIds: [Number(contactId)],
            dealIds: [Number(objectId)]
          },
          metadata: {
            title: `${dealName} - MeetHour Meeting`,
            body: `<b>${ownerName} is inviting you to a scheduled meeting.</b><br><br>

            <b>Topic:</b> ${meeting.topic}<br>
            <b>Time:</b>${formattedTime}<br><br>
            <b>Join MeetHour:</b> ${meeting.joinURL}<br><br>
            <b>Meeting ID:</b> ${meeting.meeting_id}<br>
            <b>Passcode:</b> ${meeting.passcode}`
          }
        },
        {
          headers: {
            Authorization: `Bearer ${hubspotToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('Meeting engagement logged for deal:', objectId);
    }

    res.sendStatus(200);

  } catch (err) {
    console.error('Deal webhook error:', err.response?.data || err.message);
    res.sendStatus(200);
  }
});

//update meeting

app.post("/update-meeting", async (req, res) => {
  try {
    console.log("========== UPDATE MEETING ==========");
    console.log("BODY:", JSON.stringify(req.body, null, 2));

    await connectDB();

    const {
      portalId,
      conferenceId,
      topic,
      startTime,
      timezone,
    } = req.body;

    if (!portalId || !conferenceId) {
      return res.sendStatus(400);
    }

    const tokenRecord = await Token.findOne({
      hubspotPortalId: String(portalId),
    });

    if (!tokenRecord?.meethourAccessToken) {
      return res.sendStatus(404);
    }

    const meetingRecord = await Meeting.findOne({
      conferenceId: String(conferenceId),
    });

    if (!meetingRecord) {
      return res.sendStatus(404);
    }

    // base payload
    const editPayload = {
      meeting_id: meetingRecord.meethourMeetingId,
    };

    // topic changed
    if (topic) {
      editPayload.meeting_name = topic;
    }

    // date/time changed
    if (startTime) {
      const start = new Date(startTime);

      const istDate = new Date(
        start.toLocaleString("en-US", {
          timeZone: "Asia/Kolkata",
        })
      );

      const meeting_date = `${istDate.getFullYear()}-${String(
        istDate.getMonth() + 1
      ).padStart(2, "0")}-${String(istDate.getDate()).padStart(2, "0")}`;

      let hours = istDate.getHours();

      const minutes = istDate.getMinutes();

      const meeting_meridiem =
        hours >= 12 ? "PM" : "AM";

      hours = hours % 12 || 12;

      const meeting_time = `${String(hours).padStart(
        2,
        "0"
      )}:${String(minutes).padStart(2, "0")}`;

      editPayload.meeting_date = meeting_date;
      editPayload.meeting_time = meeting_time;
      editPayload.meeting_meridiem = meeting_meridiem;

      if (timezone) {
        editPayload.timezone =
          convertHubspotTimezone(timezone);
      }
    }

    console.log(
      "EDIT PAYLOAD:",
      JSON.stringify(editPayload, null, 2)
    );

    const response = await axios.post(
      "https://api.meethour.io/api/v1.2/meeting/editmeeting",
      editPayload,
      {
        headers: {
          Authorization: `Bearer ${tokenRecord.meethourAccessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(
      "MEETHOUR RESPONSE:",
      JSON.stringify(response.data, null, 2)
    );

    // DB update
    const updateData = {};

    if (topic) {
      updateData.meetingName = topic;
    }

    await Meeting.findOneAndUpdate(
      {
        conferenceId: String(conferenceId),
      },
      updateData
    );

    return res.sendStatus(204);
  } catch (err) {
    console.error(
      "UPDATE ERROR:",
      err.response?.data || err.message
    );

    return res.sendStatus(500);
  }
});

//localhost running @ 3000
if (process.env.NODE_ENV !== 'production') {
  app.listen(3000, () => console.log("Server running on port 3000"));
}

module.exports = app;
