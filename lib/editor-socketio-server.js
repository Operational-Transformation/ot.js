'use strict';

var EventEmitter     = require('events').EventEmitter;
var TextOperation    = require('./text-operation');
var WrappedOperation = require('./wrapped-operation');
var Server           = require('./server');
var Selection        = require('./selection');
var util             = require('util');

function DummyLogger () {
  return {
    info: function () {},
    error: function () {},
    debug: function () {}
  };
}

function EditorSocketIOServer (document, operations, docId, mayWrite, operationCallback) {
  EventEmitter.call(this);
  Server.call(this, document, operations);
  this.users = {};
  this.docId = docId;
  this.mayWrite = mayWrite || function (_, cb) { cb(true); };
  this.operationCallback = operationCallback;
  this.isBusy = false;
  this.logger = DummyLogger();
  this.debug = false;
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

EditorSocketIOServer.prototype.setLogger = function (logger) { 
  this.logger = logger;
};

EditorSocketIOServer.prototype.debugLog = function (msg) {
  if (this.debug) {
    this.logger.debug(msg);
  }
};

EditorSocketIOServer.prototype.addClient = function (socket) {
  var self = this;
  socket
    .join(this.docId)
    .emit('doc', {
      str: this.document,
      revision: this.operations.length,
      clients: this.users
    })
    .on('operation', function (revision, operation, selection) {
      self.isBusy = true;
      socket.origin = 'operation';
      self.mayWrite(socket, function (mayWrite) {
        if (!mayWrite) {
          self.debugLog("User doesn't have the right to edit.");
          return;
        }
        try {
          var ops = self.onOperation(socket, revision, operation, selection);
          if (ops) {
            self.debugLog("new operation: " + JSON.stringify(ops));
            if (typeof self.operationCallback === 'function') {
              self.operationCallback(socket, ops, function () {
                self.isBusy = false;
              });
            } else {
              self.isBusy = false;
            }
          }
        } catch (err) {
          self.logger.error(err);
          setTimeout(function () {
            socket.emit('doc', {
              str: self.document,
              revision: self.operations.length,
              clients: self.users,
              force: true
            });
          }, 100);
          self.isBusy = false;
        }
      });
    })
    .on('get_operations', function (base, head) {
      self.onGetOperations(socket, base, head);
    })
    .on('selection', function (obj) {
      socket.origin = 'selection';
      self.mayWrite(socket, function (mayWrite) {
        if (!mayWrite) {
          self.debugLog("User doesn't have the right to edit.");
          return;
        }
        self.updateSelection(socket, obj && Selection.fromJSON(obj));
      });
    })
    .on('disconnect', function () {
      self.debugLog("Disconnect");
      socket.leave(self.docId);
      self.onDisconnect(socket);
    });
};

EditorSocketIOServer.prototype.onOperation = function (socket, revision, operation, selection) {
  var wrapped;
  try {
    wrapped = new WrappedOperation(
      TextOperation.fromJSON(operation),
      selection && Selection.fromJSON(selection)
    );
  } catch (exc) {
    this.logger.error("Invalid operation received: ");
    throw new Error(exc);
  }

  try {
    var clientId = socket.id;
    var wrappedPrime = this.receiveOperation(revision, wrapped);
    if (!wrappedPrime) {
      return;
    }
    this.getClient(clientId).selection = wrappedPrime.meta;
    revision = this.operations.length;
    socket.emit('ack', revision);
    socket.broadcast.to(this.docId).emit(
      'operation', clientId, revision,
      wrappedPrime.wrapped.toJSON(), wrappedPrime.meta
    );
    return wrappedPrime.wrapped.toJSON();
  } catch (exc) {
    throw new Error(exc);
  }
};

EditorSocketIOServer.prototype.onGetOperations = function (socket, base, head) {
  var operations = this.operations.slice(base, head).map(function (op) { return op.wrapped.toJSON(); });
  socket.emit('operations', head, operations);
};

EditorSocketIOServer.prototype.updateSelection = function (socket, selection) {
  var clientId = socket.id;
  if (selection) {
    this.getClient(clientId).selection = selection;
  } else {
    delete this.getClient(clientId).selection;
  }
  socket.broadcast.to(this.docId).emit('selection', clientId, selection);
};

EditorSocketIOServer.prototype.setName = function (socket, name) {
  var clientId = socket.id;
  this.getClient(clientId).name = name;
  socket.broadcast.to(this.docId).emit('set_name', clientId, name);
};

EditorSocketIOServer.prototype.setColor = function (socket, color) {
  var clientId = socket.id;
  this.getClient(clientId).color = color;
  socket.broadcast.to(this.docId).emit('set_color', clientId, color);
};

EditorSocketIOServer.prototype.getClient = function (clientId) {
  return this.users[clientId] || (this.users[clientId] = {});
};

EditorSocketIOServer.prototype.onDisconnect = function (socket) {
  var clientId = socket.id;
  delete this.users[clientId];
  socket.broadcast.to(this.docId).emit('client_left', clientId);
};

module.exports = EditorSocketIOServer;
