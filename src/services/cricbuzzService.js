const axios = require("axios");
const cheerio = require("cheerio");

const CRICBUZZ_BASE_URL = "https://m.cricbuzz.com";
const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_IPL_SERIES_SLUG = `indian-premier-league-${CURRENT_YEAR}`;

const cleanText = (value) => (value || "").replace(/\s+/g, " ").trim();
const normalizeLookupKey = (value) => cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");

const IPL_TEAM_DEFINITIONS = [
    { code: "RCB", name: "Royal Challengers Bengaluru", aliases: ["rcb", "royal challengers bengaluru", "royal challengers bangalore"] },
    { code: "MI", name: "Mumbai Indians", aliases: ["mi", "mumbai indians"] },
    { code: "CSK", name: "Chennai Super Kings", aliases: ["csk", "chennai super kings"] },
    { code: "KKR", name: "Kolkata Knight Riders", aliases: ["kkr", "kolkata knight riders"] },
    { code: "PBKS", name: "Punjab Kings", aliases: ["pbks", "punjab kings", "kings xi punjab"] },
    { code: "SRH", name: "Sunrisers Hyderabad", aliases: ["srh", "sunrisers hyderabad"] },
    { code: "RR", name: "Rajasthan Royals", aliases: ["rr", "rajasthan royals"] },
    { code: "DC", name: "Delhi Capitals", aliases: ["dc", "delhi capitals", "delhi daredevils"] },
    { code: "GT", name: "Gujarat Titans", aliases: ["gt", "gujarat titans"] },
    { code: "LSG", name: "Lucknow Super Giants", aliases: ["lsg", "lucknow super giants"] },
];

const IPL_TEAM_LOOKUP = IPL_TEAM_DEFINITIONS.reduce((lookup, team) => {
    lookup[normalizeLookupKey(team.code)] = team;
    lookup[normalizeLookupKey(team.name)] = team;

    team.aliases.forEach((alias) => {
        lookup[normalizeLookupKey(alias)] = team;
    });

    return lookup;
}, {});

const getIplTeamDefinition = (teamName) => IPL_TEAM_LOOKUP[normalizeLookupKey(teamName)] || null;

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

    return rows.map((row) => {
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

const getCurrentIplSeriesBaseUrl = async () => {
    const homeResponse = await axios.get(CRICBUZZ_BASE_URL);
    const home$ = cheerio.load(homeResponse.data);

    const currentSeriesHref = home$('a[href*="/cricket-series/"]')
        .map((_, element) => home$(element).attr("href"))
        .get()
        .find((href) => href && href.includes(CURRENT_IPL_SERIES_SLUG) && href.includes("/points-table"));

    if (currentSeriesHref) {
        return `${CRICBUZZ_BASE_URL}${currentSeriesHref.replace(/\/points-table$/, "")}`;
    }

    return `${CRICBUZZ_BASE_URL}/cricket-series/9241/${CURRENT_IPL_SERIES_SLUG}`;
};

const parsePointsTableMatchRows = ($, section) => {
    return section
        .find("div.grid.point-table-item-grid")
        .filter((_, row) => cleanText($(row).children("div").first().text()) !== "Opposition")
        .map((_, row) => {
            const cells = $(row).children("div");
            const resultText = cleanText(cells.eq(3).text());
            const nrrChange = parseNumber(cells.eq(4).text());
            const scoreLink = cleanText($(row).find("a").first().attr("href"));

            return {
                opposition: cleanText(cells.eq(0).text()),
                description: cleanText(cells.eq(1).text()),
                date: cleanText(cells.eq(2).text()),
                result: resultText === "-" ? null : resultText,
                nrrChange,
                hasResult: resultText !== "-",
                scoreUrl: scoreLink || null,
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
            const detailsSection = $(row).next();

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

const fetchLiveScore = async () => {
    const response = await axios.get(CRICBUZZ_BASE_URL);
    const home$ = cheerio.load(response.data);
    const matchUrl = home$('.carousal-item').first().find('a').attr('href');

    if (!matchUrl) {
        return [];
    }

    const matchResponse = await axios.get(`${CRICBUZZ_BASE_URL}${matchUrl}`);
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
            overs,
            status,
            runRate: {
                current: currentRunRate,
                target: targetRunRate,
                required: requiredRunRate,
            },
            partnership,
            batters,
            bowlers,
        });
    }

    return matches;
};

const fetchCurrentIplPointsTable = async () => {
    const seriesBaseUrl = await getCurrentIplSeriesBaseUrl();
    const response = await axios.get(`${seriesBaseUrl}/points-table`);
    const $ = cheerio.load(response.data);

    return parsePointsTableSection($);
};

const fetchTeamMatches = async (teamName) => {
    const requestedTeam = getIplTeamDefinition(teamName);

    if (!requestedTeam) {
        return {
            ok: false,
            status: 400,
            body: {
                success: false,
                error: "Unsupported team name",
                supportedTeams: IPL_TEAM_DEFINITIONS.map((team) => team.name),
            },
        };
    }

    const pointsTable = await fetchCurrentIplPointsTable();
    const teamRow = pointsTable.find((row) => normalizeLookupKey(row.team) === normalizeLookupKey(requestedTeam.code));

    if (!teamRow) {
        return {
            ok: false,
            status: 404,
            body: {
                success: false,
                error: `Team ${requestedTeam.name} was not found in the current IPL points table`,
            },
        };
    }

    const playedMatches = teamRow.matches.filter((match) => match.hasResult);
    const upcomingMatches = teamRow.matches.filter((match) => !match.hasResult);

    return {
        ok: true,
        body: {
            season: CURRENT_YEAR,
            team: {
                code: requestedTeam.code,
                name: requestedTeam.name,
                qualification: teamRow.qualification,
                pointsTable: {
                    rank: teamRow.rank,
                    played: teamRow.played,
                    won: teamRow.won,
                    lost: teamRow.lost,
                    noResult: teamRow.noResult,
                    points: teamRow.points,
                    netRunRate: teamRow.netRunRate,
                },
            },
            playedMatches,
            upcomingMatches,
        },
    };
};

module.exports = {
    fetchLiveScore,
    fetchCurrentIplPointsTable,
    fetchTeamMatches,
    getIplTeamDefinition,
    IPL_TEAM_DEFINITIONS,
};
