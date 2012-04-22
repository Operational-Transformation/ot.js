if (typeof ot === 'undefined') {
  var ot = {};
}

ot.CodeMirrorServer = (function (global) {

  var Operation = global.ot ? global.ot.Operation : require('./operation');
  var Server    = global.ot ? global.ot.Server    : require('./server');

  function CodeMirrorServer (str, sockets, operations, mayWrite) {
    Server.call(this, str, operations);
    this.sockets = sockets;
    this.users = {};
    this.mayWrite = mayWrite || function (_, cb) { cb(true); };

    var self = this;
    this.sockets.on('connection', function (socket) {
      self.onConnection(socket);
    });
  }

  inherit(CodeMirrorServer, Server);

  CodeMirrorServer.prototype.broadcast = function (operation) {
    this.sockets.emit('operation', operation);
  };

  CodeMirrorServer.prototype.onConnection = function (socket) {
    var self = this;
    socket
      .emit('doc', {
        str: this.str,
        revision: this.operations.length,
        clients: this.users
      })
      .on('operation', function (operationObj) {
        self.mayWrite(socket, function (mayWrite) {
          if (!mayWrite) { return; }
          self.onOperation(socket, operationObj);
        });
      })
      .on('cursor', function (obj) {
        self.mayWrite(socket, function (mayWrite) {
          if (!mayWrite) { return; }
          self.updateCursor(socket, obj.cursor, obj.selectionEnd);
        });
      })
      .on('disconnect', function () {
        console.log("Disconnect");
        self.onDisconnect(socket);
      });
  };

  CodeMirrorServer.prototype.onOperation = function (socket, operationObj) {
    var operation;
    try {
      operation = Operation.fromJSON(operationObj);
    } catch (exc) {
      console.error("Invalid operation received: " + exc);
      return;
    }

    var clientId = socket.id;
    var meta = operation.meta;
    meta.clientId = clientId;
    try {
      assert(typeof meta.cursor === 'number');
      assert(typeof meta.selectionEnd === 'number');
      this.setCursor(clientId, meta.cursor, meta.selectionEnd);
    } catch (exc) {
      console.error("Received operation without cursor information", operation);
    }

    try {
      this.receiveOperation(operation);
      console.log("new operation: " + operation);
    } catch (exc) {
      console.error(exc);
    }
  };

  CodeMirrorServer.prototype.updateCursor = function (socket, cursor, selectionEnd) {
    var clientId = socket.id;
    this.setCursor(clientId, cursor, selectionEnd);
    socket.broadcast.emit('cursor', {
      clientId: clientId,
      cursor: cursor,
      selectionEnd: selectionEnd
    });
  };

  CodeMirrorServer.prototype.getClient = function (clientId) {
    return this.users[clientId] || (this.users[clientId] = {});
  };

  CodeMirrorServer.prototype.setName = function (socket, name) {
    var clientId = socket.id;
    var client = this.getClient(clientId);
    client.name = name;
    socket.broadcast.emit('set_name', {
      clientId: clientId,
      name: name
    });
  };

  CodeMirrorServer.prototype.setCursor = function (clientId, cursor, selectionEnd) {
    var client = this.getClient(clientId);
    client.cursor = cursor;
    client.selectionEnd = selectionEnd;
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

})(this);

if (typeof module === 'object') {
  module.exports = ot.CodeMirrorServer;
}