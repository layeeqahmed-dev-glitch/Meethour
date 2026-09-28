require("dotenv").config();
const express = require("express");
const app = express();
app.use(express.json());
const axios = require("axios");
const qs = require("querystring");
const connectDB = require("./db");
const Meeting = require("./models/meetings");
const Token = require("./models/token");
const crypto = require("crypto");

connectDB()
  .then(() => {
    console.log(" MongoDB connected successfully (no DNS override)");
  })
  .catch((err) => {
    console.error(" MongoDB connection failed:", err);
  });

// Parse all incoming request bodies as plain text
app.use(express.text({ type: "*/*" }));
console.log("Calling refreshHubspotToken...");

//hubspot token refresh function
const refreshHubspotToken = async (portalId) => {
  console.log("REFRESHING TOKEN FOR PORTAL:", portalId);

  const tokenRecord = await Token.findOne({
    hubspotPortalId: String(portalId),
  });

  console.log("TOKEN RECORD:");
  console.log(tokenRecord);

  if (!tokenRecord) {
    throw new Error(`No token record found for portal ${portalId}`);
  }

  if (!tokenRecord.hubspotRefreshToken) {
    throw new Error("hubspotRefreshToken missing in DB");
  }

  const response = await axios.post(
    "https://api.hubapi.com/oauth/v1/token",

    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.HUBSPOT_CLIENT_ID,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET,
      refresh_token: tokenRecord.hubspotRefreshToken,
    }),

    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
  );

  console.log("REFRESH RESPONSE:");

  console.log(JSON.stringify(response.data, null, 2));

  await Token.findOneAndUpdate(
    {
      hubspotPortalId: String(portalId),
    },

    {
      hubspotAccessToken: response.data.access_token,

      hubspotRefreshToken: response.data.refresh_token,
    },
  );

  console.log("TOKEN UPDATED SUCCESSFULLY");

  return response.data.access_token;
};


// setup-page
app.get("/setup", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>

<head>
    <meta charset="UTF-8">
    <title>MeetHour for HubSpot — Setup Guide</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 0 20px;
            line-height: 1.6;
            color: #333;
        }

        h1 {
            color: #FF7A59;
        }

        h2 {
            margin-top: 30px;
            border-bottom: 1px solid #eee;
            padding-bottom: 5px;
        }

        ul,
        ol {
            padding-left: 20px;
        }
    </style>
</head>

<body>
    <h1>MeetHour for HubSpot — Setup Guide</h1>
    <p>This guide walks you through installing and configuring the MeetHour integration for HubSpot.</p>

    <h2>1. Install the App</h2>
    <ol>
        <li>Go to the MeetHour listing on the HubSpot Marketplace.</li>
        <li>Click <b>Install app</b>.</li>
        <li>Select the HubSpot account (portal) you want to connect.</li>
        <li>Authorize the requested permissions (contacts, deals, forms, owners, users, workflows).</li>
    </ol>

    <h2>2. Connect Your MeetHour Account</h2>
    <ol>
        <li>After HubSpot authorization, you'll be redirected to MeetHour login.</li>
        <li>Log in with your MeetHour Developer account.</li>
        <li>Once authorized, you'll be redirected back to HubSpot — installation is complete.</li>
    </ol>

    <h2>3. What Gets Set Up Automatically</h2>
    <ul>
        <li><b>Custom Deal properties:</b> Meeting Date, Meeting Time, Meeting Meridiem, Timezone</li>
        <li><b>Custom Contact properties:</b> Meeting Name, Meeting Date, Meeting Time, Meeting Meridiem, Timezone</li>
        <li><b>A HubSpot Form:</b> "MeetHour Meeting Scheduler"</li>
        <li><b>A Workflow:</b> triggers meeting creation on form submission</li>
    </ul>

    <h2>4. Ways to Schedule a Meeting</h2>
    <p><b>Via Form Submission</b> — share the auto-created form; submitting it creates a meeting automatically.</p>
    <p><b>Via Deal Stage</b> — open the deal and click "Edit" on the deal form. You'll see a "Meet Hour" section — click
        it to reveal 4 checkboxes (Meeting Name, Date, Time, Meridiem). Check all 4, fill in the values, and save. When
        creating the deal, make sure to assign a Contact — without an associated contact, the meeting will not be
        scheduled. Once saved, set the deal stage to "Appointment Scheduled" or "Presentation Scheduled" to trigger the
        meeting.</p>

    <p><b>Via Meeting Scheduler (VCE)</b> — use HubSpot's native scheduler with MeetHour as provider.</p>
    <p><b>Manually from a Contact Record</b> — schedule directly from the contact records.</p>

    <h2>5. Where to View Meetings</h2>
    <p>You can also view your meetings and recordings directly: click the <b>Marketplace icon</b> in HubSpot, go to <b>"Your recently visited apps"</b>, and click <b>MeetHour</b> — this opens a dashboard page showing your meetings and recordings.</p>

</body>

