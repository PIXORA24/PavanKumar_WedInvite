// ============================================================
// PAVAN KUMAR & LAKSHMI TEJA SRI — SITE CONFIGURATION
// ============================================================

window.SITE_CONFIG = {

  // -- Studio branding shown at the bottom of the invite --
  studio: {
    enabled: true,
    name:    "Pixora24",
    label:   "Crafted by",
    url:     "https://www.instagram.com/pixora24?igsh=eWRldmc2emluNzU="
  },

  // -- Single wedding event --
  events: [
    {
      key:   "wedding",

      pageTitle: "Pavan Kumar & Lakshmi Teja Sri — Wedding Invitation",

      // -------------------------------------------------------
      // MEDIA — drop files in /assets/ and update paths below
      // -------------------------------------------------------
      media: {
        video:  "assets/video.mp4",
        audio:  "assets/music.mp3",
        poster: "assets/poster.webp"
      },

      // -------------------------------------------------------
      // EVENT DETAILS
      // -------------------------------------------------------
      startDate:            "2026-04-29T11:17:00+05:30",
      calendarDurationHours: 4,
      calendarTitle:        "Pavan Kumar & Lakshmi Teja Sri Wedding",
      title:                "Wedding Ceremony",

      venue:    "Sri Srinivasa Kalyana Madapam, 13th Ward, Macherla",
      mapQuery: "Sri Srinivasa Kalyana Madapam, 13th Ward, Macherla",

      // Coordinates (used for Google Maps Directions button)
      location: {
        lat: "16.474159338676227",
        lng: "79.43635581257163"
      },

      directionsEnabled: true,
      calendarEnabled:   true,
      countdownEnabled:  true
    }
  ]
};
