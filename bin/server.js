#!/usr/bin/env node

var Operation = require('../lib/operation');
var CodeMirrorServer = require('../lib/codemirror-server');
var express = require('express');
var socketIO = require('socket.io');
var path = require('path');

var app = express.createServer();

app.configure(function () {
  app.use(express.logger());
  app.use(express.static(path.join(__dirname, '../integration')));
  app.use(express.static(path.join(__dirname, '../lib')));
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

var io = socketIO.listen(app);

// source: http://devcenter.heroku.com/articles/using-socket-io-with-node-js-on-heroku
io.configure('production', function () {
  io.set('transports', ['xhr-polling']); 
  io.set('polling duration', 10); 
});

var str = "lorem ipsum\ndolor sit amet";
var server = new CodeMirrorServer(str, io.sockets);

var port = process.env.PORT || 3000;
app.listen(port, function () {
  console.log("Listening on port " + port);
});

process.on('uncaughtException', function (exc) {
  console.error(exc);
});