</html>
  `);
});
// callback
app.get("/callback", async (req, res) => {
  try {
    const { step, returnUrl, code, state } = req.query;

    console.log("========================================");
    console.log("HUBSPOT CALLBACK");
    console.log("STEP:", step);
    console.log("RETURN URL:", returnUrl);
    console.log("HAS CODE:", !!code);
    console.log("STATE:", state ? "received" : "missing");
    console.log("========================================");

    /*
    ============================================================
    STEP 1: AUTHORIZE
    ============================================================
    
    HubSpot sends:

    /callback?step=authorize&returnUrl=...

    There is NO HubSpot OAuth code at this point.

    We:
    1. Validate returnUrl
    2. Generate state
    3. Save installation session in MongoDB
    4. Send user to MeetHour login
    ============================================================
    */

    if (step === "authorize") {
      if (!returnUrl) {
        return res.status(400).send(
          "Missing HubSpot returnUrl!"
        );
      }

      // Only allow HubSpot return URLs
      let parsedReturnUrl;

      try {
        parsedReturnUrl = new URL(returnUrl);
      } catch (err) {
        return res.status(400).send(
          "Invalid HubSpot returnUrl!"
        );
      }

      if (
        parsedReturnUrl.protocol !== "https:" ||
        !parsedReturnUrl.hostname.endsWith("hubspot.com")
      ) {
        return res.status(400).send(
          "Invalid HubSpot returnUrl!"
        );
      }

      await connectDB();

      /*
       * Generate a secure state token.
       *
       * crypto must already be imported:
       *
       * const crypto = require("crypto");
       */

      const installState = crypto.randomBytes(32).toString("hex");

      console.log(
        "Generated installation state:",
        installState
      );

      /*
       * Save the pending installation.
       *
       * We do NOT know the HubSpot portal ID yet.
       */

      await Token.create({
        installState: installState,
        hubspotReturnUrl: returnUrl,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log(
        "Pending installation saved."
      );

      /*
       * Store state in a secure cookie too.
       *
       * MeetHour callback needs to know which installation
       * this login belongs to.
       */

      res.setHeader(
        "Set-Cookie",
        `meethour_install_state=${encodeURIComponent(
          installState
        )}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=900`
      );

      /*
       * Send user to MeetHour login.
       */

      const meethourRedirect =
        `${process.env.APP_BASE_URL}/meethour-callback`;

      console.log(
        "REDIRECTING TO MEETHOUR LOGIN:",
        meethourRedirect
      );

      const meethourLoginUrl =
        `https://portal.meethour.io/serviceLogin` +
        `?client_id=0pvx3tst84t7x3kym5wyvstnvol679mwmovk` +
        `&redirect_uri=${encodeURIComponent(meethourRedirect)}` +
        `&device_type=web` +
        `&response_type=get`;

      return res.redirect(meethourLoginUrl);
    }

    /*
    ============================================================
    STEP 2: FINALIZE
    ============================================================

    After MeetHour login, we redirect the user back to HubSpot
    using:

    returnUrl?state=XXXXX

    HubSpot then sends:

    /callback
      ?step=finalize
      &code=XXXXX
      &state=XXXXX
      &returnUrl=XXXXX

    NOW we can exchange the HubSpot OAuth code.
    ============================================================
    */

    if (step === "finalize") {
      if (!code) {
        return res.status(400).send(
          "No HubSpot OAuth code provided!"
        );
      }

      if (!state) {
        return res.status(400).send(
          "No installation state provided!"
        );
      }

      if (!returnUrl) {
        return res.status(400).send(
          "Missing HubSpot returnUrl!"
        );
      }

      let parsedReturnUrl;

      try {
        parsedReturnUrl = new URL(returnUrl);
      } catch (err) {
        return res.status(400).send(
          "Invalid HubSpot returnUrl!"
        );
      }

      if (
        parsedReturnUrl.protocol !== "https:" ||
        !parsedReturnUrl.hostname.endsWith("hubspot.com")
      ) {
        return res.status(400).send(
          "Invalid HubSpot returnUrl!"
        );
      }

      await connectDB();

      /*
       * Find the exact installation using state.
       *
       * DO NOT use:
       *
       * Token.findOne({ status: "pending" })
       *
       * because multiple users could install the app
       * at the same time.
       */

      const pendingRecord = await Token.findOne({
        installState: state,
        status: {
          $in: ["pending", "meethour_connected"],
        },
      });

      if (!pendingRecord) {
        console.log(
          "No pending installation found for state:",
          state
        );

        return res.status(400).send(
          "Installation session expired or invalid. Please reinstall the app."
        );
      }

      /*
       * Make sure the return URL has not changed.
       */

      if (
        pendingRecord.hubspotReturnUrl &&
        pendingRecord.hubspotReturnUrl !== returnUrl
      ) {
        console.log("Return URL mismatch.");

        return res.status(400).send(
          "Invalid installation session."
        );
      }

      /*
      ============================================================
      EXCHANGE HUBSPOT CODE
      ============================================================
      */

      console.log(
        "Exchanging HubSpot authorization code..."
      );

      const tokenResponse = await axios.post(
        "https://api.hubspot.com/oauth/v3/token",
        qs.stringify({
          grant_type: "authorization_code",
          client_id: process.env.HUBSPOT_CLIENT_ID,
          client_secret: process.env.HUBSPOT_CLIENT_SECRET,
          redirect_uri: process.env.HUBSPOT_REDIRECT_URI,
          code: code,
        }),
        {
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },
        }
      );

      const hubspotAccessToken =
        tokenResponse.data.access_token;

      const hubspotRefreshToken =
        tokenResponse.data.refresh_token;

      if (!hubspotAccessToken) {
        throw new Error(
          "HubSpot did not return an access token."
        );
      }

      console.log(
        "HubSpot OAuth token received."
      );

      /*
      ============================================================
      GET HUBSPOT PORTAL INFORMATION
      ============================================================
      */

      const portalRes = await axios.get(
        `https://api.hubapi.com/oauth/v3/access-tokens/${hubspotAccessToken}`
      );

      const portalId =
        portalRes.data.hub_id;

      if (!portalId) {
        throw new Error(
          "Could not determine HubSpot portal ID."
        );
      }

      console.log(
        "HubSpot portal ID:",
        portalId
      );

      /*
      ============================================================
      SAVE HUBSPOT TOKEN
      ============================================================
      */

      await Token.findOneAndUpdate(
        {
          _id: pendingRecord._id,
        },
        {
          hubspotPortalId: portalId,
          hubspotAccessToken: hubspotAccessToken,
          hubspotRefreshToken: hubspotRefreshToken,
          status: "meethour_connected",
          updatedAt: new Date(),
        },
        {
          new: true,
        }
      );

      console.log(
        "HubSpot token saved for portal:",
        portalId
      );

      /*
      ============================================================
      CREATING DEAL PROPERTY GROUP
      ============================================================
      */

      try {
        await axios.post(
          "https://api.hubapi.com/crm/v3/properties/deals/groups",
          {
            name: "meet_hour",
            label: "Meet Hour",
            displayOrder: 1,
          },
          {
            headers: {
              Authorization: `Bearer ${hubspotAccessToken}`,
              "Content-Type": "application/json",
            },
          }
        );

        console.log(
          "Property group created"
        );
      } catch (err) {
        console.log(
          "Group skipped (may exist):",
          err.response?.data?.message
        );
      }

      /*
      ============================================================
      DEAL PROPERTIES
      ============================================================
      */

      const dealProperties = [
        {
          name: "meeting_date",
          label: "Meeting Date",
          type: "date",
          fieldType: "date",
          groupName: "meet_hour",
          displayOrder: 0,
        },

        {
          name: "meeting_time",
          label: "Meeting Time",
          type: "enumeration",
          fieldType: "select",
          groupName: "meet_hour",
          displayOrder: 1,

          // KEEP YOUR COMPLETE EXISTING TIME OPTIONS HERE
          options: [
            { label: "12:00", value: "12:00", displayOrder: 0 },
            { label: "12:15", value: "12:15", displayOrder: 1 },
            { label: "12:30", value: "12:30", displayOrder: 2 },
            { label: "12:45", value: "12:45", displayOrder: 3 },

            // ... keep the rest from your current route
          ],
        },

        {
          name: "meeting_meridiem",
          label: "Meeting Meridiem",
          type: "enumeration",
          fieldType: "select",
          groupName: "meet_hour",
          displayOrder: 2,

          options: [
            {
              label: "AM",
              value: "AM",
              displayOrder: 0,
            },
            {
              label: "PM",
              value: "PM",
              displayOrder: 1,
            },
          ],
        },

        {
          name: "timezone",
          label: "Timezone",
          type: "enumeration",
          fieldType: "select",
          groupName: "meet_hour",
          displayOrder: 3,

          // KEEP YOUR COMPLETE EXISTING TIMEZONE OPTIONS HERE
          options: [
            "Etc/GMT+12",
            "Pacific/Midway",
            "Pacific/Niue",
            "America/Adak",

            // ... keep the rest from your current route
            "Pacific/Kiritimati",
          ].map((tz, index) => ({
            label: tz,
            value: tz,
            displayOrder: index,
          })),
        },
      ];

      for (const prop of dealProperties) {
        try {
          await axios.post(
            "https://api.hubapi.com/crm/v3/properties/deals",
            prop,
            {
              headers: {
                Authorization: `Bearer ${hubspotAccessToken}`,
                "Content-Type": "application/json",
              },
            }
          );

          console.log(
            "Deal property created:",
            prop.name
          );
        } catch (err) {
          console.log(
            "Deal property skipped (may exist):",
            prop.name,
            err.response?.data?.message
          );
        }
      }

      /*
      ============================================================
      CONTACT PROPERTIES
      ============================================================
      */

      const contactProperties = [
        {
          name: "meeting_name",
          label: "Meeting Name",
          type: "string",
          fieldType: "text",
          groupName: "contactinformation",
          displayOrder: 0,
        },

        {
          name: "meeting_date",
          label: "Meeting Date",
          type: "date",
          fieldType: "date",
          groupName: "contactinformation",
          displayOrder: 1,
        },

        {
          name: "meeting_time",
          label: "Meeting Time",
          type: "enumeration",
          fieldType: "select",
          groupName: "contactinformation",
          displayOrder: 2,

          // KEEP YOUR COMPLETE EXISTING TIME OPTIONS HERE
          options: [
            { label: "12:00", value: "12:00", displayOrder: 0 },
            { label: "12:30", value: "12:30", displayOrder: 1 },
            { label: "01:00", value: "01:00", displayOrder: 2 },

            // ... keep the rest from your current route
          ],
        },

        {
          name: "meeting_meridiem",
          label: "Meeting Meridiem",
          type: "enumeration",
          fieldType: "select",
          groupName: "contactinformation",
          displayOrder: 3,

          options: [
            {
              label: "AM",
              value: "AM",
              displayOrder: 0,
            },
            {
              label: "PM",
              value: "PM",
              displayOrder: 1,
            },
          ],
        },

        {
          name: "timezone",
          label: "Timezone",
          type: "enumeration",
          fieldType: "select",
          groupName: "contactinformation",
          displayOrder: 4,

          // KEEP YOUR COMPLETE EXISTING TIMEZONE OPTIONS HERE
          options: [
            "Etc/GMT+12",
            "Pacific/Midway",
            "Pacific/Niue",
            "America/Adak",
            "US/Aleutian",
            "US/Hawaii",
            "Pacific/Honolulu",

            // ... keep the rest from your current route
            "Pacific/Kiritimati",
          ].map((tz, index) => ({
            label: tz,
            value: tz,
            displayOrder: index,
          })),
        },
      ];

      for (const prop of contactProperties) {
        try {
          await axios.post(
            "https://api.hubapi.com/crm/v3/properties/contacts",
            prop,
            {
              headers: {
                Authorization: `Bearer ${hubspotAccessToken}`,
                "Content-Type": "application/json",
              },
            }
          );

          console.log(
            "Contact property created:",
            prop.name
          );
        } catch (err) {
          console.log(
            "Contact property skipped:",
            prop.name,
            err.response?.data?.message
          );
        }
      }

      /*
      ============================================================
      CREATE HUBSPOT FORM
      ============================================================
      */

      let formId = null;

      try {
        const formRes = await axios.post(
          "https://api.hubapi.com/marketing/v3/forms",
          {
            name: "MeetHour Meeting Scheduler",
            formType: "hubspot",
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
              language: "en",
              notifyRecipients: [],

              postSubmitAction: {
                type: "thank_you",
                value:
                  "Thank you! Your meeting has been scheduled.",
              },

              lifecycleStages: [],
            },

            displayOptions: {
              renderRawHtml: false,
              submitButtonText: "Schedule Meeting",
              theme: "default_style",

              style: {
                backgroundWidth: "100%",
                fontFamily: "Arial",
                helpTextColor: "#7C98B6",
                helpTextSize: "14px",
                labelTextColor: "#33475B",
                labelTextSize: "14px",
                legalConsentTextColor: "#33475B",
                legalConsentTextSize: "14px",
                submitAlignment: "left",
                submitColor: "#FF7A59",
                submitFontColor: "#FFFFFF",
                submitSize: "12px",
              },
            },

            fieldGroups: [
              {
                fields: [
                  {
                    name: "firstname",
                    label: "First Name",
                    objectTypeId: "0-1",
                    fieldType: "single_line_text",
                    required: true,
                    hidden: false,
                    dependentFields: [],
                    validation: {
                      blockedEmailDomains: [],
                      useDefaultBlockList: false,
                    },
                  },
                ],
              },

              {
                fields: [
                  {
                    name: "lastname",
                    label: "Last Name",
                    objectTypeId: "0-1",
                    fieldType: "single_line_text",
                    required: true,
                    hidden: false,
                    dependentFields: [],
                    validation: {
                      blockedEmailDomains: [],
                      useDefaultBlockList: false,
                    },
                  },
                ],
              },

              {
                fields: [
                  {
                    name: "email",
                    label: "Email",
                    objectTypeId: "0-1",
                    fieldType: "email",
                    required: true,
                    hidden: false,
                    dependentFields: [],
                    validation: {
                      blockedEmailDomains: [],
                      useDefaultBlockList: false,
                    },
                  },
                ],
              },

              {
                fields: [
                  {
                    name: "meeting_name",
                    label: "Meeting Name",
                    objectTypeId: "0-1",
                    fieldType: "single_line_text",
                    required: true,
                    hidden: false,
                    dependentFields: [],
                    validation: {
                      blockedEmailDomains: [],
                      useDefaultBlockList: false,
                    },
                  },
                ],
              },

              {
                fields: [
                  {
                    name: "meeting_date",
                    label: "Meeting Date",
                    objectTypeId: "0-1",
                    fieldType: "datepicker",
                    required: true,
                    hidden: false,
                    dependentFields: [],
                    validation: {
                      blockedEmailDomains: [],
                      useDefaultBlockList: false,
                    },
                  },
                ],
              },

              {
                fields: [
                  {
                    name: "meeting_time",
                    label: "Meeting Time",
                    objectTypeId: "0-1",
                    fieldType: "dropdown",
                    required: true,
                    hidden: false,
                    dependentFields: [],

                    // KEEP YOUR COMPLETE EXISTING TIME OPTIONS
                    options: [
                      {
                        label: "12:00",
                        value: "12:00",
                        displayOrder: 0,
                      },
                      {
                        label: "12:30",
                        value: "12:30",
                        displayOrder: 1,
                      },
                      {
                        label: "01:00",
                        value: "01:00",
                        displayOrder: 2,
                      },

                      // ... keep the rest
                    ],

                    validation: {
                      blockedEmailDomains: [],
                      useDefaultBlockList: false,
                    },
                  },
                ],
              },

              {
                fields: [
                  {
                    name: "meeting_meridiem",
                    label: "AM/PM",
                    objectTypeId: "0-1",
                    fieldType: "dropdown",
                    required: true,
                    hidden: false,
                    dependentFields: [],

                    options: [
                      {
                        label: "AM",
                        value: "AM",
                        displayOrder: 0,
                      },
                      {
                        label: "PM",
                        value: "PM",
                        displayOrder: 1,
                      },
                    ],

                    validation: {
                      blockedEmailDomains: [],
                      useDefaultBlockList: false,
                    },
                  },
                ],
              },

              {
                fields: [
                  {
                    name: "timezone",
                    label: "Timezone",
                    objectTypeId: "0-1",
                    fieldType: "dropdown",
                    required: true,
                    hidden: false,
                    dependentFields: [],

                    // KEEP YOUR COMPLETE EXISTING TIMEZONE OPTIONS
                    options: [
                      "Etc/GMT+12",
                      "Pacific/Midway",
                      "Pacific/Niue",
                      "America/Adak",

                      // ... keep the rest
                      "Pacific/Kiritimati",
                    ].map((tz, i) => ({
                      label: tz,
                      value: tz,
                      displayOrder: i,
                      hidden: false,
                    })),

                    validation: {
                      blockedEmailDomains: [],
                      useDefaultBlockList: false,
                    },
                  },
                ],
              },
            ],
          },

          {
            headers: {
              Authorization:
                `Bearer ${hubspotAccessToken}`,
              "Content-Type": "application/json",
            },
          }
        );

        formId = formRes.data.id;

        console.log(
          "Form created:",
          formId
        );

        await Token.findOneAndUpdate(
          {
            hubspotPortalId: portalId,
          },
          {
            hubspotFormId: formId,
          }
        );
      } catch (err) {
        console.log(
          "Form creation error:",
          err.response?.data || err.message
        );
      }

      /*
      ============================================================
      WORKFLOW CREATION
      ============================================================
      */

      console.log(
        "FORM ID BEFORE WORKFLOW:",
        formId
      );

      try {
        console.log(
          "WAITING BEFORE WORKFLOW..."
        );

        await new Promise((resolve) =>
          setTimeout(resolve, 5000)
        );

        if (!formId) {
          throw new Error(
            "Cannot create workflow because formId is missing."
          );
        }

        const workflowRes = await axios.post(
          "https://api.hubapi.com/automation/v4/flows",
          {
            name:
              "MeetHour Meeting Scheduler Workflow",

            isEnabled: true,

            flowType: "WORKFLOW",

            type: "CONTACT_FLOW",

            objectTypeId: "0-1",

            startActionId: "1",

            nextAvailableActionId: "2",

            timeWindows: [],

            blockedDates: [],

            customProperties: {},

            suppressionListIds: [],

            enrollmentCriteria: {
              shouldReEnroll: true,

              type: "EVENT_BASED",

              eventFilterBranches: [
                {
                  filterBranches: [],

                  filters: [
                    {
                      property: "hs_form_id",

                      operation: {
                        operator:
                          "IS_ANY_OF",

                        includeObjectsWithNoValueSet:
                          false,

                        values: [
                          String(formId),
                        ],

                        operationType:
                          "ENUMERATION",
                      },

                      filterType:
                        "PROPERTY",
                    },
                  ],

                  eventTypeId:
                    "4-1639801",

                  operator:
                    "HAS_COMPLETED",

                  filterBranchType:
                    "UNIFIED_EVENTS",

                  filterBranchOperator:
                    "AND",
                },
              ],

              listMembershipFilterBranches:
                [],
            },

            actions: [
              {
                type: "WEBHOOK",

                actionId: "1",

                webhookUrl:
                  "https://meethourhubs.vercel.app/form-webhook",

                method: "POST",

                queryParams: [],
              },
            ],
          },

          {
            headers: {
              Authorization:
                `Bearer ${hubspotAccessToken}`,

              "Content-Type":
                "application/json",
            },
          }
        );

        console.log(
          "Workflow created:",
          workflowRes.data.id
        );
      } catch (err) {
        console.log(
          "FULL WORKFLOW ERROR:",
          JSON.stringify(
            err.response?.data,
            null,
            2
          )
        );

        console.log(
          "Workflow creation error:",
          err.response?.data ||
          err.message
        );
      }

      /*
      ============================================================
      INSTALLATION COMPLETE
      ============================================================
      
      Return to HubSpot's exact returnUrl.

      IMPORTANT:
      Do not redirect to MeetHour here.
      MeetHour login already happened during authorize.
      ============================================================
      */

      const finalHubSpotUrl =
        new URL(returnUrl);

      /*
       * Remove state before the final redirect.
       */

      finalHubSpotUrl.searchParams.delete(
        "state"
      );

      console.log(
        "========================================"
      );

      console.log(
        "INSTALLATION COMPLETE"
      );

      console.log(
        "REDIRECTING BACK TO HUBSPOT:"
      );

      console.log(
        finalHubSpotUrl.toString()
      );

      console.log(
        "========================================"
      );

      /*
       * Clear the installation cookie.
       */

      res.setHeader(
        "Set-Cookie",
        "meethour_install_state=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0"
      );

      return res.redirect(
        finalHubSpotUrl.toString()
      );
    }

    /*
    ============================================================
    INVALID STEP
    ============================================================
    */

    return res.status(400).send(
      "Invalid HubSpot installation step!"
    );
  } catch (err) {
    console.error(
      "OAuth Error Details:",
      {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        stack: err.stack,
      }
    );

    return res.status(500).send(
      `Installation failed! ${err.message}`
    );
  }
});

