if (typeof ot === 'undefined') {
  var ot = {};
}

ot.CodeMirrorServer = (function (global) {

  var Operation = global.ot ? global.ot.Operation : require('./operation');
  var Server    = global.ot ? global.ot.Server    : require('./server');

  function CodeMirrorServer (str, sockets, operations) {
    Server.call(this, str, operations);
    this.sockets = sockets;
    this.users = {};

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
    var users = this.users;

    socket.once('auth', function (auth) {
      socket.emit('doc', {
        str: self.str,
        revision: self.operations.length,
        users: users
      });

      var name = auth.name; // TODO: validate uniqueness
      users[name] = { cursor: 0 };

      socket.broadcast.emit('user_joined', { name: name, cursor: 0 });
      socket.on('operation', function (operation) {
        try {
          operation = Operation.fromJSON(operation);
        } catch (exc) {
          console.error("Invalid operation received: " + exc);
        }
        operation.meta.name = name;
        if (typeof operation.meta.index === 'number') {
          users[name].cursor = operation.meta.index;
          users[name].otherCursor = operation.meta.otherIndex;
        }
        try {
          self.receiveOperation(operation);
          console.log("new operation: " + operation);
        } catch (exc) {
          console.error(exc);
        }
      });

      function updateCursor (index, otherIndex) {
        users[name].cursor = index;
        users[name].otherCursor = otherIndex;
        socket.broadcast.emit('cursor', {
          name: name,
          index: index,
          otherIndex: otherIndex
        });
      }

      socket.on('cursor', function (obj) {
        updateCursor(obj.index, obj.otherIndex);
      });
      socket.on('disconnect', function () {
        // TODO
        console.log("Disconnect " + name);
        delete users[name];
        self.sockets.emit('user_left', { name: name });
      });
    });
  };

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