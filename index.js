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
const refreshHubspotToken = async (
  portalId
) => {

  console.log(
    "REFRESHING TOKEN FOR PORTAL:",
    portalId
  );

  const tokenRecord =
    await Token.findOne({
      hubspotPortalId:
        String(portalId)
    });

  console.log(
    "TOKEN RECORD:"
  );

  console.log(tokenRecord);

  if (!tokenRecord) {
    throw new Error(
      `No token record found for portal ${portalId}`
    );
  }

  if (
    !tokenRecord.hubspotRefreshToken
  ) {

    throw new Error(
      "hubspotRefreshToken missing in DB"
    );
  }

  const response =
    await axios.post(
      "https://api.hubapi.com/oauth/v1/token",

      new URLSearchParams({

        grant_type:
          "refresh_token",

        client_id:
          process.env
            .HUBSPOT_CLIENT_ID,

        client_secret:
          process.env
            .HUBSPOT_CLIENT_SECRET,

        refresh_token:
          tokenRecord
            .hubspotRefreshToken
      }),

      {
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        }
      }
    );

  console.log(
    "REFRESH RESPONSE:"
  );

  console.log(
    JSON.stringify(
      response.data,
      null,
      2
    )
  );

  await Token.findOneAndUpdate(

    {
      hubspotPortalId:
        String(portalId)
    },

    {
      hubspotAccessToken:
        response.data.access_token,

      hubspotRefreshToken:
        response.data.refresh_token
    }
  );

  console.log(
    "TOKEN UPDATED SUCCESSFULLY"
  );

  return response.data.access_token;
};


//root
app.get('/', (req, res) => {
  res.send('Server is responding on meethourhubs.vercel.app !');
});


