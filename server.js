const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();

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
            
            matches.push({
                team: teamName,
                runs: parseInt(runs),
                wickets: parseInt(wickets),
                overs: overs,
                status: status
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

app.listen(3000, () => {
    console.log("Server running on port 3000");
});