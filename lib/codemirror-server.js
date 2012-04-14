if (typeof ot === 'undefined') {
  var ot = {};
}

ot.CodeMirrorServer = (function (global) {

  var Operation = global.ot ? global.ot.Operation : require('./operation');
  var Server    = global.ot ? global.ot.Server    : require('./server');

  function CodeMirrorServer (str, sockets, operations, getUserName) {
    Server.call(this, str, operations);
    this.sockets = sockets;
    this.users = {};

    var self = this;
    this.sockets.on('connection', function (socket) {
      getUserName(socket, function (name) {
        self.onConnection(name, socket);
      });
    });
  }

  inherit(CodeMirrorServer, Server);

  CodeMirrorServer.prototype.broadcast = function (operation) {
    this.sockets.emit('operation', operation);
  };

  CodeMirrorServer.prototype.onConnection = function (name, socket) {
    var self = this;
    var users = this.users;

    socket.emit('doc', {
      str: self.str,
      revision: self.operations.length,
      users: users
    });

    users[name] = { cursor: 0, selectionEnd: 0 };

    socket.broadcast.emit('user_joined', { name: name, cursor: 0 });
    socket.on('operation', function (operationObj) {
      var operation;
      try {
        operation = Operation.fromJSON(operationObj);
      } catch (exc) {
        console.error("Invalid operation received: " + exc);
        return;
      }

      operation.meta.name = name;
      try {
        assert(typeof operation.meta.cursor === 'number');
        assert(typeof operation.meta.selectionEnd === 'number');
        users[name].cursor = operation.meta.cursor;
        users[name].selectionEnd = operation.meta.selectionEnd;
      } catch (exc) {
        console.error("Received operation without cursor information", operation);
      }

      try {
        self.receiveOperation(operation);
        console.log("new operation: " + operation);
      } catch (exc) {
        console.error(exc);
      }
    });

    function updateCursor (cursor, selectionEnd) {
      users[name].cursor = cursor;
      users[name].selectionEnd = selectionEnd;
      socket.broadcast.emit('cursor', {
        name: name,
        cursor: cursor,
        selectionEnd: selectionEnd
      });
    }

    socket.on('cursor', function (obj) {
      updateCursor(obj.cursor, obj.selectionEnd);
    });
    socket.on('disconnect', function () {
      console.log("Disconnect " + name);
      delete users[name];
      self.sockets.emit('user_left', { name: name });
    });
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