//  MeetHour Callback redirect url after meethour login
app.get("/meethour-callback", async (req, res) => {
  try {
    await connectDB();
    const token = req.query.access_token;
    if (!token) {
      return res.status(400).send("No MeetHour token found!");
    }
    const pendingRecord = await Token.findOne({ status: "pending" }).sort({
      createdAt: -1,
    });
    if (!pendingRecord) {
      return res.status(400).send("Session expired! Please reinstall the app.");
    }

    // Fetch MeetHour user profile to get user ID and timezone
    const profileRes = await axios.post(
      "https://api.meethour.io/api/v1.2/customer/user_details",
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );
    console.log("MeetHour profile:", JSON.stringify(profileRes.data, null, 2));

    const meethourUserEmail = profileRes.data?.data?.email;
    const meethourUserName = profileRes.data?.data?.name;
    const meethourUserId = profileRes.data?.data?.id;

    console.log("Updating portal:", pendingRecord.hubspotPortalId);
    console.log("Token to save:", token);

    await Token.findOneAndUpdate(
      { hubspotPortalId: pendingRecord.hubspotPortalId },
      {
        meethourAccessToken: token,
        meethourUserEmail: meethourUserEmail || null,
        meethourUserName: meethourUserName || null,
        meethourUserId: meethourUserId || null,
        status: "active",
      },
    );

    console.log(
      "MeetHour token saved for portal:",
      pendingRecord.hubspotPortalId,
    );
    console.log("MeetHour user email saved:", meethourUserEmail);

    const hubspotContinueUrl = new URL(
      pendingRecord.hubspotReturnUrl
    );

    hubspotContinueUrl.searchParams.set(
      "state",
      pendingRecord.installState
    );

    return res.redirect(hubspotContinueUrl.toString());
    
  } catch (err) {
    console.error("MeetHour Callback Error:", err.message);
    res.status(500).send("Something went wrong!");
  }
});

