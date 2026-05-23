const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();

const cleanText = (value) => (value || "").replace(/\s+/g, " ").trim();

const parseNumber = (value) => {
    const parsedValue = parseFloat(cleanText(value).replace(/[^\d.\-]/g, ""));
    return Number.isNaN(parsedValue) ? null : parsedValue;
};

const getLabelValue = ($, root, label) => {
    const labelElement = root
        .find("span")
        .filter((_, element) => cleanText($(element).text()) === label)
        .first();

    if (!labelElement.length) {
        return null;
    }

    const nextValue = cleanText(labelElement.next("span").text());
    if (nextValue) {
        return nextValue;
    }

    const parentText = cleanText(labelElement.parent().text());
    return cleanText(parentText.replace(label, ""));
};

const parseScorecardSection = ($, sectionName) => {
    const header = $("div")
        .filter((_, element) => cleanText($(element).text()) === sectionName)
        .first();

    if (!header.length) {
        return [];
    }

    const rows = [];
    let currentRow = header.parent().parent().next();

    while (
        currentRow.length > 0 &&
        currentRow.hasClass("grid") &&
        currentRow.hasClass("scorecard-bat-grid")
    ) {
        rows.push(currentRow);
        currentRow = currentRow.next();
    }

    return rows
        .map((row) => {
            const cells = row.children("div");
            const rawName = cleanText(row.find("a").first().text());
            const isNotOut = rawName.includes("*");

            return {
                name: cleanText(rawName.replace(/\s*\*\s*/g, "")),
                notOut: isNotOut,
                runs: parseNumber(cells.eq(1).text()),
                balls: parseNumber(cells.eq(2).text()),
                fours: parseNumber(cells.eq(3).text()),
                sixes: parseNumber(cells.eq(4).text()),
                strikeRate: parseNumber(cells.eq(5).text()),
            };
        });
};

const parsePointsTableMatchRows = ($, section) => {
    return section
        .find("div.grid.point-table-item-grid")
        .map((_, row) => {
            const cells = $(row).children("div");
            const resultText = cleanText(cells.eq(3).text());
            const nrrChange = parseNumber(cells.eq(4).text());

            return {
                opposition: cleanText(cells.eq(0).text()),
                description: cleanText(cells.eq(1).text()),
                date: cleanText(cells.eq(2).text()),
                result: resultText,
                nrrChange: nrrChange,
                hasResult: resultText !== "-",
            };
        })
        .get();
};

const parsePointsTableSection = ($) => {
    return $("div.grid.point-table-grid.p-2.cursor-pointer")
        .map((_, row) => {
            const cells = $(row).children("div");
            const teamCell = cells.eq(1);
            const teamName = cleanText(teamCell.find("span").first().text());
            const qualificationTag = cleanText(teamCell.find("span").eq(1).text());
            const detailsSection = $(row).parent().next();

            return {
                rank: parseNumber(cells.eq(0).text()),
                team: teamName,
                qualification: qualificationTag || null,
                played: parseNumber(cells.eq(2).text()),
                won: parseNumber(cells.eq(3).text()),
                lost: parseNumber(cells.eq(4).text()),
                noResult: parseNumber(cells.eq(5).text()),
                points: parseNumber(cells.eq(6).text()),
                netRunRate: parseNumber(cells.eq(7).text()),
                matches: detailsSection.length ? parsePointsTableMatchRows($, detailsSection) : [],
            };
        })
        .get();
};

app.get("/score", async (req, res) => {
    try {
        const url = "https://m.cricbuzz.com/";

        //Load html
        const response = await axios.get(url);

        // Load into cheerio
        const url$ = cheerio.load(response.data);
        const matchUrl = url$('.carousal-item').first().find('a').attr('href');
        console.log(`Fetching score from: https://m.cricbuzz.com${matchUrl}`);

        const matchResponse = await axios.get(`https://m.cricbuzz.com${matchUrl}`);
        const $ = cheerio.load(matchResponse.data);
        const matches = [];

        const stickyScore = $("#sticky-mscore");
        
        
        if (stickyScore.length > 0) {
            const teamName = stickyScore.find(".font-bold.text-lg").text().trim();
            const runsWickets = stickyScore.find(".font-bold.text-center.text-3xl");
            const runs = runsWickets.find("div").eq(0).text().trim();
            const wickets = runsWickets.find("div").eq(1).text().trim().split("-")[1];
            const overs = runsWickets.find(".text-cbTxtSec").text().trim().match(/[\d.]+/)?.[0];
            const status = stickyScore.find(".text-cbLive").text().trim();
            const currentRunRate = getLabelValue($, stickyScore, "CRR");
            const targetRunRate = getLabelValue($, stickyScore, "TAR");
            const requiredRunRate = getLabelValue($, stickyScore, "REQ");
            const partnership = getLabelValue($, stickyScore, "P'SHIP");
            const batters = parseScorecardSection($, "Batter");
            const bowlers = parseScorecardSection($, "Bowler");
            
            matches.push({
                team: teamName,
                runs: parseInt(runs),
                wickets: parseInt(wickets),
                overs: overs,
                status: status,
                runRate: {
                    current: currentRunRate,
                    target: targetRunRate,
                    required: requiredRunRate,
                },
                partnership: partnership,
                batters: batters,
                bowlers: bowlers,
            });
        }

        res.json({
            success: true,
            data: matches
        });

    } catch (err) {
        console.error(err);

        res.status(500).json({
            success: false,
            error: "Failed to fetch score"
        });
    }
});

app.get("/points-table", async (req, res) => {
    try {
        const homeUrl = "https://m.cricbuzz.com/";
        const homeResponse = await axios.get(homeUrl);
        const home$ = cheerio.load(homeResponse.data);
        const pointsTableUrl = home$("a[href*='/points-table']").first().attr("href");

        if (!pointsTableUrl) {
            return res.status(404).json({
                success: false,
                error: "Points table link not found",
            });
        }

        const pointsResponse = await axios.get(`https://m.cricbuzz.com${pointsTableUrl}`);
        const $ = cheerio.load(pointsResponse.data);
        const pointsTable = parsePointsTableSection($);

        res.json({
            success: true,
            data: pointsTable,
        });
    } catch (err) {
        console.error(err);

        res.status(500).json({
            success: false,
            error: "Failed to fetch points table",
        });
    }
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});