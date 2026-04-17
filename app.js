/**
 * PRAJWAL WEDDING — app.js
 *
 * Hybrid of:
 *   • Envelope opening animation  (from Test_Keerthana-wedding)
 *   • Invite page logic            (from Ad_invites_2026)
 *
 * Flow:
 *   1. Page loads → envelope screen shown
 *   2. User taps envelope → 3D opening animation plays
 *   3. Invite content reveals → video + music auto-play
 *   4. Directions / Add-to-Calendar buttons → music fades, navigates away
 *   5. User returns → music fades back in, video resumes
 *
 * iOS note:
 *   Audio.play() must be called within a user gesture on iOS.
 *   We start the audio element (volume 0) immediately when the envelope
 *   is tapped — inside the gesture context — then fade it up once the
 *   invite frame is revealed 820 ms later.
 */
(function () {
  "use strict";

  /* ============================================================
     CONFIG & DEVICE DETECTION
  ============================================================ */

  var config    = window.SITE_CONFIG || {};
  var data      = (config.events || [])[0] || {};
  var studio    = config.studio   || {};

  function getInviteStorageKey(suffix) {
    var path = "/";
    try {
      path = window.location.pathname || "/";
    } catch (_) {}
    path = path.replace(/\/index\.html?$/i, "/").replace(/\/+$/, "") || "/";
    return "invite:" + path + ":" + suffix;
  }

  var storageKeys = window.INVITE_STORAGE_KEYS || {};
  var RETURN_STATE_KEY     = storageKeys.returnState || getInviteStorageKey("return-state");
  var RETURN_STATE_MAX_AGE = 30 * 60 * 1000; // 30 minutes
  var SESSION_UNLOCK_KEY   = storageKeys.sessionUnlock || getInviteStorageKey("unlock");

  window.INVITE_STORAGE_KEYS = {
    returnState: RETURN_STATE_KEY,
    sessionUnlock: SESSION_UNLOCK_KEY
  };

  var PREFERS_REDUCED_MOTION =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var ua = navigator.userAgent || "";
  var isIOSDevice =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  var navEntry = (performance.getEntriesByType("navigation") || [])[0];
  var isReloadNavigation = navEntry ? navEntry.type === "reload" : false;

  /* ============================================================
     FEATURE FLAGS (derived from site-config)
  ============================================================ */

  var eventDate =
    data.startDate && !Number.isNaN(new Date(data.startDate).getTime())
      ? new Date(data.startDate)
      : null;

  var hasCoordinates  = Boolean(data.location && data.location.lat && data.location.lng);
  var directionsQuery = data.mapQuery || data.venue || "";
  var hasDirections   =
    data.directionsEnabled !== false &&
    (hasCoordinates || Boolean(directionsQuery));
  var hasCalendar =
    data.calendarEnabled !== false &&
    Boolean(eventDate) &&
    Boolean(data.calendarTitle || data.title);
  var hasCountdown =
    data.countdownEnabled !== false && Boolean(eventDate);

  /* ============================================================
     DOM ELEMENTS
  ============================================================ */

  var envelopeScreen  = document.getElementById("envelopeScreen");
  var envelope        = document.getElementById("envelope");
  var goldenBurst     = document.getElementById("goldenBurst");
  var introTransition = document.getElementById("introTransition");
  var navDim          = document.getElementById("navDim");
  var mainContent     = document.getElementById("mainContent");
  var video           = document.getElementById("video");
  var audio           = document.getElementById("audio");
  var overlay         = document.getElementById("overlay");
  var openBtn         = document.getElementById("openBtn");
  var mapBtn          = document.getElementById("mapBtn");
  var calendarBtn     = document.getElementById("calendarBtn");
  var actionBar       = document.querySelector(".action-bar");
  var studioLink      = document.getElementById("studioLink");
  var studioLinkLabel = document.getElementById("studioLinkLabel");
  var studioLinkName  = document.getElementById("studioLinkName");

  /* ============================================================
     STATE
  ============================================================ */

  var envelopeOpened        = false;
  var inviteUnlocked        = false;
  var inviteStarted         = false;
  var soundOn               = true;
  var fadeInterval          = null;
  var navigatingAway        = false;
  var needsManualAudioUnlock = false;

  /* ============================================================
     SESSION STORAGE — invite unlock flag
     Persists across map / calendar navigation within the session.
     Cleared on page reload so the experience starts fresh.
  ============================================================ */

  try {
    if (isReloadNavigation) {
      sessionStorage.removeItem(SESSION_UNLOCK_KEY);
      sessionStorage.removeItem(RETURN_STATE_KEY);
    }
    inviteUnlocked = sessionStorage.getItem(SESSION_UNLOCK_KEY) === "1";
  } catch (_) {}

  function markInviteUnlocked() {
    inviteUnlocked = true;
    try { sessionStorage.setItem(SESSION_UNLOCK_KEY, "1"); } catch (_) {}
  }

  function canResumeInvite() {
    return inviteUnlocked || inviteStarted;
  }

  /* ============================================================
     RETURN STATE — remembers envelope-opened for 30 min
     so the envelope is skipped when the user navigates back
     from the maps / calendar app.
  ============================================================ */

  function readStoredReturnState() {
    try {
      var raw = sessionStorage.getItem(RETURN_STATE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.envelopeOpened || !s.pendingReturn) return null;
      if (typeof s.savedAt !== "number" || Date.now() - s.savedAt > RETURN_STATE_MAX_AGE) return null;
      return s;
    } catch (_) { return null; }
  }

  function clearStoredReturnState() {
    try { sessionStorage.removeItem(RETURN_STATE_KEY); } catch (_) {}
  }

  function saveReturnState() {
    if (!envelopeOpened) { clearStoredReturnState(); return; }
    try {
      sessionStorage.setItem(RETURN_STATE_KEY, JSON.stringify({
        envelopeOpened: true,
        pendingReturn: true,
        soundOn: soundOn,
        savedAt: Date.now()
      }));
    } catch (_) {}
  }

  /* ============================================================
     MEDIA SETUP
  ============================================================ */

  var mediaConfig = data.media || {};
  video.src       = mediaConfig.video  || "";
  video.poster    = mediaConfig.poster || "";
  video.muted     = true;
  video.playsInline = true;
  video.loop      = true;

  audio.src    = mediaConfig.audio || "";
  audio.volume = 1;
  audio.loop   = true;

  /* ============================================================
     STUDIO LINK SETUP
  ============================================================ */

  var studioName = studio.name ? String(studio.name).replace(/^@+/, "").trim() : "";
  var hasStudio  = Boolean(studio.enabled && studioName && studio.url);

  if (hasStudio) {
    studioLink.hidden = false;
    studioLink.href   = studio.url;
    if (studioLinkLabel) {
      studioLinkLabel.textContent = studio.label || "";
      studioLinkLabel.hidden      = !studio.label;
    }
    if (studioLinkName) studioLinkName.textContent = studioName;
  }

  /* ============================================================
     DIRECTIONS / CALENDAR BUTTON SETUP
  ============================================================ */

  if (hasDirections) {
    var dest = hasCoordinates
      ? data.location.lat + "," + data.location.lng
      : directionsQuery;
    mapBtn.href =
      "https://www.google.com/maps/dir/?api=1&destination=" +
      encodeURIComponent(dest);
  } else {
    mapBtn.hidden = true;
  }

  if (!hasCalendar)                      calendarBtn.hidden = true;
  if (!hasDirections && !hasCalendar)    actionBar.hidden   = true;

  /* ============================================================
     OVERLAY (shown only when audio is blocked after unlock)
  ============================================================ */

  function syncOverlayState() {
    overlay.style.display = needsManualAudioUnlock ? "flex" : "none";
  }

  // Start hidden — will only appear if audio gets blocked mid-session
  syncOverlayState();

  /* ============================================================
     AUDIO FADE IN / OUT
  ============================================================ */

  function stopFade() {
    clearInterval(fadeInterval);
    fadeInterval = null;
  }

  function fadeOutAudio() {
    stopFade();
    fadeInterval = setInterval(function () {
      if (audio.volume > 0.05) {
        audio.volume = Math.max(0, audio.volume - 0.05);
      } else {
        audio.volume = 0;
        audio.pause();
        stopFade();
      }
    }, 40);
  }

  /**
   * Fades audio in from 0 → 1.
   * @param {boolean} fromGesture  Pass true when called within a user gesture
   *                               context (iOS requires this to start playback).
   */
  function fadeInAudio(fromGesture) {
    if (!soundOn || navigatingAway) return;
    stopFade();
    audio.volume = 0;

    var playPromise = audio.paused ? audio.play() : Promise.resolve();

    playPromise.then(function () {
      needsManualAudioUnlock = false;
      syncOverlayState();
      fadeInterval = setInterval(function () {
        if (audio.volume < 0.95) {
          audio.volume = Math.min(1, audio.volume + 0.05);
        } else {
          audio.volume = 1;
          stopFade();
        }
      }, 40);
    }).catch(function () {
      // Audio blocked — show "Tap to Open" button over the video
      if (!fromGesture) {
        needsManualAudioUnlock = true;
        syncOverlayState();
      }
    });
  }

  /* ============================================================
     NAVIGATION WITH FADE
     Opens maps / calendar.
     - Tries window.open (new tab) first so the page stays alive.
     - Falls back to same-window navigation if popups are blocked.
     - Music fades out; resumes when user returns.
  ============================================================ */

  function navigateWithFade(url) {
    if (navigatingAway) return;
    navigatingAway = true;
    navDim.classList.add("active");
    markInviteUnlocked();
    if (soundOn) fadeOutAudio();

    var opened = false;
    try {
      var win = window.open(url, "_blank");
      if (win) {
        win.opener = null;
        opened = true;
        // If the new tab opens but focus stays here, resume after a short delay
        setTimeout(function () {
          if (!document.hidden && navigatingAway) restoreReturnedState();
        }, 700);
      }
    } catch (_) {}

    if (!opened) {
      // Popup blocked — navigate in same window; pageshow / focus will resume
      setTimeout(function () { window.location.href = url; }, 150);
    }
  }

  function restoreReturnedState() {
    navigatingAway = false;
    navDim.classList.remove("active");
    if (!canResumeInvite()) return;
    video.play().catch(function () {});
    if (soundOn) fadeInAudio(false);
  }

  /* ============================================================
     CALENDAR URL BUILDER
  ============================================================ */

  function buildCalendarUrl() {
    var start         = eventDate;
    var durationHours = Number(data.calendarDurationHours) || 2;
    var end           = new Date(start.getTime() + durationHours * 3600000);
    var fmt = function (d) {
      return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    };
    return (
      "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text="     + encodeURIComponent(data.calendarTitle || data.title || "Wedding") +
      "&dates="    + fmt(start) + "/" + fmt(end) +
      "&details="  + encodeURIComponent((data.title || "Wedding") + " at " + (data.venue || "")) +
      "&location=" + encodeURIComponent(data.venue || "")
    );
  }

  /* ============================================================
     COUNTDOWN TIMER
     Injected into DOM after action-bar; studio link after countdown.
  ============================================================ */

  var countdown = document.createElement("div");
  countdown.className = "countdown-ambient";

  var panelAnchor = (actionBar && actionBar.closest(".invite-panel")) || actionBar;

  if (hasCountdown && panelAnchor) {
    panelAnchor.after(countdown);
  }

  if (hasStudio && studioLink && panelAnchor) {
    var afterEl = hasCountdown ? countdown : panelAnchor;
    afterEl.after(studioLink);
  }

  var eventTime      = hasCountdown ? eventDate.getTime() : null;
  var countdownTimer = null;

  function updateCountdown() {
    if (!hasCountdown || eventTime === null) return;
    var diff = eventTime - Date.now();
    if (diff <= 0) {
      countdown.style.display = "none";
      clearInterval(countdownTimer);
      return;
    }
    var days  = Math.floor(diff / (1000 * 60 * 60 * 24));
    var hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    var mins  = Math.floor((diff / (1000 * 60)) % 60);
    var secs  = Math.floor((diff / 1000) % 60);
    countdown.innerHTML =
      "<div><span>" + days + "</span><small>Days</small></div>" +
      "<div><span>" + pad(hours) + "</span><small>Hours</small></div>" +
      "<div><span>" + pad(mins)  + "</span><small>Minutes</small></div>" +
      "<div><span>" + pad(secs)  + "</span><small>Seconds</small></div>";
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  if (hasCountdown) {
    countdownTimer = setInterval(updateCountdown, 1000);
    updateCountdown();
  }

  /* ============================================================
     START INVITE
     Called after the envelope opens (or when the user taps
     the fallback "Tap to Open" button if audio was blocked).
  ============================================================ */

  var videoLoader = document.getElementById("videoLoader");

  function hideVideoLoader() {
    if (videoLoader) videoLoader.classList.add("hidden");
  }

  if (video) {
    video.addEventListener("canplay", hideVideoLoader);
    video.addEventListener("playing", hideVideoLoader);
  }

  function startInvite(fromGesture) {
    fromGesture = Boolean(fromGesture);
    if (fromGesture) markInviteUnlocked();
    inviteStarted = true;
    needsManualAudioUnlock = false;
    syncOverlayState();
    video.muted = true;
    video.play().catch(function () {});
    fadeInAudio(fromGesture);
  }

  /* ============================================================
     ENVELOPE OPENING ANIMATION
     Sequence (normal motion):
       0 ms  — flap starts rotating, letter-raised removed, opening added
      180 ms — golden burst flash
      260 ms — letter starts rising (letter-raised class)
      520 ms — intro transition wipe begins
      820 ms — envelope screen fades out, invite content revealed
     1480 ms — cleanup
  ============================================================ */

  function openInvitation() {
    if (envelopeOpened) return;
    envelopeOpened = true;

    var burstDelay       = PREFERS_REDUCED_MOTION ?  80 :  180;
    var letterRiseDelay  = PREFERS_REDUCED_MOTION ?  40 :  260;
    var transitionDelay  = PREFERS_REDUCED_MOTION ? 120 :  520;
    var revealDelay      = PREFERS_REDUCED_MOTION ? 220 :  820;
    var cleanupDelay     = PREFERS_REDUCED_MOTION ? 420 : 1480;

    envelope.classList.remove("letter-raised");
    envelope.classList.add("opening");
    envelopeScreen.classList.add("is-opening");
    clearStoredReturnState();

    // ── iOS audio unlock ────────────────────────────────────────
    // audio.play() must be called inside a user gesture. The envelope
    // tap IS that gesture — so we start playback here (silently, vol 0)
    // before the setTimeout delay breaks the gesture context.
    markInviteUnlocked();
    if (isIOSDevice) {
      audio.volume = 0;
      audio.play().catch(function () {});
    }

    setTimeout(function () {
      goldenBurst.classList.add("active");
    }, burstDelay);

    setTimeout(function () {
      envelope.classList.add("letter-raised");
    }, letterRiseDelay);

    setTimeout(function () {
      introTransition.classList.add("active");
    }, transitionDelay);

    setTimeout(function () {
      // Reveal invite content
      envelopeScreen.classList.add("hidden");
      mainContent.classList.add("visible");
      goldenBurst.classList.remove("active");
      // fromGesture=true: on iOS, audio was already started above
      startInvite(true);
    }, revealDelay);

    setTimeout(function () {
      introTransition.classList.remove("active");
    }, cleanupDelay);
  }

  /* ============================================================
     RESTORE FROM RETURN STATE
     If the user previously opened the envelope this session and
     is returning from maps / calendar, skip the envelope and
     show the invite directly (with music resuming).
  ============================================================ */

  var savedState = readStoredReturnState();

  if (savedState) {
    envelopeOpened = true;
    soundOn        = savedState.soundOn !== false;
    inviteUnlocked = true;

    envelope.classList.add("opening");
    envelopeScreen.classList.add("hidden");
    mainContent.classList.add("visible");
    navDim.classList.remove("active");
    clearStoredReturnState();

    video.play().catch(function () {});
    if (soundOn) fadeInAudio(false);
  }

  /* ============================================================
     AUDIO EVENT LISTENERS
  ============================================================ */

  audio.addEventListener("playing", function () {
    needsManualAudioUnlock = false;
    syncOverlayState();
  });

  // If audio pauses unexpectedly (e.g. browser policy), show overlay
  audio.addEventListener("pause", function () {
    if (!document.hidden && inviteStarted && soundOn && !navigatingAway && !isIOSDevice) {
      needsManualAudioUnlock = true;
      syncOverlayState();
    }
  });

  /* ============================================================
     PAGE LIFECYCLE LISTENERS
     Resume video + audio when the user returns from maps/calendar.
  ============================================================ */

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      if (navigatingAway) saveReturnState();
      audio.pause();
      return;
    }
    if (!envelopeOpened || !canResumeInvite()) return;
    restoreReturnedState();
  });

  window.addEventListener("pageshow", function (e) {
    var wasNavigating = navigatingAway;
    navigatingAway = false;
    navDim.classList.remove("active");

    if (!envelopeOpened || !canResumeInvite()) {
      syncOverlayState();
      return;
    }

    syncOverlayState();
    video.play().catch(function () {});

    // Resume music on bfcache restore or same-window return
    if ((e.persisted || wasNavigating) && soundOn) {
      fadeInAudio(false);
    }
  });

  window.addEventListener("focus", function () {
    if (!navigatingAway || !envelopeOpened || !canResumeInvite()) return;
    restoreReturnedState();
  });

  window.addEventListener("pagehide", function () {
    if (envelopeOpened && navigatingAway) saveReturnState();
  });

  /* ============================================================
     BUTTON EVENT LISTENERS
  ============================================================ */

  envelopeScreen.addEventListener("click", openInvitation);

  envelope.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openInvitation();
    }
  });

  // Fallback "Tap to Open" button (only visible if audio blocked)
  openBtn.addEventListener("click", function () {
    startInvite(true);
  });

  if (mapBtn) {
    mapBtn.addEventListener("click", function (e) {
      if (!hasDirections || !mapBtn.href) { e.preventDefault(); return; }
      e.preventDefault();
      navigateWithFade(mapBtn.href);
    });
  }

  if (calendarBtn) {
    calendarBtn.addEventListener("click", function (e) {
      if (!hasCalendar || !eventDate) { e.preventDefault(); return; }
      e.preventDefault();
      navigateWithFade(buildCalendarUrl());
    });
  }

  if (studioLink) {
    studioLink.addEventListener("click", function (e) {
      var url = studioLink.getAttribute("href");
      if (!url) return;
      e.preventDefault();
      navigateWithFade(url);
    });
  }

})();