//random password generator
function generatePasscode() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let passcode = "";
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
        conferenceDetails: "No attendees provided",
      });
    }

    const portalId = req.body.portalId;

    if (!portalId) {
      console.log("No portalId in request");
      return res.json({
        conferenceId: "error-" + Date.now(),
        conferenceUrl: "https://meethour.io",
        conferenceDetails: "Portal ID missing",
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
        conferenceDetails: "MeetHour not connected for this account",
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
          "Content-Type": "application/json",
        },
      },
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
    const localDate = new Date(
      start.toLocaleString("en-US", { timeZone: resolvedTimezone }),
    );

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
      .filter((i) => i?.email)
      .map((i) => ({
        first_name: i.firstName,
        last_name: i.lastName || "",
        email: i.email,
      }));

    const payload = {
      meeting_name: req.body.topic,
      meeting_date,
      meeting_time,
      meeting_meridiem: meridiem,
      timezone: resolvedTimezone,
      passcode: generatePasscode(),
      attend,
      send_calendar_invite: 1,
      duration_hr,
      duration_min,
      "options": [
        "ALLOW_GUEST",
        "JOIN_ANYTIME",
        "ENABLE_LOBBY ",
        "WHITE_BOARD",
        "LIVEPAD",
        "DONOR_BOX",
        "CP_CONNECT",
      ],
      hostusers: meethourUserId ? [Number(tokenRecord.meethourUserId)] : [],
    };

    console.log("MEETHOUR PAYLOAD:", JSON.stringify(payload, null, 2));

    const response = await axios.post(
      "https://api.meethour.io/api/v1.2/meeting/schedulemeeting",
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    const meeting = response.data.data;

    const formattedTime = new Date(req.body.startTime).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: resolvedTimezone,
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
            Authorization: `Bearer ${freshHubspotToken}`,
          },
        },
      );

      const matchedOwner = ownerRes.data.results.find(
        (owner) =>
          String(owner.userId) === String(idToUse) ||
          String(owner.userIdIncludingInactive) === String(idToUse),
      );

      console.log("MATCHED OWNER:", matchedOwner);

      if (matchedOwner) {
        ownerName =
          `${matchedOwner.firstName || ""} ${matchedOwner.lastName || ""}`.trim();
      }
    }

    console.log("FINAL OWNER NAME:", ownerName);
    console.log("========== END DEBUG ==========");

    const details = `
      <b>Topic:</b> ${meeting.topic}
      <b>Date & Time:</b> ${formattedTime} (${resolvedTimezone})<br>
      <b>Meeting Url</b>: ${meeting.joinURL}<br>
      <b>Meeting ID:</b> ${meeting.meeting_id}
      <b>Passcode:</b> ${meeting.passcode}`;

    await Meeting.create({
      hubspotMeetingId: `${req.body.portalId}-${req.body.startTime}`,
      hubspotPortalId: portalId,
      meethourMeetingId: meeting.meeting_id,
      meethourMeetingUrl: meeting.joinURL,
      meetingName: req.body.topic || "HubSpot Meeting",
      conferenceId: String(meeting.id),
    });

    console.log("Meeting saved to DB!");

    return res.json({
      conferenceId: meeting.id,
      conferenceUrl: meeting.joinURL,
      conferenceDetails: details,
    });
  } catch (err) {
    console.log("ERROR:", err.response?.data || err.message);
    console.log("STACK:", err.stack);
    return res.json({
      conferenceId: "error-" + Date.now(),
      conferenceUrl: "https://meethour.io",
      conferenceDetails: "Temporary issue, try again",
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
      return res.status(400).send("Portal ID missing");
    }

    if (!conferenceId) {
      console.log(" No conferenceId found");
      return res.status(400).send("Conference ID missing");
    }

    // Fetch MeetHour token from DB
    const tokenRecord = await Token.findOne({
      hubspotPortalId: String(portalId),
    });

    if (!tokenRecord || !tokenRecord.meethourAccessToken) {
      console.log(" No MeetHour token found for portal:", portalId);
      return res.status(400).send("MeetHour not connected for this account");
    }
    const token = tokenRecord.meethourAccessToken;

    // Find meeting in DB by conferenceId
    const meetingRecord = await Meeting.findOne({
      conferenceId: String(conferenceId),
    });

    if (!meetingRecord) {
      console.log(" Meeting not found in DB");
      return res.status(404).send("Meeting not found");
    }

    console.log("Found meeting in DB:", meetingRecord.meethourMeetingId);

    // Delete meeting from MeetHour
    const response = await axios.post(
      "https://api.meethour.io/api/v1.2/meeting/deletemeeting",
      { meeting_id: meetingRecord.meethourMeetingId },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );

    console.log(" Meeting deleted from MeetHour:", response.data);

    // Delete from DB
    await Meeting.findOneAndDelete({ conferenceId: String(conferenceId) });
    console.log(" Meeting deleted from DB!");

    return res.status(200).send("Meeting deleted successfully!");
  } catch (err) {
    console.error(" Delete Meeting Error:", err.response?.data || err.message);
    return res.status(500).send("Something went wrong!");
  }
});

