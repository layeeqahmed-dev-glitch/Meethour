//timezone mapping
function convertHubspotTimezone(hubspotTz) {
  if (!hubspotTz) return "Asia/Kolkata"; 

  return hubspotTz
    .split("_slash_")
    .map(part =>
      part
        .split("_")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join("_")
    )
    .join("/");
}

module.exports = convertHubspotTimezone;