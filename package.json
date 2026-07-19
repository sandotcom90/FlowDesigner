/* Compatibility single-file build:
   - ES2015 output (works on browser engines back to ~2016)
   - classic <script> (no ES modules required)
   - everything inlined into one HTML file, zero network calls
   Run: node build-compat.mjs   ->  dist/compat.html               */
import * as esbuild from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";

rmSync("compat-tmp", { recursive: true, force: true });
mkdirSync("compat-tmp", { recursive: true });

await esbuild.build({
  entryPoints: ["src/main.jsx"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2015"],
  loader: { ".jsx": "jsx" },
  define: { "process.env.NODE_ENV": '"production"' },
  outfile: "compat-tmp/app.js",
  logLevel: "info"
});

/* esbuild writes the bundled CSS next to the JS */
const js = readFileSync("compat-tmp/app.js", "utf8").replace(/<\/script/gi, "<\\/script");
const css = readFileSync("compat-tmp/app.css", "utf8").replace(/<\/style/gi, "<\\/style");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Flow Designer</title>
<style>
${css}
</style>
</head>
<body>
<div id="root">
  <div id="boot-msg" style="font-family: Consolas, monospace; max-width: 560px; margin: 80px auto; padding: 24px; border: 2px solid #38404a; border-radius: 10px; background: #fafaf7; color: #22272e; line-height: 1.6;">
    <b>Loading Flow Designer&hellip;</b>
    <div style="margin-top: 10px; font-size: 13px; color: #5b6470;">
      If this message does not disappear within a few seconds, the app's
      JavaScript did not run. Usual causes:
      <br>&bull; the file was altered in transit (line-wrapped or scripts
      stripped) &mdash; transfer it inside a <b>.zip</b> and verify the checksum
      <br>&bull; JavaScript is disabled or blocked on this machine
      <br>&bull; the browser is extremely old
    </div>
  </div>
</div>
<script>
window.addEventListener("error", function (e) {
  var m = document.getElementById("boot-msg");
  if (m) {
    m.innerHTML =
      "<b>Flow Designer failed to start</b><div style='margin-top:10px;font-size:13px;color:#b91c1c;'>" +
      (e.message || "script error") +
      "</div><div style='margin-top:10px;font-size:12px;color:#5b6470;'>Browser: " +
      navigator.userAgent +
      "<br>Please share this message for troubleshooting.</div>";
  }
});
</script>
<script>
${js}
</script>
</body>
</html>
`;

mkdirSync("dist", { recursive: true });
writeFileSync("dist/compat.html", html);
rmSync("compat-tmp", { recursive: true, force: true });
console.log("dist/compat.html written:", html.length, "bytes");
