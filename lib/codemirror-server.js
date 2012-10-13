if (typeof ot === 'undefined') {
  var ot = {};
}

ot.CodeMirrorServer = (function (global) {

  var TextOperation    = global.ot ? global.ot.TextOperation    : require('./text-operation');
  var WrappedOperation = global.ot ? global.ot.WrappedOperation : require('./wrapped-operation');
  var Server           = global.ot ? global.ot.Server           : require('./server');
  var Cursor           = global.ot ? global.ot.Cursor           : require('./cursor');

  function CodeMirrorServer (document, sockets, operations, mayWrite) {
    Server.call(this, document, operations);
    this.sockets = sockets;
    this.users = {};
    this.mayWrite = mayWrite || function (_, cb) { cb(true); };

    var self = this;
    this.sockets.on('connection', function (socket) {
      self.onConnection(socket);
    });
  }

  inherit(CodeMirrorServer, Server);

  CodeMirrorServer.prototype.onConnection = function (socket) {
    var self = this;
    socket
      .emit('doc', {
        str: this.document,
        revision: this.operations.length,
        clients: this.users
      })
      .on('operation', function (operationObj) {
        self.mayWrite(socket, function (mayWrite) {
          if (!mayWrite) {
            console.log("User doesn't have the right to edit.");
            return;
          }
          self.onOperation(socket, operationObj);
        });
      })
      .on('cursor', function (obj) {
        self.mayWrite(socket, function (mayWrite) {
          if (!mayWrite) {
            console.log("User doesn't have the right to edit.");
            return;
          }
          self.updateCursor(socket, Cursor.fromJSON(obj));
        });
      })
      .on('disconnect', function () {
        console.log("Disconnect");
        self.onDisconnect(socket);
      });
  };

  CodeMirrorServer.prototype.onOperation = function (socket, obj) {
    var operation;
    try {
      operation = new WrappedOperation(
        TextOperation.fromJSON(obj.operation),
        Cursor.fromJSON(obj.meta.cursor)
      );
    } catch (exc) {
      console.error("Invalid operation received: " + exc);
      return;
    }

    try {
      var clientId = socket.id;
      var operationPrime = this.receiveOperation(obj.revision, operation);
      console.log("new operation: " + operation);
      this.getClient(clientId).cursor = operationPrime.meta;
      socket.emit('ack');
      socket.broadcast.emit('operation', {
        meta: { clientId: clientId, cursor: operationPrime.meta },
        operation: operationPrime.wrapped.toJSON()
      });
    } catch (exc) {
      console.error(exc);
    }
  };

  CodeMirrorServer.prototype.updateCursor = function (socket, cursor) {
    var clientId = socket.id;
    this.getClient(clientId).cursor = cursor;
    socket.broadcast.emit('cursor', { clientId: clientId, cursor: cursor });
  };

  CodeMirrorServer.prototype.setName = function (socket, name) {
    var clientId = socket.id;
    this.getClient(clientId).name = name;
    socket.broadcast.emit('set_name', { clientId: clientId, name: name });
  };

  CodeMirrorServer.prototype.getClient = function (clientId) {
    return this.users[clientId] || (this.users[clientId] = {});
  };

  CodeMirrorServer.prototype.onDisconnect = function (socket) {
    var clientId = socket.id;
    delete this.users[clientId];
    this.sockets.emit('client_left', { clientId: clientId });
  };

  // Throws an error if the first argument is falsy. Useful for debugging.
  function assert (b, msg) {
    if (!b) {
      throw new Error(msg || "assertion error");
    }
  }

  // Set Const.prototype.__proto__ to Super.prototype
  function inherit (Const, Super) {
    function F () {}
    F.prototype = Super.prototype;
    Const.prototype = new F();
    Const.prototype.constructor = Const;
  }

  return CodeMirrorServer;

}(this));

if (typeof module === 'object') {
  module.exports = ot.CodeMirrorServer;
}