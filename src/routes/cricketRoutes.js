const express = require("express");
const {
    fetchLiveScore,
    fetchCurrentIplPointsTable,
    fetchTeamMatches,
} = require("../services/cricbuzzService");

const createCricketRouter = () => {
    const router = express.Router();

    router.get("/score", async (req, res) => {
        try {
            const matches = await fetchLiveScore();

            res.json({
                success: true,
                data: matches,
            });
        } catch (err) {
            console.error(err);

            res.status(500).json({
                success: false,
                error: "Failed to fetch score",
            });
        }
    });

    router.get("/points-table", async (req, res) => {
        try {
            const pointsTable = await fetchCurrentIplPointsTable();

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

    router.get("/team-matches/:teamName", async (req, res) => {
        try {
            const result = await fetchTeamMatches(req.params.teamName);

            if (!result.ok) {
                return res.status(result.status).json(result.body);
            }

            res.json({
                success: true,
                data: result.body,
            });
        } catch (err) {
            console.error(err);

            res.status(500).json({
                success: false,
                error: "Failed to fetch team matches",
            });
        }
    });

    return router;
};

module.exports = {
    createCricketRouter,
};