//calback
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

    // Creating Deal property 
    try {
      await axios.post(
        'https://api.hubapi.com/crm/v3/properties/deals/groups',
        { name: 'meet_hour', label: 'Meet Hour', displayOrder: 1 },
        { headers: { Authorization: `Bearer ${hubspotAccessToken}`, 'Content-Type': 'application/json' } }
      );
      console.log('Property group created');
    } catch (err) {
      console.log('Group skipped (may exist):', err.response?.data?.message);
    }

    // Creating Deal properties 
    const dealProperties = [
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
        options: ["Etc/GMT+12", "Pacific/Midway", "Pacific/Niue", "America/Adak", "US/Aleutian", "US/Hawaii", "Pacific/Honolulu", "Pacific/Tahiti", "Pacific/Rarotonga", "Pacific/Marquesas", "America/Anchorage", "America/Sitka", "US/Alaska", "America/Nome", "America/Metlakatla", "America/Yakutat", "America/Juneau", "America/Vancouver", "America/Tijuana", "America/Los_Angeles", "Pacific/Pitcairn", "America/Yellowknife", "America/Whitehorse", "America/Inuvik", "America/Phoenix", "Mexico/BajaSur", "America/Hermosillo", "America/Dawson_Creek", "America/Denver", "America/Mazatlan", "America/Ojinaga", "America/Chihuahua", "US/Arizona", "America/Creston", "America/Dawson", "America/Edmonton", "America/Boise", "America/Cambridge_Bay", "Canada/Saskatchewan", "America/Winnipeg", "America/Indiana/Knox", "America/Rainy_River", "America/Rankin_Inlet", "America/Resolute", "America/Indiana/Tell_City", "America/Tegucigalpa", "America/Swift_Current", "America/Regina", "Pacific/Easter", "America/El_Salvador", "America/Costa_Rica", "America/Matamoros", "Pacific/Johnston", "America/North_Dakota/Beulah", "America/North_Dakota/Center", "US/Central", "America/Bahia_Banderas", "America/Mexico_City", "America/Merida", "America/Menominee", "America/North_Dakota/New_Salem", "America/Managua", "Pacific/Galapagos", "America/Guatemala", "Mexico/General", "US/East-Indiana", "America/Belize", "US/Michigan", "America/Indiana/Vincennes", "America/Indiana/Vevay", "America/Toronto", "America/Atikokan", "America/Nipigon", "America/Thunder_Bay", "America/Rio_Branco", "America/Port-au-Prince", "America/Panama", "America/Indiana/Winamac", "America/Indiana/Marengo", "America/New_York", "America/Nassau", "America/Kentucky/Monticello", "America/Monterrey", "America/Kentucky/Louisville", "America/Louisville", "America/Knox_IN", "America/Lima", "America/Jamaica", "US/Eastern", "US/Indiana-Starke", "America/Iqaluit", "America/Indiana/Indianapolis", "America/Indianapolis", "America/Havana", "America/Guayaquil", "America/Cayman", "America/Eirunepe", "America/Detroit", "America/Grand_Turk", "America/Chicago", "America/Cancun", "Atlantic/Bermuda", "America/Curacao", "America/Pangnirtung", "America/Anguilla", "America/Santo_Domingo", "America/Santiago", "America/La_Paz", "America/Puerto_Rico", "America/Antigua", "America/Grenada", "America/St_Thomas", "America/Dominica", "America/Tortola", "America/Porto_Velho", "America/Aruba", "America/Thule", "America/Moncton", "America/Marigot", "America/Manaus", "America/Blanc-Sablon", "America/Guadeloupe", "America/Goose_Bay", "America/Kralendijk", "America/St_Vincent", "America/St_Barthelemy", "America/Guyana", "America/Martinique", "America/Lower_Princes", "America/Cuiaba", "America/Port_of_Spain", "America/St_Lucia", "America/Campo_Grande", "America/Barbados", "America/Montserrat", "America/Bogota", "America/Boa_Vista", "America/St_Kitts", "America/Asuncion", "America/Halifax", "America/Caracas", "America/St_Johns", "Canada/Newfoundland", "America/Argentina/Ushuaia", "America/Sao_Paulo", "America/Santarem", "America/Argentina/Jujuy", "America/Jujuy", "America/Argentina/Tucuman", "America/Argentina/San_Luis", "America/Argentina/San_Juan", "America/Argentina/Catamarca", "America/Bahia", "America/Argentina/Salta", "America/Miquelon", "America/Recife", "America/Paramaribo", "America/Araguaina", "America/Godthab", "America/Montevideo", "America/Argentina/Mendoza", "America/Mendoza", "America/Maceio", "America/Argentina/Buenos_Aires", "America/Buenos_Aires", "America/Belem", "Antarctica/Palmer", "Antarctica/Rothera", "Atlantic/Stanley", "America/Cayenne", "America/Noronha", "Atlantic/South_Georgia", "Atlantic/Azores", "America/Scoresbysund", "Atlantic/Cape_Verde", "America/Danmarkshavn", "Atlantic/St_Helena", "Atlantic/Faeroe", "Etc/Greenwich", "Africa/Abidjan", "Africa/Accra", "Atlantic/Faroe", "Antarctica/Troll", "Africa/Bamako", "Africa/Bissau", "Africa/Conakry", "Africa/Casablanca", "Africa/Dakar", "Europe/Isle_of_Man", "Europe/Dublin", "Africa/Freetown", "Atlantic/Madeira", "Africa/El_Aaiun", "Atlantic/Canary", "Europe/Jersey", "Europe/Lisbon", "Africa/Lome", "Europe/London", "UTC", "Africa/Monrovia", "Africa/Nouakchott", "Africa/Ouagadougou", "Africa/Timbuktu", "Atlantic/Reykjavik", "Europe/Guernsey", "Africa/Sao_Tome", "Europe/Oslo", "Europe/Paris", "Europe/Podgorica", "Europe/Prague", "Europe/Rome", "Europe/Sarajevo", "Europe/San_Marino", "Africa/Algiers", "Europe/Amsterdam", "Europe/Andorra", "Africa/Malabo", "Europe/Belgrade", "Europe/Berlin", "Europe/Malta", "Europe/Bratislava", "Africa/Brazzaville", "Europe/Brussels", "Europe/Budapest", "Africa/Ceuta", "Europe/Copenhagen", "Africa/Porto-Novo", "Africa/Douala", "Europe/Gibraltar", "Africa/Kinshasa", "Africa/Lagos", "Africa/Libreville", "Europe/Ljubljana", "Arctic/Longyearbyen", "Africa/Luanda", "Europe/Luxembourg", "Europe/Madrid", "Europe/Monaco", "Africa/Ndjamena", "Africa/Niamey", "Europe/Vaduz", "Europe/Skopje", "Europe/Stockholm", "Europe/Tirane", "Africa/Tunis", "Europe/Vatican", "Europe/Vienna", "Europe/Warsaw", "Africa/Windhoek", "Europe/Zagreb", "Europe/Zurich", "Africa/Bangui", "Europe/Riga", "Asia/Damascus", "Asia/Amman", "Europe/Athens", "Asia/Beirut", "Europe/Bucharest", "Africa/Bujumbura", "Africa/Cairo", "Africa/Johannesburg", "Europe/Chisinau", "Europe/Tiraspol", "Asia/Hebron", "Africa/Gaborone", "Asia/Gaza", "Africa/Harare", "Europe/Helsinki", "Asia/Jerusalem", "Africa/Juba", "Africa/Khartoum", "Africa/Kigali", "Europe/Kiev", "Europe/Kaliningrad", "Africa/Blantyre", "Africa/Lubumbashi", "Europe/Zaporozhye", "Africa/Lusaka", "Africa/Mbabane", "Africa/Maputo", "Europe/Mariehamn", "Africa/Maseru", "Asia/Nicosia", "Europe/Sofia", "Europe/Tallinn", "Africa/Tripoli", "Europe/Uzhgorod", "Europe/Vilnius", "Africa/Mogadishu", "Europe/Moscow", "Asia/Kuwait", "Indian/Antananarivo", "Antarctica/Syowa", "Africa/Asmara", "Asia/Baghdad", "Africa/Dar_es_Salaam", "Africa/Djibouti", "Asia/Qatar", "Israel", "Europe/Istanbul", "Turkey", "Africa/Kampala", "Indian/Mayotte", "Asia/Bahrain", "Europe/Minsk", "Indian/Comoro", "Africa/Nairobi", "Africa/Addis_Ababa", "Asia/Riyadh", "Asia/Aden", "Europe/Simferopol", "Asia/Istanbul", "Europe/Volgograd", "Asia/Tehran", "Europe/Samara", "Asia/Baku", "Asia/Dubai", "Canada/Atlantic", "Asia/Muscat", "Indian/Mauritius", "Indian/Reunion", "Asia/Tbilisi", "Indian/Mahe", "Asia/Yerevan", "Asia/Kabul", "Asia/Aqtobe", "Antarctica/Mawson", "Asia/Ashgabat", "Asia/Ashkhabad", "Asia/Dushanbe", "Asia/Karachi", "Asia/Qyzylorda", "Indian/Maldives", "Asia/Oral", "Asia/Aqtau", "Asia/Tashkent", "Asia/Yekaterinburg", "Asia/Colombo", "Asia/Dacca", "Asia/Calcutta", "Asia/Kolkata", "Asia/Katmandu", "Asia/Kathmandu", "Asia/Almaty", "Antarctica/Vostok", "Asia/Bishkek", "Indian/Chagos", "Asia/Dhaka", "Asia/Omsk", "Asia/Thimbu", "Asia/Thimphu", "Asia/Urumqi", "Indian/Cocos", "Asia/Rangoon", "Antarctica/Casey", "Antarctica/Davis", "Asia/Bangkok", "Indian/Christmas", "Asia/Ho_Chi_Minh", "Asia/Jakarta", "Asia/Hovd", "Asia/Krasnoyarsk", "Asia/Novokuznetsk", "Asia/Novosibirsk", "Asia/Phnom_Penh", "US/Mountain", "Asia/Pontianak", "Asia/Vientiane", "Asia/Brunei", "Asia/Choibalsan", "Asia/Hong_Kong", "Asia/Irkutsk", "Asia/Kuala_Lumpur", "Asia/Shanghai", "Asia/Kuching", "US/Pacific", "Asia/Macao", "Asia/Macau", "Asia/Makassar", "Australia/Perth", "Asia/Manila", "Singapore", "Asia/Singapore", "Australia/Sydney", "Asia/Taipei", "Asia/Ulaanbaatar", "Australia/Eucla", "Asia/Jayapura", "Asia/Chita", "Asia/Dili", "Pacific/Palau", "Asia/Khandyga", "Asia/Pyongyang", "Asia/Seoul", "Asia/Tokyo", "Asia/Yakutsk", "Australia/Broken_Hill", "Australia/Adelaide", "Australia/Darwin", "Australia/Lindeman", "Australia/Brisbane", "Australia/Canberra", "Antarctica/DumontDUrville", "Pacific/Yap", "Pacific/Guam", "Australia/Hobart", "Pacific/Port_Moresby", "Pacific/Saipan", "Australia/Currie", "Antarctica/Macquarie", "Asia/Vladivostok", "Pacific/Chuuk", "Australia/Lord_Howe", "Australia/LHI", "Pacific/Guadalcanal", "Pacific/Gambier", "Pacific/Norfolk", "Pacific/Pohnpei", "Asia/Magadan", "Asia/Srednekolymsk", "Pacific/Noumea", "Pacific/Pago_Pago", "Pacific/Bougainville", "Pacific/Efate", "Pacific/Kosrae", "Asia/Sakhalin", "Asia/Anadyr", "Antarctica/McMurdo", "Pacific/Auckland", "Kwajalein", "Pacific/Funafuti", "Pacific/Kwajalein", "Pacific/Majuro", "Pacific/Wallis", "Asia/Kamchatka", "Pacific/Fiji", "Pacific/Tarawa", "Pacific/Wake", "Pacific/Nauru", "Pacific/Chatham", "Pacific/Apia", "Pacific/Samoa", "Pacific/Fakaofo", "Pacific/Tongatapu", "Pacific/Enderbury", "Pacific/Kiritimati"].map((tz, index) => ({ label: tz, value: tz, displayOrder: index }))
      }
    ];

    for (const prop of dealProperties) {
      try {
        await axios.post(
          'https://api.hubapi.com/crm/v3/properties/deals',
          prop,
          { headers: { Authorization: `Bearer ${hubspotAccessToken}`, 'Content-Type': 'application/json' } }
        );
        console.log('Deal property created:', prop.name);
      } catch (err) {
        console.log('Deal property skipped (may exist):', prop.name, err.response?.data?.message);
      }
    }

    // Creating Contact Properties For Form on installation
    const contactProperties = [
      {
        name: 'meeting_name',
        label: 'Meeting Name',
        type: 'string',
        fieldType: 'text',
        groupName: 'contactinformation',
        displayOrder: 0
      },
      {
        name: 'meeting_date',
        label: 'Meeting Date',
        type: 'date',
        fieldType: 'date',
        groupName: 'contactinformation',
        displayOrder: 1
      },
      {
        name: 'meeting_time',
        label: 'Meeting Time',
        type: 'enumeration',
        fieldType: 'select',
        groupName: 'contactinformation',
        displayOrder: 2,
        options: [
          { label: '12:00', value: '12:00', displayOrder: 0 },
          { label: '12:30', value: '12:30', displayOrder: 1 },
          { label: '01:00', value: '01:00', displayOrder: 2 },
          { label: '01:30', value: '01:30', displayOrder: 3 },
          { label: '02:00', value: '02:00', displayOrder: 4 },
          { label: '02:30', value: '02:30', displayOrder: 5 },
          { label: '03:00', value: '03:00', displayOrder: 6 },
          { label: '03:30', value: '03:30', displayOrder: 7 },
          { label: '04:00', value: '04:00', displayOrder: 8 },
          { label: '04:30', value: '04:30', displayOrder: 9 },
          { label: '05:00', value: '05:00', displayOrder: 10 },
          { label: '05:30', value: '05:30', displayOrder: 11 },
          { label: '06:00', value: '06:00', displayOrder: 12 },
          { label: '06:30', value: '06:30', displayOrder: 13 },
          { label: '07:00', value: '07:00', displayOrder: 14 },
          { label: '07:30', value: '07:30', displayOrder: 15 },
          { label: '08:00', value: '08:00', displayOrder: 16 },
          { label: '08:30', value: '08:30', displayOrder: 17 },
          { label: '09:00', value: '09:00', displayOrder: 18 },
          { label: '09:30', value: '09:30', displayOrder: 19 },
          { label: '10:00', value: '10:00', displayOrder: 20 },
          { label: '10:30', value: '10:30', displayOrder: 21 },
          { label: '11:00', value: '11:00', displayOrder: 22 },
          { label: '11:30', value: '11:30', displayOrder: 23 }
        ]
      },
      {
        name: 'meeting_meridiem',
        label: 'Meeting Meridiem',
        type: 'enumeration',
        fieldType: 'select',
        groupName: 'contactinformation',
        displayOrder: 3,
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
        groupName: 'contactinformation',
        displayOrder: 4,
        options: ["Etc/GMT+12", "Pacific/Midway", "Pacific/Niue", "America/Adak", "US/Aleutian", "US/Hawaii", "Pacific/Honolulu", "Pacific/Tahiti", "Pacific/Rarotonga", "Pacific/Marquesas", "America/Anchorage", "America/Sitka", "US/Alaska", "America/Nome", "America/Metlakatla", "America/Yakutat", "America/Juneau", "America/Vancouver", "America/Tijuana", "America/Los_Angeles", "Pacific/Pitcairn", "America/Yellowknife", "America/Whitehorse", "America/Inuvik", "America/Phoenix", "Mexico/BajaSur", "America/Hermosillo", "America/Dawson_Creek", "America/Denver", "America/Mazatlan", "America/Ojinaga", "America/Chihuahua", "US/Arizona", "America/Creston", "America/Dawson", "America/Edmonton", "America/Boise", "America/Cambridge_Bay", "Canada/Saskatchewan", "America/Winnipeg", "America/Indiana/Knox", "America/Rainy_River", "America/Rankin_Inlet", "America/Resolute", "America/Indiana/Tell_City", "America/Tegucigalpa", "America/Swift_Current", "America/Regina", "Pacific/Easter", "America/El_Salvador", "America/Costa_Rica", "America/Matamoros", "Pacific/Johnston", "America/North_Dakota/Beulah", "America/North_Dakota/Center", "US/Central", "America/Bahia_Banderas", "America/Mexico_City", "America/Merida", "America/Menominee", "America/North_Dakota/New_Salem", "America/Managua", "Pacific/Galapagos", "America/Guatemala", "Mexico/General", "US/East-Indiana", "America/Belize", "US/Michigan", "America/Indiana/Vincennes", "America/Indiana/Vevay", "America/Toronto", "America/Atikokan", "America/Nipigon", "America/Thunder_Bay", "America/Rio_Branco", "America/Port-au-Prince", "America/Panama", "America/Indiana/Winamac", "America/Indiana/Marengo", "America/New_York", "America/Nassau", "America/Kentucky/Monticello", "America/Monterrey", "America/Kentucky/Louisville", "America/Louisville", "America/Knox_IN", "America/Lima", "America/Jamaica", "US/Eastern", "US/Indiana-Starke", "America/Iqaluit", "America/Indiana/Indianapolis", "America/Indianapolis", "America/Havana", "America/Guayaquil", "America/Cayman", "America/Eirunepe", "America/Detroit", "America/Grand_Turk", "America/Chicago", "America/Cancun", "Atlantic/Bermuda", "America/Curacao", "America/Pangnirtung", "America/Anguilla", "America/Santo_Domingo", "America/Santiago", "America/La_Paz", "America/Puerto_Rico", "America/Antigua", "America/Grenada", "America/St_Thomas", "America/Dominica", "America/Tortola", "America/Porto_Velho", "America/Aruba", "America/Thule", "America/Moncton", "America/Marigot", "America/Manaus", "America/Blanc-Sablon", "America/Guadeloupe", "America/Goose_Bay", "America/Kralendijk", "America/St_Vincent", "America/St_Barthelemy", "America/Guyana", "America/Martinique", "America/Lower_Princes", "America/Cuiaba", "America/Port_of_Spain", "America/St_Lucia", "America/Campo_Grande", "America/Barbados", "America/Montserrat", "America/Bogota", "America/Boa_Vista", "America/St_Kitts", "America/Asuncion", "America/Halifax", "America/Caracas", "America/St_Johns", "Canada/Newfoundland", "America/Argentina/Ushuaia", "America/Sao_Paulo", "America/Santarem", "America/Argentina/Jujuy", "America/Jujuy", "America/Argentina/Tucuman", "America/Argentina/San_Luis", "America/Argentina/San_Juan", "America/Argentina/Catamarca", "America/Bahia", "America/Argentina/Salta", "America/Miquelon", "America/Recife", "America/Paramaribo", "America/Araguaina", "America/Godthab", "America/Montevideo", "America/Argentina/Mendoza", "America/Mendoza", "America/Maceio", "America/Argentina/Buenos_Aires", "America/Buenos_Aires", "America/Belem", "Antarctica/Palmer", "Antarctica/Rothera", "Atlantic/Stanley", "America/Cayenne", "America/Noronha", "Atlantic/South_Georgia", "Atlantic/Azores", "America/Scoresbysund", "Atlantic/Cape_Verde", "America/Danmarkshavn", "Atlantic/St_Helena", "Atlantic/Faeroe", "Etc/Greenwich", "Africa/Abidjan", "Africa/Accra", "Atlantic/Faroe", "Antarctica/Troll", "Africa/Bamako", "Africa/Bissau", "Africa/Conakry", "Africa/Casablanca", "Africa/Dakar", "Europe/Isle_of_Man", "Europe/Dublin", "Africa/Freetown", "Atlantic/Madeira", "Africa/El_Aaiun", "Atlantic/Canary", "Europe/Jersey", "Europe/Lisbon", "Africa/Lome", "Europe/London", "UTC", "Africa/Monrovia", "Africa/Nouakchott", "Africa/Ouagadougou", "Africa/Timbuktu", "Atlantic/Reykjavik", "Europe/Guernsey", "Africa/Sao_Tome", "Europe/Oslo", "Europe/Paris", "Europe/Podgorica", "Europe/Prague", "Europe/Rome", "Europe/Sarajevo", "Europe/San_Marino", "Africa/Algiers", "Europe/Amsterdam", "Europe/Andorra", "Africa/Malabo", "Europe/Belgrade", "Europe/Berlin", "Europe/Malta", "Europe/Bratislava", "Africa/Brazzaville", "Europe/Brussels", "Europe/Budapest", "Africa/Ceuta", "Europe/Copenhagen", "Africa/Porto-Novo", "Africa/Douala", "Europe/Gibraltar", "Africa/Kinshasa", "Africa/Lagos", "Africa/Libreville", "Europe/Ljubljana", "Arctic/Longyearbyen", "Africa/Luanda", "Europe/Luxembourg", "Europe/Madrid", "Europe/Monaco", "Africa/Ndjamena", "Africa/Niamey", "Europe/Vaduz", "Europe/Skopje", "Europe/Stockholm", "Europe/Tirane", "Africa/Tunis", "Europe/Vatican", "Europe/Vienna", "Europe/Warsaw", "Africa/Windhoek", "Europe/Zagreb", "Europe/Zurich", "Africa/Bangui", "Europe/Riga", "Asia/Damascus", "Asia/Amman", "Europe/Athens", "Asia/Beirut", "Europe/Bucharest", "Africa/Bujumbura", "Africa/Cairo", "Africa/Johannesburg", "Europe/Chisinau", "Europe/Tiraspol", "Asia/Hebron", "Africa/Gaborone", "Asia/Gaza", "Africa/Harare", "Europe/Helsinki", "Asia/Jerusalem", "Africa/Juba", "Africa/Khartoum", "Africa/Kigali", "Europe/Kiev", "Europe/Kaliningrad", "Africa/Blantyre", "Africa/Lubumbashi", "Europe/Zaporozhye", "Africa/Lusaka", "Africa/Mbabane", "Africa/Maputo", "Europe/Mariehamn", "Africa/Maseru", "Asia/Nicosia", "Europe/Sofia", "Europe/Tallinn", "Africa/Tripoli", "Europe/Uzhgorod", "Europe/Vilnius", "Africa/Mogadishu", "Europe/Moscow", "Asia/Kuwait", "Indian/Antananarivo", "Antarctica/Syowa", "Africa/Asmara", "Asia/Baghdad", "Africa/Dar_es_Salaam", "Africa/Djibouti", "Asia/Qatar", "Israel", "Europe/Istanbul", "Turkey", "Africa/Kampala", "Indian/Mayotte", "Asia/Bahrain", "Europe/Minsk", "Indian/Comoro", "Africa/Nairobi", "Africa/Addis_Ababa", "Asia/Riyadh", "Asia/Aden", "Europe/Simferopol", "Asia/Istanbul", "Europe/Volgograd", "Asia/Tehran", "Europe/Samara", "Asia/Baku", "Asia/Dubai", "Canada/Atlantic", "Asia/Muscat", "Indian/Mauritius", "Indian/Reunion", "Asia/Tbilisi", "Indian/Mahe", "Asia/Yerevan", "Asia/Kabul", "Asia/Aqtobe", "Antarctica/Mawson", "Asia/Ashgabat", "Asia/Ashkhabad", "Asia/Dushanbe", "Asia/Karachi", "Asia/Qyzylorda", "Indian/Maldives", "Asia/Oral", "Asia/Aqtau", "Asia/Tashkent", "Asia/Yekaterinburg", "Asia/Colombo", "Asia/Dacca", "Asia/Calcutta", "Asia/Kolkata", "Asia/Katmandu", "Asia/Kathmandu", "Asia/Almaty", "Antarctica/Vostok", "Asia/Bishkek", "Indian/Chagos", "Asia/Dhaka", "Asia/Omsk", "Asia/Thimbu", "Asia/Thimphu", "Asia/Urumqi", "Indian/Cocos", "Asia/Rangoon", "Antarctica/Casey", "Antarctica/Davis", "Asia/Bangkok", "Indian/Christmas", "Asia/Ho_Chi_Minh", "Asia/Jakarta", "Asia/Hovd", "Asia/Krasnoyarsk", "Asia/Novokuznetsk", "Asia/Novosibirsk", "Asia/Phnom_Penh", "US/Mountain", "Asia/Pontianak", "Asia/Vientiane", "Asia/Brunei", "Asia/Choibalsan", "Asia/Hong_Kong", "Asia/Irkutsk", "Asia/Kuala_Lumpur", "Asia/Shanghai", "Asia/Kuching", "US/Pacific", "Asia/Macao", "Asia/Macau", "Asia/Makassar", "Australia/Perth", "Asia/Manila", "Singapore", "Asia/Singapore", "Australia/Sydney", "Asia/Taipei", "Asia/Ulaanbaatar", "Australia/Eucla", "Asia/Jayapura", "Asia/Chita", "Asia/Dili", "Pacific/Palau", "Asia/Khandyga", "Asia/Pyongyang", "Asia/Seoul", "Asia/Tokyo", "Asia/Yakutsk", "Australia/Broken_Hill", "Australia/Adelaide", "Australia/Darwin", "Australia/Lindeman", "Australia/Brisbane", "Australia/Canberra", "Antarctica/DumontDUrville", "Pacific/Yap", "Pacific/Guam", "Australia/Hobart", "Pacific/Port_Moresby", "Pacific/Saipan", "Australia/Currie", "Antarctica/Macquarie", "Asia/Vladivostok", "Pacific/Chuuk", "Australia/Lord_Howe", "Australia/LHI", "Pacific/Guadalcanal", "Pacific/Gambier", "Pacific/Norfolk", "Pacific/Pohnpei", "Asia/Magadan", "Asia/Srednekolymsk", "Pacific/Noumea", "Pacific/Pago_Pago", "Pacific/Bougainville", "Pacific/Efate", "Pacific/Kosrae", "Asia/Sakhalin", "Asia/Anadyr", "Antarctica/McMurdo", "Pacific/Auckland", "Kwajalein", "Pacific/Funafuti", "Pacific/Kwajalein", "Pacific/Majuro", "Pacific/Wallis", "Asia/Kamchatka", "Pacific/Fiji", "Pacific/Tarawa", "Pacific/Wake", "Pacific/Nauru", "Pacific/Chatham", "Pacific/Apia", "Pacific/Samoa", "Pacific/Fakaofo", "Pacific/Tongatapu", "Pacific/Enderbury", "Pacific/Kiritimati"].map((tz, index) => ({ label: tz, value: tz, displayOrder: index }))
      }
    ];

    for (const prop of contactProperties) {
      try {
        await axios.post(
          'https://api.hubapi.com/crm/v3/properties/contacts',
          prop,
          { headers: { Authorization: `Bearer ${hubspotAccessToken}`, 'Content-Type': 'application/json' } }
        );
        console.log('Contact property created:', prop.name);
      } catch (err) {
        console.log('Contact property skipped (may exist):', prop.name, err.response?.data?.message);
      }
    }

    // Creating Form
    let formId = null;
    try {
      formRes = await axios.post(
        'https://api.hubapi.com/marketing/v3/forms',
        {
          name: 'MeetHour Meeting Scheduler',
          formType: 'hubspot',
          archived: false,
          createdAt: new Date().toISOString(),
          configuration: {
            allowLinkToResetKnownValues: false,
            archivable: true,
            cloneable: false,
            createNewContactForNewEmail: true,
            editable: true,
            recaptchaEnabled: false,
            notifyContactOwner: false,
            prePopulateKnownValues: true,
            language: 'en',
            notifyRecipients: [],
            postSubmitAction: {
              type: 'thank_you',
              value: 'Thank you! Your meeting has been scheduled.'
            },
            lifecycleStages: []
          },
          displayOptions: {
            renderRawHtml: false,
            submitButtonText: 'Schedule Meeting',
            theme: 'default_style',
            style: {
              backgroundWidth: '100%',
              fontFamily: 'Arial',
              helpTextColor: '#7C98B6',
              helpTextSize: '14px',
              labelTextColor: '#33475B',
              labelTextSize: '14px',
              legalConsentTextColor: '#33475B',
              legalConsentTextSize: '14px',
              submitAlignment: 'left',
              submitColor: '#FF7A59',
              submitFontColor: '#FFFFFF',
              submitSize: '12px'
            }
          },
          fieldGroups: [
            {
              fields: [{
                name: 'firstname',
                label: 'First Name',
                objectTypeId: '0-1',
                fieldType: 'single_line_text',
                required: true,
                hidden: false,
                dependentFields: [],
                validation: { blockedEmailDomains: [], useDefaultBlockList: false }
              }]
            },
            {
              fields: [{
                name: 'lastname',
                label: 'Last Name',
                objectTypeId: '0-1',
                fieldType: 'single_line_text',
                required: true,
                hidden: false,
                dependentFields: [],
                validation: { blockedEmailDomains: [], useDefaultBlockList: false }
              }]
            },
            {
              fields: [{
                name: 'email',
                label: 'Email',
                objectTypeId: '0-1',
                fieldType: 'email',
                required: true,
                hidden: false,
                dependentFields: [],
                validation: { blockedEmailDomains: [], useDefaultBlockList: false }
              }]
            },
            {
              fields: [{
                name: 'meeting_name',
                label: 'Meeting Name',
                objectTypeId: '0-1',
                fieldType: 'single_line_text',
                required: true,
                hidden: false,
                dependentFields: [],
                validation: { blockedEmailDomains: [], useDefaultBlockList: false }
              }]
            },
            {
              fields: [{
                name: 'meeting_date',
                label: 'Meeting Date',
                objectTypeId: '0-1',
                fieldType: 'date',
                required: true,
                fieldType: 'datepicker',
                hidden: false,
                dependentFields: [],
                validation: { blockedEmailDomains: [], useDefaultBlockList: false }
              }]
            },
            {
              fields: [{
                name: 'meeting_time',
                label: 'Meeting Time',
                objectTypeId: '0-1',
                fieldType: 'dropdown',
                required: true,
                hidden: false,
                dependentFields: [],
                options: [
                  { label: '12:00', value: '12:00', displayOrder: 0 },
                  { label: '12:30', value: '12:30', displayOrder: 1 },
                  { label: '01:00', value: '01:00', displayOrder: 2 },
                  { label: '01:30', value: '01:30', displayOrder: 3 },
                  { label: '02:00', value: '02:00', displayOrder: 4 },
                  { label: '02:30', value: '02:30', displayOrder: 5 },
                  { label: '03:00', value: '03:00', displayOrder: 6 },
                  { label: '03:30', value: '03:30', displayOrder: 8 },
                  { label: '04:00', value: '04:00', displayOrder: 9 },
                  { label: '04:30', value: '04:30', displayOrder: 10 },
                  { label: '05:00', value: '05:00', displayOrder: 11 },
                  { label: '05:30', value: '05:30', displayOrder: 12 },
                  { label: '06:00', value: '06:00', displayOrder: 13 },
                  { label: '06:30', value: '06:30', displayOrder: 14 },
                  { label: '07:00', value: '07:00', displayOrder: 15 },
                  { label: '07:30', value: '07:30', displayOrder: 16 },
                  { label: '08:00', value: '08:00', displayOrder: 17 },
                  { label: '08:30', value: '08:30', displayOrder: 18 },
                  { label: '09:00', value: '09:00', displayOrder: 19 },
                  { label: '09:30', value: '09:30', displayOrder: 20 },
                  { label: '10:00', value: '10:00', displayOrder: 21 },
                  { label: '10:30', value: '10:30', displayOrder: 22 },
                  { label: '11:00', value: '11:00', displayOrder: 23 },
                  { label: '11:30', value: '11:30', displayOrder: 24 },
                ],
                validation: { blockedEmailDomains: [], useDefaultBlockList: false }
              }]
            },
            {
              fields: [{
                name: 'meeting_meridiem',
                label: 'AM/PM',
                objectTypeId: '0-1',
                fieldType: 'dropdown',
                required: true,
                hidden: false,
                dependentFields: [],
                options: [
                  { label: 'AM', value: 'AM', displayOrder: 0 },
                  { label: 'PM', value: 'PM', displayOrder: 1 }
                ],
                validation: { blockedEmailDomains: [], useDefaultBlockList: false }
              }]
            },
            {
              fields: [{
                name: 'timezone',
                label: 'Timezone',
                objectTypeId: '0-1',
                fieldType: 'dropdown',
                required: true,
                hidden: false,
                dependentFields: [],
                options: [
                  "Etc/GMT+12", "Pacific/Midway", "Pacific/Niue", "America/Adak", "US/Aleutian", "US/Hawaii", "Pacific/Honolulu", "Pacific/Tahiti", "Pacific/Rarotonga", "Pacific/Marquesas", "America/Anchorage", "America/Sitka", "US/Alaska", "America/Nome", "America/Metlakatla", "America/Yakutat", "America/Juneau", "America/Vancouver", "America/Tijuana", "America/Los_Angeles", "Pacific/Pitcairn", "America/Yellowknife", "America/Whitehorse", "America/Inuvik", "America/Phoenix", "Mexico/BajaSur", "America/Hermosillo", "America/Dawson_Creek", "America/Denver", "America/Mazatlan", "America/Ojinaga", "America/Chihuahua", "US/Arizona", "America/Creston", "America/Dawson", "America/Edmonton", "America/Boise", "America/Cambridge_Bay", "Canada/Saskatchewan", "America/Winnipeg", "America/Indiana/Knox", "America/Rainy_River", "America/Rankin_Inlet", "America/Resolute", "America/Indiana/Tell_City", "America/Tegucigalpa", "America/Swift_Current", "America/Regina", "Pacific/Easter", "America/El_Salvador", "America/Costa_Rica", "America/Matamoros", "Pacific/Johnston", "America/North_Dakota/Beulah", "America/North_Dakota/Center", "US/Central", "America/Bahia_Banderas", "America/Mexico_City", "America/Merida", "America/Menominee", "America/North_Dakota/New_Salem", "America/Managua", "Pacific/Galapagos", "America/Guatemala", "Mexico/General", "US/East-Indiana", "America/Belize", "US/Michigan", "America/Indiana/Vincennes", "America/Indiana/Vevay", "America/Toronto", "America/Atikokan", "America/Nipigon", "America/Thunder_Bay", "America/Rio_Branco", "America/Port-au-Prince", "America/Panama", "America/Indiana/Winamac", "America/Indiana/Marengo", "America/New_York", "America/Nassau", "America/Kentucky/Monticello", "America/Monterrey", "America/Kentucky/Louisville", "America/Louisville", "America/Knox_IN", "America/Lima", "America/Jamaica", "US/Eastern", "US/Indiana-Starke", "America/Iqaluit", "America/Indiana/Indianapolis", "America/Indianapolis", "America/Havana", "America/Guayaquil", "America/Cayman", "America/Eirunepe", "America/Detroit", "America/Grand_Turk", "America/Chicago", "America/Cancun", "Atlantic/Bermuda", "America/Curacao", "America/Pangnirtung", "America/Anguilla", "America/Santo_Domingo", "America/Santiago", "America/La_Paz", "America/Puerto_Rico", "America/Antigua", "America/Grenada", "America/St_Thomas", "America/Dominica", "America/Tortola", "America/Porto_Velho", "America/Aruba", "America/Thule", "America/Moncton", "America/Marigot", "America/Manaus", "America/Blanc-Sablon", "America/Guadeloupe", "America/Goose_Bay", "America/Kralendijk", "America/St_Vincent", "America/St_Barthelemy", "America/Guyana", "America/Martinique", "America/Lower_Princes", "America/Cuiaba", "America/Port_of_Spain", "America/St_Lucia", "America/Campo_Grande", "America/Barbados", "America/Montserrat", "America/Bogota", "America/Boa_Vista", "America/St_Kitts", "America/Asuncion", "America/Halifax", "America/Caracas", "America/St_Johns", "Canada/Newfoundland", "America/Argentina/Ushuaia", "America/Sao_Paulo", "America/Santarem", "America/Argentina/Jujuy", "America/Jujuy", "America/Argentina/Tucuman", "America/Argentina/San_Luis", "America/Argentina/San_Juan", "America/Argentina/Catamarca", "America/Bahia", "America/Argentina/Salta", "America/Miquelon", "America/Recife", "America/Paramaribo", "America/Araguaina", "America/Godthab", "America/Montevideo", "America/Argentina/Mendoza", "America/Mendoza", "America/Maceio", "America/Argentina/Buenos_Aires", "America/Buenos_Aires", "America/Belem", "Antarctica/Palmer", "Antarctica/Rothera", "Atlantic/Stanley", "America/Cayenne", "America/Noronha", "Atlantic/South_Georgia", "Atlantic/Azores", "America/Scoresbysund", "Atlantic/Cape_Verde", "America/Danmarkshavn", "Atlantic/St_Helena", "Atlantic/Faeroe", "Etc/Greenwich", "Africa/Abidjan", "Africa/Accra", "Atlantic/Faroe", "Antarctica/Troll", "Africa/Bamako", "Africa/Bissau", "Africa/Conakry", "Africa/Casablanca", "Africa/Dakar", "Europe/Isle_of_Man", "Europe/Dublin", "Africa/Freetown", "Atlantic/Madeira", "Africa/El_Aaiun", "Atlantic/Canary", "Europe/Jersey", "Europe/Lisbon", "Africa/Lome", "Europe/London", "UTC", "Africa/Monrovia", "Africa/Nouakchott", "Africa/Ouagadougou", "Africa/Timbuktu", "Atlantic/Reykjavik", "Europe/Guernsey", "Africa/Sao_Tome", "Europe/Oslo", "Europe/Paris", "Europe/Podgorica", "Europe/Prague", "Europe/Rome", "Europe/Sarajevo", "Europe/San_Marino", "Africa/Algiers", "Europe/Amsterdam", "Europe/Andorra", "Africa/Malabo", "Europe/Belgrade", "Europe/Berlin", "Europe/Malta", "Europe/Bratislava", "Africa/Brazzaville", "Europe/Brussels", "Europe/Budapest", "Africa/Ceuta", "Europe/Copenhagen", "Africa/Porto-Novo", "Africa/Douala", "Europe/Gibraltar", "Africa/Kinshasa", "Africa/Lagos", "Africa/Libreville", "Europe/Ljubljana", "Arctic/Longyearbyen", "Africa/Luanda", "Europe/Luxembourg", "Europe/Madrid", "Europe/Monaco", "Africa/Ndjamena", "Africa/Niamey", "Europe/Vaduz", "Europe/Skopje", "Europe/Stockholm", "Europe/Tirane", "Africa/Tunis", "Europe/Vatican", "Europe/Vienna", "Europe/Warsaw", "Africa/Windhoek", "Europe/Zagreb", "Europe/Zurich", "Africa/Bangui", "Europe/Riga", "Asia/Damascus", "Asia/Amman", "Europe/Athens", "Asia/Beirut", "Europe/Bucharest", "Africa/Bujumbura", "Africa/Cairo", "Africa/Johannesburg", "Europe/Chisinau", "Europe/Tiraspol", "Asia/Hebron", "Africa/Gaborone", "Asia/Gaza", "Africa/Harare", "Europe/Helsinki", "Asia/Jerusalem", "Africa/Juba", "Africa/Khartoum", "Africa/Kigali", "Europe/Kiev", "Europe/Kaliningrad", "Africa/Blantyre", "Africa/Lubumbashi", "Europe/Zaporozhye", "Africa/Lusaka", "Africa/Mbabane", "Africa/Maputo", "Europe/Mariehamn", "Africa/Maseru", "Asia/Nicosia", "Europe/Sofia", "Europe/Tallinn", "Africa/Tripoli", "Europe/Uzhgorod", "Europe/Vilnius", "Africa/Mogadishu", "Europe/Moscow", "Asia/Kuwait", "Indian/Antananarivo", "Antarctica/Syowa", "Africa/Asmara", "Asia/Baghdad", "Africa/Dar_es_Salaam", "Africa/Djibouti", "Asia/Qatar", "Israel", "Europe/Istanbul", "Turkey", "Africa/Kampala", "Indian/Mayotte", "Asia/Bahrain", "Europe/Minsk", "Indian/Comoro", "Africa/Nairobi", "Africa/Addis_Ababa", "Asia/Riyadh", "Asia/Aden", "Europe/Simferopol", "Asia/Istanbul", "Europe/Volgograd", "Asia/Tehran", "Europe/Samara", "Asia/Baku", "Asia/Dubai", "Canada/Atlantic", "Asia/Muscat", "Indian/Mauritius", "Indian/Reunion", "Asia/Tbilisi", "Indian/Mahe", "Asia/Yerevan", "Asia/Kabul", "Asia/Aqtobe", "Antarctica/Mawson", "Asia/Ashgabat", "Asia/Ashkhabad", "Asia/Dushanbe", "Asia/Karachi", "Asia/Qyzylorda", "Indian/Maldives", "Asia/Oral", "Asia/Aqtau", "Asia/Tashkent", "Asia/Yekaterinburg", "Asia/Colombo", "Asia/Dacca", "Asia/Calcutta", "Asia/Kolkata", "Asia/Katmandu", "Asia/Kathmandu", "Asia/Almaty", "Antarctica/Vostok", "Asia/Bishkek", "Indian/Chagos", "Asia/Dhaka", "Asia/Omsk", "Asia/Thimbu", "Asia/Thimphu", "Asia/Urumqi", "Indian/Cocos", "Asia/Rangoon", "Antarctica/Casey", "Antarctica/Davis", "Asia/Bangkok", "Indian/Christmas", "Asia/Ho_Chi_Minh", "Asia/Jakarta", "Asia/Hovd", "Asia/Krasnoyarsk", "Asia/Novokuznetsk", "Asia/Novosibirsk", "Asia/Phnom_Penh", "US/Mountain", "Asia/Pontianak", "Asia/Vientiane", "Asia/Brunei", "Asia/Choibalsan", "Asia/Hong_Kong", "Asia/Irkutsk", "Asia/Kuala_Lumpur", "Asia/Shanghai", "Asia/Kuching", "US/Pacific", "Asia/Macao", "Asia/Macau", "Asia/Makassar", "Australia/Perth", "Asia/Manila", "Singapore", "Asia/Singapore", "Australia/Sydney", "Asia/Taipei", "Asia/Ulaanbaatar", "Australia/Eucla", "Asia/Jayapura", "Asia/Chita", "Asia/Dili", "Pacific/Palau", "Asia/Khandyga", "Asia/Pyongyang", "Asia/Seoul", "Asia/Tokyo", "Asia/Yakutsk", "Australia/Broken_Hill", "Australia/Adelaide", "Australia/Darwin", "Australia/Lindeman", "Australia/Brisbane", "Australia/Canberra", "Antarctica/DumontDUrville", "Pacific/Yap", "Pacific/Guam", "Australia/Hobart", "Pacific/Port_Moresby", "Pacific/Saipan", "Australia/Currie", "Antarctica/Macquarie", "Asia/Vladivostok", "Pacific/Chuuk", "Australia/Lord_Howe", "Australia/LHI", "Pacific/Guadalcanal", "Pacific/Gambier", "Pacific/Norfolk", "Pacific/Pohnpei", "Asia/Magadan", "Asia/Srednekolymsk", "Pacific/Noumea", "Pacific/Pago_Pago", "Pacific/Bougainville", "Pacific/Efate", "Pacific/Kosrae", "Asia/Sakhalin", "Asia/Anadyr", "Antarctica/McMurdo", "Pacific/Auckland", "Kwajalein", "Pacific/Funafuti", "Pacific/Kwajalein", "Pacific/Majuro", "Pacific/Wallis", "Asia/Kamchatka", "Pacific/Fiji", "Pacific/Tarawa", "Pacific/Wake", "Pacific/Nauru", "Pacific/Chatham", "Pacific/Apia", "Pacific/Samoa", "Pacific/Fakaofo", "Pacific/Tongatapu", "Pacific/Enderbury", "Pacific/Kiritimati"].map((tz, i) => ({
                    label: tz,
                    value: tz,
                    displayOrder: i,
                    hidden: false
                  })),
                validation: { blockedEmailDomains: [], useDefaultBlockList: false }
              }]
            }
          ]
        },
        { headers: { Authorization: `Bearer ${hubspotAccessToken}`, 'Content-Type': 'application/json' } }
      );

      formId = formRes.data.id;
      console.log('Form created:', formId);

      await Token.findOneAndUpdate(
        { hubspotPortalId: portalId },
        { hubspotFormId: formId }
      );

    } catch (err) {
      console.log('Form creation error:', err.response?.data || err.message);
    }

    //  Workflow creation
    console.log('FORM ID BEFORE WORKFLOW:', formId);
    try {
      console.log(
        "WAITING BEFORE WORKFLOW..."
      );

      await new Promise(resolve =>
        setTimeout(resolve, 5000)
      );
      const workflowRes = await axios.post(
        'https://api.hubapi.com/automation/v4/flows',
        {
          name: 'MeetHour Meeting Scheduler Workflow',
          isEnabled: true,
          flowType: 'WORKFLOW',
          type: 'CONTACT_FLOW',
          objectTypeId: '0-1',
          startActionId: '1',
          nextAvailableActionId: '2',
          timeWindows: [],
          blockedDates: [],
          customProperties: {},
          suppressionListIds: [],
          enrollmentCriteria: {
            shouldReEnroll: true,
            type: 'EVENT_BASED',
            eventFilterBranches: [
              {
                filterBranches: [],
                filters: [
                  {
                    property: 'hs_form_id',
                    operation: {
                      operator: 'IS_ANY_OF',
                      includeObjectsWithNoValueSet: false,
                      values: [String(formId)],
                      operationType: 'ENUMERATION'
                    },
                    filterType: 'PROPERTY'
                  }
                ],
                eventTypeId: '4-1639801',
                operator: 'HAS_COMPLETED',
                filterBranchType: 'UNIFIED_EVENTS',
                filterBranchOperator: 'AND'
              }
            ],
            listMembershipFilterBranches: []
          },
          actions: [
            {
              type: 'WEBHOOK',
              actionId: '1',
              webhookUrl: 'https://meethourhubs.vercel.app/form-webhook',
              method: 'POST',
              queryParams: []
            }
          ]
        },

        {
          headers: {
            Authorization: `Bearer ${hubspotAccessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('Workflow created:', workflowRes.data.id);
    } catch (err) {
      console.log('FULL WORKFLOW ERROR:', JSON.stringify(err.response?.data, null, 2));
      console.log('Workflow creation error:', err.response?.data || err.message);
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

//  MeetHour Callback redirect url after meethour login
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

    // Fetch MeetHour user profile to get user ID and timezone
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

    res.redirect('https://app-na2.hubspot.com');

  } catch (err) {
    console.error('MeetHour Callback Error:', err.message);
    res.status(500).send('Something went wrong!');
  }
});

//random password generator 
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

    await connectDB();

    const invitees = req.body.invitees || [];

    if (invitees.length === 0) {
      console.log("No invitees");
      return res.json({
        conferenceId: "no-attendees-" + Date.now(),
        conferenceUrl: "https://meethour.io",
        conferenceDetails: "No attendees provided"
      });
    }

    const portalId = req.body.portalId;

    if (!portalId) {
      console.log("No portalId in request");
      return res.json({
        conferenceId: "error-" + Date.now(),
        conferenceUrl: "https://meethour.io",
        conferenceDetails: "Portal ID missing"
      });
    }

    const freshHubspotToken = await refreshHubspotToken(portalId);

    // Fetch MeetHour token from DB
    const tokenRecord = await Token.findOne({ hubspotPortalId: portalId });

    if (!tokenRecord || !tokenRecord.meethourAccessToken) {
      console.log("No MeetHour token found for portal:", portalId);
      return res.json({
        conferenceId: "error-" + Date.now(),
        conferenceUrl: "https://meethour.io",
        conferenceDetails: "MeetHour not connected for this account"
      });
    }

    const token = tokenRecord.meethourAccessToken;
    const meethourUserId = tokenRecord.meethourUserId;

    // Fetching User Deatails API to get timezone
    const userDetailsRes = await axios.post(
      "https://api.meethour.io/api/v1.2/customer/user_details",
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    const resolvedTimezone = userDetailsRes.data.data.timezone || "UTC";
    console.log("MeetHour user timezone:", resolvedTimezone);

    // calculating the duration
    const durationMs = req.body.endTime - req.body.startTime;
    const totalMinutes = Math.floor(durationMs / 60000);
    const duration_hr = Math.floor(totalMinutes / 60);
    const duration_min = totalMinutes % 60;

    console.log("duration_hr:", duration_hr);
    console.log("duration_min:", duration_min);

    // converting startTime to resolvedTimezone
    const start = new Date(req.body.startTime);
    const localDate = new Date(start.toLocaleString("en-US", { timeZone: resolvedTimezone }));

    const meeting_date = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}-${String(localDate.getDate()).padStart(2, "0")}`;

    let hours = localDate.getHours();
    const minutes = localDate.getMinutes();

    const meridiem = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;

    const meeting_time = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

    console.log("meeting_date:", meeting_date);
    console.log("meeting_time:", meeting_time);
    console.log("meeting_meridiem:", meridiem);

    const attend = invitees
      .filter(i => i?.email)
      .map(i => ({
        first_name: i.firstName,
        last_name: i.lastName || "",
        email: i.email
      }));

    const payload = {
      meeting_name: req.body.topic,
      meeting_date,
      meeting_time,
      meeting_meridiem: meridiem,
      timezone: resolvedTimezone, //  MeetHour user ka actual timezone
      passcode: generatePasscode(),
      attend,
      send_calendar_invite: 1,
      duration_hr,
      duration_min,
      hostusers: meethourUserId ? [Number(tokenRecord.meethourUserId)] : []
    };

    console.log("MEETHOUR PAYLOAD:", JSON.stringify(payload, null, 2));

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

    const meeting = response.data.data;

    const formattedTime = new Date(req.body.startTime).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: resolvedTimezone
    });

    console.log("========== OWNER DEBUG ==========");
    console.log("FULL REQUEST BODY:", JSON.stringify(req.body, null, 2));

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
        ownerName = `${matchedOwner.firstName || ""} ${matchedOwner.lastName || ""}`.trim();
      }
    }

    console.log("FINAL OWNER NAME:", ownerName);
    console.log("========== END DEBUG ==========");

    const details = `
      <b>${ownerName} is inviting you to a scheduled meeting.</b>
      <b>Topic:</b> ${meeting.topic}
      <b>Time:</b> ${formattedTime} (${resolvedTimezone})<br>
      <b>Join MeetHour Meeting</b>: ${meeting.joinURL}<br>
      <b>Meeting ID:</b> ${meeting.meeting_id}
      <b>Passcode:</b> ${meeting.passcode}
    `;

    await Meeting.create({
      hubspotMeetingId: `${req.body.portalId}-${req.body.startTime}`,
      hubspotPortalId: portalId,
      meethourMeetingId: meeting.meeting_id,
      meethourMeetingUrl: meeting.joinURL,
      meetingName: req.body.topic || "HubSpot Meeting",
      conferenceId: String(meeting.id)
    });

    console.log("Meeting saved to DB!");

    return res.json({
      conferenceId: meeting.id,
      conferenceUrl: meeting.joinURL,
      conferenceDetails: details
    });

  } catch (err) {
    console.log("ERROR:", err.response?.data || err.message);
    console.log("STACK:", err.stack);
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
            title: `${dealName}`,
            body: `<b>${ownerName} is inviting you to a scheduled meeting.</b><br><br>
            <b>Topic:</b> ${meeting.topic}<br>
            <b>Date & Time:</b> ${meeting_date}, ${formattedTime}<br><br>
            <b>Join MeetHour:</b> ${meeting.joinURL}<br><br>
            <b>Meeting ID:</b> ${meeting.meeting_id}<br>
            <b>Passcode:</b> ${meeting.passcode}`,

            startTime: startTimestamp, 
            endTime: startTimestamp + (60 * 60 * 1000),
            externalUrl: meeting.joinURL, 
            location: meeting.joinURL,
            locationType: 'Video Conference',
            meetingOutcome: 'Scheduled' 
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

//scheduling meeting on form submission
app.post("/form-webhook", async (req, res) => {
  try {
    console.log("===== FORM WEBHOOK =====");

    console.log(
      "BODY:",
      JSON.stringify(req.body, null, 2)
    );

    await connectDB();

    // ======================================================
    // HUBSPOT DEFAULT WEBHOOK STRUCTURE
    // ======================================================

    const body = req.body || {};
    const props = body.properties || {};
    const email = props.email?.value || "";
    const firstname = props.firstname?.value || "";
    const lastname = props.lastname?.value || "";
    const meeting_name = props.meeting_name?.value || "MeetHour Meeting";
    const rawDate = props.meeting_date?.value;
    const rawTime = props.meeting_time?.value;
    const timezone = props.timezone?.value || "UTC";
    let meeting_meridiem = props.meeting_meridiem?.value || "AM";

    console.log("EMAIL:", email);
    console.log("DATE:", rawDate);
    console.log("TIME:", rawTime);

    // ======================================================
    // DATE FORMAT
    // OUTPUT:
    // 2026-06-17
    // ======================================================

    let meeting_date = rawDate;

    try {
      const dateObj = new Date(parseInt(rawDate));

      const yyyy =
        dateObj.getUTCFullYear();

      const mm = String(
        dateObj.getUTCMonth() + 1
      ).padStart(2, "0");

      const dd = String(
        dateObj.getUTCDate()
      ).padStart(2, "0");

      meeting_date = `${yyyy}-${mm}-${dd}`;

    } catch (e) {
      console.log("DATE FORMAT ERROR");
    }

    // ======================================================
    // TIME FORMAT
    // OUTPUT:
    // 04:00
    // ======================================================

    let meeting_time = rawTime;

    if (
      rawTime &&
      rawTime.includes(":")
    ) {
      const [strHours, strMinutes] =
        rawTime.split(":");

      let hours = parseInt(
        strHours,
        10
      );

      if (hours >= 12) {
        meeting_meridiem = "PM";

        if (hours > 12) {
          hours -= 12;
        }

      } else if (hours === 0) {
        hours = 12;

        meeting_meridiem = "AM";
      }

      meeting_time = `${String(
        hours
      ).padStart(2, "0")}:${strMinutes}`;
    }

    console.log(
      "FINAL DATE:",
      meeting_date
    );

    console.log(
      "FINAL TIME:",
      meeting_time
    );

    console.log(
      "FINAL MERIDIEM:",
      meeting_meridiem
    );

    // FIND CUSTOMER TOKEN

    const portalId =
      body["portal-id"] ||
      body.portalId;
    console.log("PORTAL ID:", portalId);

    const tokenRecord =
      await Token.findOne({
        hubspotPortalId: portalId
      });

    if (
      !tokenRecord ||
      !tokenRecord.meethourAccessToken
    ) {
      return res.status(400).json({
        success: false,
        message:
          "MeetHour token not found"
      });
    }

    const meethourToken =
      tokenRecord.meethourAccessToken;

    const meethourUserId =
      tokenRecord.meethourUserId;

    // CREATE ATTENDEE

    const attend = [
      {
        first_name: firstname,
        last_name: lastname,
        email
      }
    ];

    // CREATE MEETHOUR PAYLOAD

    const payload = {
      meeting_name,
      meeting_date,
      meeting_time,
      meeting_meridiem,
      timezone,
      passcode: generatePasscode(),
      attend,
      send_calendar_invite: 1,
      duration_hr: 1,
      duration_min: 0,
      hostusers: meethourUserId
        ? [Number(meethourUserId)]
        : []
    };

    console.log(
      "MEETHOUR PAYLOAD:",
      JSON.stringify(payload, null, 2)
    );

    // CREATE MEETING

    const meetingRes = await axios.post(
      "https://api.meethour.io/api/v1.2/meeting/schedulemeeting",
      payload,
      {
        headers: {
          Authorization:
            `Bearer ${meethourToken}`,
          "Content-Type":
            "application/json"
        }
      }
    );

    console.log(
      "MEETING CREATED!"
    );

    const meeting = meetingRes.data.data;
    await Meeting.create({
      hubspotMeetingId: `${portalId}-${Date.now()}`,
      hubspotPortalId: String(portalId),
      meethourMeetingId: meeting.meeting_id,
      meethourMeetingUrl: meeting.joinURL,
      meetingName: meeting_name,
      conferenceId: String(meeting.id)
    });

    console.log("Meeting saved to DB!");

    // CREATE HUBSPOT MEETING ACTIVITY

    const hubspotToken =
      await refreshHubspotToken(
        portalId
      );

    const contactId =
      props.hs_object_id?.value || body.vid;
    console.log("CONTACT ID:", contactId);

    if (contactId) {
      try {
        await axios.post(
          "https://api.hubapi.com/engagements/v1/engagements",
          {
            engagement: {
              active: true,
              type: "MEETING",
              timestamp: Date.now(),
            },
            associations: {
              contactIds: [Number(contactId)],
            },
            metadata: {
              title: `${meeting_name}`,
              body: `<b>${firstname} ${lastname}</b> scheduled a meeting.<br><br>  
                  <b>Topic:</b> ${meeting_name}<br>
                  <b>Date & Time:</b> ${meeting_date} ${meeting_time} ${meeting_meridiem}  ${timezone}<br><br>
                  <b>Join MeetHour Meeting:</b> ${meeting.joinURL}<br><br>
                  <b>Meeting ID:</b> ${meeting.meeting_id}<br>
                  <b>Passcode:</b> ${meeting.passcode}`,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${hubspotToken}`,
              "Content-Type": "application/json",
            },
          }
        );

        console.log("MEETING ENGAGEMENT CREATED!");

      } catch (activityErr) {
        console.log(
          "ACTIVITY ERROR:",
          activityErr.response?.data ||
          activityErr.message
        );
      }
    }

    return res.json({
      success: true,
      joinURL: meeting.joinURL,
      meetingId:
        meeting.meeting_id
    });

  } catch (err) {
    console.log(
      "FORM WEBHOOK ERROR:",
      err.response?.data ||
      err.message
    );

    return res.status(500).json({
      success: false,
      error:
        err.response?.data ||
        err.message
    });
  }
});


// CREATE FORM + WORKFLOW FUNCTION

async function setupMeetHourHubSpot(
  portalId,
  accessToken
) {
  try {
    console.log(
      "===== STARTING HUBSPOT SETUP ====="
    );

    // CREATE FORM
    const formPayload = {
      name:
        "MeetHour Meeting Scheduler",
      configuration: {
        submitText:
          "Schedule Meeting"
      },
      displayOptions: {
        theme: "default"
      },

      fields: [
        {
          objectTypeId: "0-1",
          name: "firstname",
          label: "First Name",
          fieldType:
            "single_line_text"
        },

        {
          objectTypeId: "0-1",
          name: "lastname",
          label: "Last Name",
          fieldType:
            "single_line_text"
        },

        {
          objectTypeId: "0-1",
          name: "email",
          label: "Email",
          fieldType: "email"
        },

        {
          objectTypeId: "0-1",
          name: "meeting_name",
          label: "Meeting Name",
          fieldType:
            "single_line_text"
        },

        {
          objectTypeId: "0-1",
          name: "meeting_date",
          label: "Meeting Date",
          fieldType:
            "datepicker"
        },

        {
          objectTypeId: "0-1",
          name: "meeting_time",
          label: "Meeting Time",
          fieldType:
            "single_line_text"
        },
        {
          objectTypeId: "0-1",

          name:
            "meeting_meridiem",
          label:
            "Meeting Meridiem",
          fieldType: "dropdown",

          options: [
            {
              label: "AM",
              value: "AM"
            },
            {
              label: "PM",
              value: "PM"
            }
          ]
        },

        {
          objectTypeId: "0-1",
          name: "timezone",
          label: "Timezone",
          fieldType:
            "single_line_text"
        }
      ]
    };

    const formRes = await axios.post(
      "https://api.hubapi.com/marketing/v3/forms",
      formPayload,
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          "Content-Type":
            "application/json"
        }
      }
    );

    console.log(
      "FORM CREATED!"
    );

    const formId =
      formRes.data.id;
    console.log(
      "FORM ID:",
      formId
    );

    // CREATE WORKFLOW

    const workflowPayload = {
      name: "MeetHour Form Workflow",
      type: "CONTACT_FLOW",
      flowType: "WORKFLOW",
      isEnabled: true,
      objectTypeId: "0-1",
      startActionId: "1",
      nextAvailableActionId: "2",
      crmObjectCreationStatus: "COMPLETE",
      canEnrollFromSalesforce: false,
      actions: [
        {
          actionId: "1",
          type: "WEBHOOK",
          method: "POST",
          webhookUrl:
            "https://meethourhubs.vercel.app/form-webhook",
          queryParams: []
        }
      ],

      enrollmentCriteria: {
        type: "EVENT_BASED",
        shouldReEnroll: true,
        eventFilterBranches: [
          {
            eventTypeId: "4-1639801",
            operator: "HAS_COMPLETED",
            filterBranchType: "UNIFIED_EVENTS",
            filterBranchOperator: "AND",
            filters: [
              {
                property: "hs_form_id",
                operation: {
                  operator: "IS_ANY_OF",
                  includeObjectsWithNoValueSet: false,
                  values: [
                    formId
                  ],
                  operationType: "ENUMERATION"
                },
                filterType: "PROPERTY"
              }
            ],
            filterBranches: []
          }
        ],
        listMembershipFilterBranches:
          []
      }
    };

    const workflowRes =
      await axios.post(
        "https://api.hubapi.com/automation/v4/flows",
        workflowPayload,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        }
      );

    console.log(
      "WORKFLOW CREATED!"
    );

    console.log(
      JSON.stringify(
        workflowRes.data,
        null,
        2
      )
    );

    return {
      success: true,
      formId,
      workflowId:
        workflowRes.data.id
    };
  } catch (err) {
    console.log(
      "SETUP ERROR:",
      err.response?.data ||
      err.message
    );
    return {
      success: false,
      error:
        err.response?.data ||
        err.message
    };
  }
}


app.get("/test-refresh-token", async (req, res) => {
  try {
    await connectDB(); // PEHLE YEH
    const token = await refreshHubspotToken(246208918);
    console.log("Fresh token:", token);
    res.json({ token });
  } catch (err) {
    console.log("Error:", err.message);
    res.json({ error: err.message });
  }
});

//localhost running @ 3000
if (process.env.NODE_ENV !== 'production') {
  app.listen(3000, () => console.log("Server running on port 3000"));
}

module.exports = app;
