const express = require("express");
const { createCricketRouter } = require("./routes/cricketRoutes");

const createApp = () => {
    const app = express();

    app.use(createCricketRouter());

    return app;
};

module.exports = {
    createApp,
};

