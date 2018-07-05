exports.version = '0.0.18';

exports.TextOperation        = require('./text-operation');
exports.SimpleTextOperation  = require('./simple-text-operation');
exports.Client               = require('./client');
exports.Server               = require('./server');
exports.Selection            = require('./selection');
exports.EditorSocketIOServer = require('./editor-socketio-server');

// app.use("/ot", express.static(ot.scriptsDir))
exports.scriptsDir           = require("path").resolve(__dirname, "../") + "/dist";

