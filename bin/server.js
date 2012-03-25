#!/usr/bin/env node

var ot = require('../lib/operational-transformation');
var Server = require('../lib/server').Server;
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

var server = new Server(str);

server.addListener('newOperation', function (operation) {
  io.sockets.emit('operation', operation);
});

io.sockets.on('connection', function (socket) {
  socket.emit('doc', { str: server.str, revision: server.operations.length });
  socket.on('operation', function (operation) {
    operation = ot.Operation.fromJSON(operation);
    server.receiveOperation(operation);
    console.log("new operation: " + operation);
  });
});

app.listen(3000, function () {
  console.log("Listening on port 3000");
});