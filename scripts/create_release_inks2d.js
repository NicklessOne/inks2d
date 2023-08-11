// @ts-check

import cp from "child_process";
import https from "https";
import { fileURLToPath } from "url";
import { dirname, join } from "node:path";
import { readFile, writeFile } from "fs/promises";
import pkg from "../packages/lib/package.json" assert { type: "json" };

const _dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));

const REMOTE = "origin";
const REPO = "inkasadev/inks2d";
const CHANGELOG_MD = join(_dirname, "../CHANGELOG_inks2d.md");

/**
 * @param {string} cmd
 * @returns {Promise<string>}
 */
function exec(cmd) {
  return new Promise((resolve, reject) => {
    cp.exec(cmd, { encoding: "utf-8" }, (err, stdout, stderr) => {
      if (err) return reject(err);

      if (
        stderr.trim().length &&
        !stderr.includes(
          "LF will be replaced by CRLF the next time Git touches it"
        )
      ) {
        console.log("stderr => ", stderr);
        return reject(new Error(stderr));
      }

      resolve(stdout.trim());
    });
  });
}

async function createGitHubRelease(args) {
  const data = JSON.stringify(args);

  const options = {
    hostname: "api.github.com",
    path: `/repos/${REPO}/releases`,
    method: "POST",
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "Content-Length": data.length,
      "User-Agent": "Node",
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      if (res.statusCode !== 201) {
        reject(new Error(res.statusMessage || "Unknown status"));
      }

      const result = [];
      res.on("data", (d) => result.push(d.toString("utf-8")));
      res.on("close", () => resolve(result.join("")));
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const lastTag = await exec("git describe --tags --abbrev=0");
  const currentVersion = `v${pkg.version}`;
  const [_major, _minor, patch] = currentVersion.substring(1).split(".");

  /*
  if (lastTag == currentVersion) {
    console.log("No version change, not publishing.");
    return;
  }
  */

  console.log(`Creating release ${currentVersion}`);
  console.log("Updating changelog in ", CHANGELOG_MD);

  const heading = patch === "0" ? "#" : "##";
  let fullChangelog = await readFile(CHANGELOG_MD, "utf-8");
  let start = fullChangelog.indexOf(`${heading} ${currentVersion}`);

  // If this version isn't in the changelog yet, take everything under # Unreleased and include that
  // as this version.
  if (start === -1) {
    start = fullChangelog.indexOf("# Unreleased");

    if (start === -1) {
      start = 0;
    } else {
      start += "# Unreleased".length;
    }

    const date = new Date();
    const dateStr = [
      date.getUTCFullYear(),
      (date.getUTCMonth() + 1).toString().padStart(2, "0"), // +1 because getUTCMonth returns 0 for January
      date.getUTCDate().toString().padStart(2, "0"),
    ].join("-");

    fullChangelog =
      "# Unreleased\n\n" +
      `${heading} ${currentVersion} (${dateStr})` +
      fullChangelog.substring(start);
    start = fullChangelog.indexOf(`${heading} ${currentVersion}`);

    await writeFile(CHANGELOG_MD, fullChangelog);
    // await exec(`git add "${CHANGELOG_MD}"`);
    // await exec(`git commit -m "chore: update changelog for release"`);
    // await exec(`git push ${REMOTE}`).catch(() => {});
  }

  start = fullChangelog.indexOf("\n", start) + 1;

  let end = fullChangelog.indexOf("# v0.", start);
  end = fullChangelog.lastIndexOf("\n", end);

  console.log("Changelog => ", fullChangelog.substring(start, end));

  // console.log("Creating tag...");
  // Delete the tag if it exists already.
  /*
  await exec(`git tag -d ${currentVersion}`).catch(() => void 0);
  await exec(`git tag ${currentVersion}`);
  await exec(`git push ${REMOTE} refs/tags/${currentVersion} --quiet --force`);

  await createGitHubRelease({
    tag_name: currentVersion,
    name: currentVersion,
    body: fullChangelog.substring(start, end),
  });
  */

  console.log("OK");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
