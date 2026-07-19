/* Minimal feature polyfills so the app runs on older browser engines.
   Harmless no-ops on modern browsers. */

if (typeof window !== "undefined" && typeof window.structuredClone !== "function") {
  /* Our config objects are pure JSON, so a JSON round-trip is a faithful clone. */
  window.structuredClone = function (obj) {
    return JSON.parse(JSON.stringify(obj));
  };
}

if (typeof Object.fromEntries !== "function") {
  Object.fromEntries = function (entries) {
    var out = {};
    var arr = Array.from(entries);
    for (var i = 0; i < arr.length; i++) out[arr[i][0]] = arr[i][1];
    return out;
  };
}
