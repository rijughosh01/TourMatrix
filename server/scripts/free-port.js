/* eslint-disable no-console */
const { execSync } = require("child_process");

const port = String(parseInt(process.env.PORT || "5001", 10));

function killOnWindows(targetPort) {
  const output = execSync(`netstat -ano | findstr :${targetPort}`, { encoding: "utf8" });
  const lines = output
    .split(/\r?\n/)
    .map(function (line) {
      return line.trim();
    })
    .filter(Boolean);

  const pids = Array.from(
    new Set(
      lines
        .map(function (line) {
          const parts = line.split(/\s+/);
          return parts[parts.length - 1];
        })
        .filter(Boolean)
    )
  );

  pids.forEach(function (pid) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
      console.log(`[dev] Freed port ${targetPort} (killed PID ${pid})`);
    } catch (_) {
      /* ignore individual failures */
    }
  });
}

function killOnUnix(targetPort) {
  try {
    execSync(`lsof -ti tcp:${targetPort} | xargs kill -9`, { stdio: "ignore" });
    console.log(`[dev] Freed port ${targetPort}`);
  } catch (_) {
    /* no listener or tool unavailable */
  }
}

try {
  if (process.platform === "win32") {
    killOnWindows(port);
  } else {
    killOnUnix(port);
  }
} catch (_) {
  // No process was bound to this port; continue startup.
}