app.post("/deal-webhook", async (req, res) => {
  try {
    await connectDB();

    const events = req.body;
    if (!Array.isArray(events)) return res.sendStatus(200);

    for (const event of events) {
      const { subscriptionType, portalId, objectId, propertyValue } = event;

      if (subscriptionType !== "deal.propertyChange") continue;

      console.log(
        `Deal ${objectId} stage changed to: ${propertyValue} for portal: ${portalId}`,
      );

      const tokenRecord = await Token.findOne({
        hubspotPortalId: String(portalId),
      });
      console.log("tokenRecord:", tokenRecord ? "found" : "NOT FOUND");

      if (!tokenRecord || !tokenRecord.meethourAccessToken) {
        console.log("No token found for portal:", portalId);
        continue;
      }

      const hubspotToken = await refreshHubspotToken(portalId);

      const pipelineRes = await axios.get(
        "https://api.hubapi.com/crm/v3/pipelines/deals",
        { headers: { Authorization: `Bearer ${hubspotToken}` } },
      );

      const TRIGGER_LABELS = [
        "appointment scheduled",
        "presentation scheduled",
      ];
      let triggerStageIds = [];

      for (const pipeline of pipelineRes.data.results) {
        for (const stage of pipeline.stages) {
          if (TRIGGER_LABELS.includes(stage.label.toLowerCase())) {
            triggerStageIds.push(stage.id);
          }
        }
      }

      console.log("Trigger stage IDs:", triggerStageIds);
      console.log("Incoming propertyValue:", propertyValue);

      if (!triggerStageIds.includes(propertyValue)) {
        console.log("Stage not matched, skipping");
        continue;
      }

      const dealRes = await axios.get(
        `https://api.hubapi.com/crm/v3/objects/deals/${objectId}?associations=contacts&properties=dealname,dealstage,hubspot_owner_id,meeting_date,meeting_meridiem,meeting_time,timezone`,
        { headers: { Authorization: `Bearer ${hubspotToken}` } },
      );

      const deal = dealRes.data;
      const dealName = deal.properties.dealname;
      const ownerId = deal.properties.hubspot_owner_id;

      console.log("Raw meeting_date:", deal.properties.meeting_date);
      console.log("Raw meeting_time:", deal.properties.meeting_time);
      console.log("Raw meeting_meridiem:", deal.properties.meeting_meridiem);
      console.log("Raw timezone:", deal.properties.timezone);



      const contactId = deal.associations?.contacts?.results?.[0]?.id;
      if (!contactId) {
        console.log("No contact associated with deal");
        continue;
      }

      const contactRes = await axios.get(
        `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?properties=email,firstname,lastname`,
        { headers: { Authorization: `Bearer ${hubspotToken}` } },
      );
      const contact = contactRes.data.properties;

      let ownerName = "Host";
      if (ownerId) {
        const ownerRes = await axios.get(
          `https://api.hubapi.com/crm/v3/owners/${ownerId}`,
          { headers: { Authorization: `Bearer ${hubspotToken}` } },
        );
        const owner = ownerRes.data;
        ownerName = `${owner.firstName || ""} ${owner.lastName || ""}`.trim();
      }

      const meeting_date = deal.properties.meeting_date;
      // CHANGE 1: dropdown value is already a clean string like "04:00", use as-is
      const meeting_time = deal.properties.meeting_time;
      const meeting_meridiem = deal.properties.meeting_meridiem;
      const timezone = deal.properties.timezone;

      console.log("meeting_date:", meeting_date);
      console.log("meeting_time:", meeting_time, meeting_meridiem);
      console.log("timezone:", timezone);

      const meetingPayload = {
        meeting_name: dealName || "Demo Call",
        meeting_date,
        meeting_time,
        meeting_meridiem,
        timezone,
        passcode: generatePasscode(),
        attend: [
          {
            first_name: contact.firstname || "",
            last_name: contact.lastname || "",
            email: contact.email,
          },
        ],
        hostusers: tokenRecord.meethourUserId
          ? [Number(tokenRecord.meethourUserId)]
          : [],
        send_calendar_invite: 1,
      };

      const meetingRes = await axios.post(
        "https://api.meethour.io/api/v1.2/meeting/schedulemeeting",

        meetingPayload,
        {
          headers: {
            Authorization: `Bearer ${tokenRecord.meethourAccessToken}`,
            "Content-Type": "application/json",
          },
        },
      );
      console.log("MeetHour raw:", JSON.stringify(meetingRes.data, null, 2));

      if (!meetingRes.data.success) {
        console.log("MeetHour meeting creation failed:", meetingRes.data.message);
        continue;
      }

      const meeting = meetingRes.data.data;
      console.log("Meeting created:", meeting.joinURL);

      await Meeting.create({
        hubspotMeetingId: `${portalId}-${objectId}-${Date.now()}`,
        hubspotPortalId: String(portalId),
        meethourMeetingId: meeting.meeting_id,
        meethourMeetingUrl: meeting.joinURL,
        meetingName: dealName || "Demo Call",
        conferenceId: String(meeting.id),
      });
      console.log("Meeting saved to DB!");

      // CHANGE 2 & 3: log as engagement type MEETING so it shows in HubSpot Meetings tab
      const formattedTime = `${meeting_time} ${meeting_meridiem} (${timezone})`;
      const startTimestamp = new Date(
        `${meeting_date} ${meeting_time} ${meeting_meridiem}`,
      ).getTime();
      const endTimestamp = startTimestamp + 60 * 60 * 1000;

      await axios.post(
        "https://api.hubapi.com/crm/v3/objects/meetings",
        {
          properties: {
            hs_timestamp: startTimestamp || Date.now(),
            hubspot_owner_id: ownerId ? Number(ownerId) : undefined,

            hs_meeting_title: dealName,
            hs_meeting_body: `
            <b>Topic:</b> ${dealName}<br>
            <b>Date & Time:</b> ${meeting_date}, ${formattedTime}<br><br>
            <b>Meeting Url:</b> ${meeting.joinURL}<br><br>
            <b>Meeting ID:</b> ${meeting.meeting_id}<br>
            <b>Passcode:</b> ${meeting.passcode}`,

            hs_meeting_start_time: new Date(startTimestamp).toISOString(),
            hs_meeting_end_time: new Date(endTimestamp).toISOString(),

            hs_meeting_external_url: meeting.joinURL,
            hs_meeting_location: meeting.joinURL,
            hs_meeting_location_type: "VCE",
            hs_meeting_outcome: "SCHEDULED",
          },
          associations: [
            {
              to: { id: Number(contactId) },
              types: [
                {
                  associationCategory: "HUBSPOT_DEFINED",
                  associationTypeId: 200,
                },
              ],
            },
            {
              to: { id: Number(objectId) },
              types: [
                {
                  associationCategory: "HUBSPOT_DEFINED",
                  associationTypeId: 212,
                },
              ],
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${hubspotToken}`,
            "Content-Type": "application/json",
          },
        },
      );
      console.log("Meeting engagement logged for deal:", objectId);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Deal webhook error:", err.response?.data || err.message);
    res.sendStatus(200);
  }
});

//update meeting
app.post("/update-meeting", async (req, res) => {
  try {
    console.log("========== UPDATE MEETING ==========");
    console.log("BODY:", JSON.stringify(req.body, null, 2));

    await connectDB();

    const { portalId, conferenceId, topic, startTime, timezone } = req.body;

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
        }),
      );

      const meeting_date = `${istDate.getFullYear()}-${String(
        istDate.getMonth() + 1,
      ).padStart(2, "0")}-${String(istDate.getDate()).padStart(2, "0")}`;

      let hours = istDate.getHours();

      const minutes = istDate.getMinutes();

      const meeting_meridiem = hours >= 12 ? "PM" : "AM";

      hours = hours % 12 || 12;

      const meeting_time = `${String(hours).padStart(
        2,
        "0",
      )}:${String(minutes).padStart(2, "0")}`;

      editPayload.meeting_date = meeting_date;
      editPayload.meeting_time = meeting_time;
      editPayload.meeting_meridiem = meeting_meridiem;

      if (timezone) {
        editPayload.timezone = convertHubspotTimezone(timezone);
      }
    }

    console.log("EDIT PAYLOAD:", JSON.stringify(editPayload, null, 2));

    const response = await axios.post(
      "https://api.meethour.io/api/v1.2/meeting/editmeeting",
      editPayload,
      {
        headers: {
          Authorization: `Bearer ${tokenRecord.meethourAccessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    console.log("MEETHOUR RESPONSE:", JSON.stringify(response.data, null, 2));

    // DB update
    const updateData = {};

    if (topic) {
      updateData.meetingName = topic;
    }

    await Meeting.findOneAndUpdate(
      {
        conferenceId: String(conferenceId),
      },
      updateData,
    );

    return res.sendStatus(204);
  } catch (err) {
    console.error("UPDATE ERROR:", err.response?.data || err.message);

    return res.sendStatus(500);
  }
});

//scheduling meeting on form submission
app.post("/form-webhook", async (req, res) => {
  try {
    console.log("===== FORM WEBHOOK =====");

    console.log("BODY:", JSON.stringify(req.body, null, 2));

    await connectDB();

    // ======================================================
    // HUBSPOT WEBHOOK STRUCTURE
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


    let meeting_date = rawDate;

    try {
      const dateObj = new Date(parseInt(rawDate));

      const yyyy = dateObj.getUTCFullYear();

      const mm = String(dateObj.getUTCMonth() + 1).padStart(2, "0");

      const dd = String(dateObj.getUTCDate()).padStart(2, "0");

      meeting_date = `${yyyy}-${mm}-${dd}`;
    } catch (e) {
      console.log("DATE FORMAT ERROR");
    }

    // ======================================================
    // TIME FORMAT
    // 04:00
    // ======================================================

    let meeting_time = rawTime;

    if (rawTime && rawTime.includes(":")) {
      const [strHours, strMinutes] = rawTime.split(":");

      let hours = parseInt(strHours, 10);

      if (hours >= 12) {
        meeting_meridiem = "PM";

        if (hours > 12) {
          hours -= 12;
        }
      } else if (hours === 0) {
        hours = 12;

        meeting_meridiem = "AM";
      }

      meeting_time = `${String(hours).padStart(2, "0")}:${strMinutes}`;
    }

    console.log("FINAL DATE:", meeting_date);

    console.log("FINAL TIME:", meeting_time);

    console.log("FINAL MERIDIEM:", meeting_meridiem);

    // FIND CUSTOMER TOKEN

    const portalId = body["portal-id"] || body.portalId;
    console.log("PORTAL ID:", portalId);

    const tokenRecord = await Token.findOne({
      hubspotPortalId: portalId,
    });

    if (!tokenRecord || !tokenRecord.meethourAccessToken) {
      return res.status(400).json({
        success: false,
        message: "MeetHour token not found",
      });
    }

    const meethourToken = tokenRecord.meethourAccessToken;

    const meethourUserId = tokenRecord.meethourUserId;

    const ownerName = tokenRecord.meethourUserName || "Host";

    // CREATE ATTENDEE

    const attend = [
      {
        first_name: firstname,
        last_name: lastname,
        email,
      },
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
      hostusers: meethourUserId ? [Number(meethourUserId)] : [],
    };

    console.log("MEETHOUR PAYLOAD:", JSON.stringify(payload, null, 2));

    // CREATE MEETING
    const meetingRes = await axios.post(
      "https://api.meethour.io/api/v1.2/meeting/schedulemeeting",
      payload,
      {
        headers: {
          Authorization: `Bearer ${meethourToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    console.log("MEETING CREATED!");

    const meeting = meetingRes.data.data;
    await Meeting.create({
      hubspotMeetingId: `${portalId}-${Date.now()}`,
      hubspotPortalId: String(portalId),
      meethourMeetingId: meeting.meeting_id,
      meethourMeetingUrl: meeting.joinURL,
      meetingName: meeting_name,
      conferenceId: String(meeting.id),
    });

    console.log("Meeting saved to DB!");

    // CREATE HUBSPOT MEETING ACTIVITY

    const hubspotToken = await refreshHubspotToken(portalId);

    const contactId = props.hs_object_id?.value || body.vid;
    console.log("CONTACT ID:", contactId);

    if (contactId) {
      try {
        const startTimestamp = Date.now();

        let hubspotOwnerId;
        if (contactId) {
          try {
            const contactRes = await axios.get(
              `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?properties=hubspot_owner_id`,
              { headers: { Authorization: `Bearer ${hubspotToken}` } },
            );
            hubspotOwnerId = contactRes.data.properties?.hubspot_owner_id;
            console.log("CONTACT OWNER ID:", hubspotOwnerId);
          } catch (contactOwnerErr) {
            console.log(
              "CONTACT OWNER LOOKUP ERROR:",
              contactOwnerErr.response?.data || contactOwnerErr.message,
            );
          }
        }

        // Fallback: contact has no owner assigned, grab the first owner in the portal
        if (!hubspotOwnerId) {
          try {
            const ownersRes = await axios.get(
              `https://api.hubapi.com/crm/v3/owners`,
              { headers: { Authorization: `Bearer ${hubspotToken}` } },
            );
            hubspotOwnerId = ownersRes.data.results?.[0]?.id;
            console.log("FALLBACK OWNER ID:", hubspotOwnerId);
          } catch (fallbackErr) {
            console.log(
              "FALLBACK OWNER LOOKUP ERROR:",
              fallbackErr.response?.data || fallbackErr.message,
            );
          }
        }

        // Resolve the owner's actual name for the message body
        let ownerName = "Host";
        if (hubspotOwnerId) {
          try {
            const ownerDetailRes = await axios.get(
              `https://api.hubapi.com/crm/v3/owners/${hubspotOwnerId}`,
              { headers: { Authorization: `Bearer ${hubspotToken}` } },
            );
            const owner = ownerDetailRes.data;
            ownerName =
              `${owner.firstName || ""} ${owner.lastName || ""}`.trim() ||
              "Host";
            console.log("OWNER NAME:", ownerName);
          } catch (ownerDetailErr) {
            console.log(
              "OWNER DETAIL LOOKUP ERROR:",
              ownerDetailErr.response?.data || ownerDetailErr.message,
            );
          }
        }

        await axios.post(
          "https://api.hubapi.com/crm/v3/objects/meetings",
          {
            properties: {
              hs_timestamp: startTimestamp,
              hubspot_owner_id: hubspotOwnerId,

              hs_meeting_title: meeting_name,
              hs_meeting_body: `
                  <b>Topic:</b> ${meeting_name}<br>
                  <b>Date & Time:</b> ${meeting_date} ${meeting_time} ${meeting_meridiem}  ${timezone}<br><br>
                  <b>Meeting Url:</b> ${meeting.joinURL}<br><br>
                  <b>Meeting ID:</b> ${meeting.meeting_id}<br>
                  <b>Passcode:</b> ${meeting.passcode}`,

              hs_meeting_start_time: new Date(startTimestamp).toISOString(),
              hs_meeting_end_time: new Date(
                startTimestamp + 60 * 60 * 1000,
              ).toISOString(),
              hs_meeting_external_url: meeting.joinURL,
              hs_meeting_location: meeting.joinURL,
              hs_meeting_location_type: "VCE",
              hs_meeting_outcome: "SCHEDULED",
            },
            associations: [
              {
                to: { id: Number(contactId) },
                types: [
                  {
                    associationCategory: "HUBSPOT_DEFINED",
                    associationTypeId: 200,
                  },
                ],
              },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${hubspotToken}`,
              "Content-Type": "application/json",
            },
          },
        );
        console.log("MEETING ENGAGEMENT CREATED!");
      } catch (activityErr) {
        console.log(
          "ACTIVITY ERROR:",
          activityErr.response?.data || activityErr.message,
        );
      }
    }

    return res.json({
      success: true,
      joinURL: meeting.joinURL,
      meetingId: meeting.meeting_id,
    });
  } catch (err) {
    console.log("FORM WEBHOOK ERROR:", err.response?.data || err.message);

    return res.status(500).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }
});


app.get("/api/meethour-meetings", async (req, res) => {
  try {
    console.log("===== MEETHOUR MEETINGS =====");

    await connectDB();

    const { portalId, type } = req.query;

    console.log("PORTAL ID:", portalId);
    console.log("TYPE:", type);

    if (!portalId || !type) {
      return res.status(400).json({
        success: false,
        message: "portalId and type are required",
      });
    }

    const tokenRecord = await Token.findOne({
      hubspotPortalId: String(portalId),
    });

    if (!tokenRecord || !tokenRecord.meethourAccessToken) {
      return res.status(400).json({
        success: false,
        message: "MeetHour token not found",
      });
    }

    const meethourToken = tokenRecord.meethourAccessToken;

    const endpoint =
      type === "completed"
        ? "https://api.meethour.io/api/v1.2/meeting/completedmeetings"
        : "https://api.meethour.io/api/v1.2/meeting/upcomingmeetings";


    const meetingsRes = await axios.post(
      endpoint,
      {
        limit: 10,
        page: 0,
        show_all: 1,
      },
      {
        headers: {
          Authorization: `Bearer ${meethourToken}`,
          "Content-Type": "application/json",
        },
      }
    );


    const meetings = (meetingsRes.data.meetings || []).map((m) => {

      let formattedStartTime = m.start_time;

      try {
        if (m.start_time && m.timezone) {

          // Treat API start_time as UTC
          const utcDate = new Date(
            m.start_time.replace(" ", "T") + "Z"
          );

          formattedStartTime = utcDate.toLocaleString("en-IN", {
            timeZone: m.timezone,
            dateStyle: "medium",
            timeStyle: "short",
          });

        }
      } catch (error) {
        console.log(
          "TIME CONVERSION ERROR:",
          error.message
        );
      }


      return {
        id: m.id,
        topic: m.topic,

        // Converted display time
        startTime: formattedStartTime,

        // Original values (useful for debugging)
        startTimeUTC: m.start_time,
        timezone: m.timezone,

        duration: m.duration,
        joinURL: m.joinURL,
        totalAttended: m.total_attended,
        invitees: m.no_of_invitees,
        passcode: m.passcode,
      };
    });


    console.log(
      `FOUND ${meetings.length} ${type.toUpperCase()} MEETINGS`
    );


    return res.json({
      success: true,
      meetings,
    });


  } catch (err) {

    console.log(
      "MEETHOUR MEETINGS ERROR:",
      err.response?.data || err.message
    );

    return res.status(500).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }
});



// CREATE FORM & WORKFLOW FUNCTION
async function setupMeetHourHubSpot(portalId, accessToken) {
  try {
    console.log("===== STARTING HUBSPOT SETUP =====");

    // CREATE FORM
    const formPayload = {
      name: "MeetHour Meeting Scheduler",
      configuration: {
        submitText: "Schedule Meeting",
      },
      displayOptions: {
        theme: "default",
      },

      fields: [
        {
          objectTypeId: "0-1",
          name: "firstname",
          label: "First Name",
          fieldType: "single_line_text",
        },

        {
          objectTypeId: "0-1",
          name: "lastname",
          label: "Last Name",
          fieldType: "single_line_text",
        },

        {
          objectTypeId: "0-1",
          name: "email",
          label: "Email",
          fieldType: "email",
        },

        {
          objectTypeId: "0-1",
          name: "meeting_name",
          label: "Meeting Name",
          fieldType: "single_line_text",
        },

        {
          objectTypeId: "0-1",
          name: "meeting_date",
          label: "Meeting Date",
          fieldType: "datepicker",
        },

        {
          objectTypeId: "0-1",
          name: "meeting_time",
          label: "Meeting Time",
          fieldType: "single_line_text",
        },
        {
          objectTypeId: "0-1",

          name: "meeting_meridiem",
          label: "Meeting Meridiem",
          fieldType: "dropdown",

          options: [
            {
              label: "AM",
              value: "AM",
            },
            {
              label: "PM",
              value: "PM",
            },
          ],
        },

        {
          objectTypeId: "0-1",
          name: "timezone",
          label: "Timezone",
          fieldType: "single_line_text",
        },
      ],
    };

    const formRes = await axios.post(
      "https://api.hubapi.com/marketing/v3/forms",
      formPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    console.log("FORM CREATED!");

    const formId = formRes.data.id;
    console.log("FORM ID:", formId);

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
          webhookUrl: "https://meethourhubs.vercel.app/form-webhook",
          queryParams: [],
        },
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
                  values: [formId],
                  operationType: "ENUMERATION",
                },
                filterType: "PROPERTY",
              },
            ],
            filterBranches: [],
          },
        ],
        listMembershipFilterBranches: [],
      },
    };

    const workflowRes = await axios.post(
      "https://api.hubapi.com/automation/v4/flows",
      workflowPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    console.log("WORKFLOW CREATED!");

    console.log(JSON.stringify(workflowRes.data, null, 2));

    return {
      success: true,
      formId,
      workflowId: workflowRes.data.id,
    };
  } catch (err) {
    console.log("SETUP ERROR:", err.response?.data || err.message);
    return {
      success: false,
      error: err.response?.data || err.message,
    };
  }
}


//recordingd in UI
app.get("/api/meethour-recordings", async (req, res) => {
  try {
    await connectDB();

    const { portalId, type = "meethour" } = req.query;

    if (!portalId) {
      return res.status(400).json({
        success: false,
        message: "portalId required",
      });
    }

    const tokenRecord = await Token.findOne({
      hubspotPortalId: String(portalId),
    });

    if (!tokenRecord || !tokenRecord.meethourAccessToken) {
      return res.status(400).json({
        success: false,
        message: "MeetHour token not found",
      });
    }

    const filterMap = {
      meethour: "MeetHour",
      dropbox: "Dropbox",
      onedrive: "OneDrive",
      customs3: "Custom",
    };

    const filterBy = filterMap[type] || "MeetHour";

    console.log("Fetching recordings:", filterBy);

    const recRes = await axios.post(
      "https://api.meethour.io/api/v1.2/customer/videorecordinglist",
      {
        filter_by: filterBy,
        limit: 10,
        page: 0,
        show_all: 1
      },
      {
        headers: {
          Authorization: `Bearer ${tokenRecord.meethourAccessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = recRes.data;

    console.log("===== RECORDINGS DATA =====");
    console.log("Filter:", filterBy);
    console.log("Dropbox:", data.dropbox_recordings?.length || 0);
    console.log("MeetHour:", data.meethour_recordings?.length || 0);
    console.log("OneDrive:", data.onedrive_recordings?.length || 0);
    console.log("Custom:", data.custom_recordings?.length || 0);

    const all = [
      ...(data.dropbox_recordings || []),
      ...(data.onedrive_recordings || []),
      ...(data.meethour_recordings || []),
      ...(data.custom_recordings || []),
    ].map((r) => ({
      id: r.recording_id,
      topic: r.topic,
      date: r.recording_date,
      duration: r.duration,
      type: r.recording_type === "Custom" ? "CustomS3" : r.recording_type,
      path: r.recording_path,
    }));

    return res.json({
      success: true,
      recordings: all,
    });
  } catch (err) {
    console.log(
      "RECORDINGS ERROR:",
      err.response?.data || err.message
    );

    return res.status(500).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }
});

//streaming recording
app.get("/api/meethour-recording-stream", async (req, res) => {
  try {
    await connectDB();
    const { portalId, path } = req.query;

    const tokenRecord = await Token.findOne({ hubspotPortalId: String(portalId) });
    if (!tokenRecord || !tokenRecord.meethourAccessToken) {
      return res.status(400).send("Token not found");
    }

    const videoRes = await axios.get(path, {
      headers: { Authorization: `Bearer ${tokenRecord.meethourAccessToken}` },
      responseType: "stream",
    });

    res.setHeader("Content-Type", "video/mp4");
    videoRes.data.pipe(res);
  } catch (err) {
    console.log("STREAM ERROR:", err.response?.data || err.message);
    res.status(500).send("Stream failed");
  }
});

app.get("/thankyou", (req, res) => {
  res.send("Thank you for submitting the form. We will reach out to you soon.");
});

//localhost running @ 3000
if (process.env.NODE_ENV !== "production") {
  app.listen(3000, () => console.log("Server running on port 3000"));
}

module.exports = app;
