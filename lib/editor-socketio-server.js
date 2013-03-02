'use strict';

var EventEmitter     = require('events').EventEmitter;
var TextOperation    = require('./text-operation');
var WrappedOperation = require('./wrapped-operation');
var Server           = require('./server');
var Cursor           = require('./cursor');
var util             = require('util');

function EditorSocketIOServer (document, operations, docId, mayWrite) {
  EventEmitter.call(this);
  Server.call(this, document, operations);
  this.users = {};
  this.docId = docId;
  this.mayWrite = mayWrite || function (_, cb) { cb(true); };
}

util.inherits(EditorSocketIOServer, Server);
extend(EditorSocketIOServer.prototype, EventEmitter.prototype);

function extend (target, source) {
  for (var key in source) {
    if (source.hasOwnProperty(key)) {
      target[key] = source[key];
    }
  }
}

EditorSocketIOServer.prototype.addClient = function (socket) {
  var self = this;
  socket
    .join(this.docId)
    .emit('doc', {
      str: this.document,
      revision: this.operations.length,
      clients: this.users
    })
    .on('operation', function (revision, operation, cursor) {
      self.mayWrite(socket, function (mayWrite) {
        if (!mayWrite) {
          console.log("User doesn't have the right to edit.");
          return;
        }
        self.onOperation(socket, revision, operation, cursor);
      });
    })
    .on('cursor', function (obj) {
      self.mayWrite(socket, function (mayWrite) {
        if (!mayWrite) {
          console.log("User doesn't have the right to edit.");
          return;
        }
        self.updateCursor(socket, obj && Cursor.fromJSON(obj));
      });
    })
    .on('disconnect', function () {
      console.log("Disconnect");
      socket.leave(self.docId);
      self.onDisconnect(socket);
      if (socket.manager.sockets.clients(self.docId).length === 0) {
        self.emit('empty-room');
      }
    });
};

EditorSocketIOServer.prototype.onOperation = function (socket, revision, operation, cursor) {
  var wrapped;
  try {
    wrapped = new WrappedOperation(
      TextOperation.fromJSON(operation),
      cursor && Cursor.fromJSON(cursor)
    );
  } catch (exc) {
    console.error("Invalid operation received: " + exc);
    return;
  }

  try {
    var clientId = socket.id;
    var wrappedPrime = this.receiveOperation(revision, wrapped);
    console.log("new operation: " + wrapped);
    this.getClient(clientId).cursor = wrappedPrime.meta;
    socket.emit('ack');
    socket.broadcast['in'](this.docId).emit(
      'operation', clientId,
      wrappedPrime.wrapped.toJSON(), wrappedPrime.meta
    );
  } catch (exc) {
    console.error(exc);
  }
};

EditorSocketIOServer.prototype.updateCursor = function (socket, cursor) {
  var clientId = socket.id;
  if (cursor) {
    this.getClient(clientId).cursor = cursor;
  } else {
    delete this.getClient(clientId).cursor;
  }
  socket.broadcast['in'](this.docId).emit('cursor', clientId, cursor);
};

EditorSocketIOServer.prototype.setName = function (socket, name) {
  var clientId = socket.id;
  this.getClient(clientId).name = name;
  socket.broadcast['in'](this.docId).emit('set_name', clientId, name);
};

EditorSocketIOServer.prototype.getClient = function (clientId) {
  return this.users[clientId] || (this.users[clientId] = {});
};

EditorSocketIOServer.prototype.onDisconnect = function (socket) {
  var clientId = socket.id;
  delete this.users[clientId];
  socket.broadcast['in'](this.docId).emit('client_left', clientId);
};

module.exports = EditorSocketIOServer;