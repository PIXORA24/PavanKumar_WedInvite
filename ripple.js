/**
 * ripple.js — click ripple effect for elements with class "ripple"
 * Unchanged from Ad_invites_2026. Not used on the invite page itself
 * (no cards here), but kept for any future landing-page additions.
 */
document.addEventListener("click", function (e) {
  var target = e.target.closest(".ripple");
  if (!target) return;

  var rect   = target.getBoundingClientRect();
  var size   = Math.max(rect.width, rect.height);
  var x      = e.clientX - rect.left  - size / 2;
  var y      = e.clientY - rect.top   - size / 2;
  var ripple = document.createElement("span");

  ripple.style.width  = ripple.style.height = size + "px";
  ripple.style.left   = x + "px";
  ripple.style.top    = y + "px";
  ripple.className    = "ripple-effect";

  target.appendChild(ripple);
  setTimeout(function () { ripple.remove(); }, 600);
});
