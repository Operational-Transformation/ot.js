/**
 * This is based on original codemirror-server but support
 * multiple documents in the same namespace and instance of socket.io.
 *
 * Every document has a docId and is edited inside a socket.io ROOM
 * with name equals to the docId.
 * 
 * Every broadcast is done to clients in the room.
 *
 * The server does not automatically connect every socket to itself, 
 * you have to manually call server.hook(socket, name) in order to connect.
 * 
 * The server has a pseudo-event named 'EmptyRoom', server.onEmptyRoom = func..
 * you can use this method to dispose the server from memory 
 * when all users leave the room. 
 */

if (typeof ot === 'undefined') {
  var ot = {};
}

ot.CodeMirrorServer = (function (global) {

  var TextOperation    = global.ot ? global.ot.TextOperation    : require('./text-operation');
  var WrappedOperation = global.ot ? global.ot.WrappedOperation : require('./wrapped-operation');
  var Server           = global.ot ? global.ot.Server           : require('./server');
  var Cursor           = global.ot ? global.ot.Cursor           : require('./cursor');

  function CodeMirrorServer (docId, document, operations, mayWrite) {
    Server.call(this, document, operations);
    this.users = {};
    this.docId = docId;
    this.mayWrite = mayWrite || function (_, cb) { cb(true); };
  }

  inherit(CodeMirrorServer, Server);

  CodeMirrorServer.prototype.hook = function (socket, name) {
    var self = this;
    socket
      .join(this.docId)
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
          self.updateCursor(socket, obj && Cursor.fromJSON(obj));
        });
      })
      .on('disconnect', function () {
        console.log("Disconnect");
        socket.leave(self.docId);
        self.onDisconnect(socket);
        if (socket.manager.sockets.clients(self.docId).length === 0 && self.onEmptyRoom) {
          //emit event
          self.onEmptyRoom();
        }
      });

    this.setName(socket, name);
  };

  CodeMirrorServer.prototype.onOperation = function (socket, obj) {
    var operation;
    try {
      operation = new WrappedOperation(
        TextOperation.fromJSON(obj.operation),
        obj.meta.cursor && Cursor.fromJSON(obj.meta.cursor)
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
      socket.broadcast.in(this.docId).emit('operation', {
        meta: { clientId: clientId, cursor: operationPrime.meta },
        operation: operationPrime.wrapped.toJSON()
      });
    } catch (exc) {
      console.error(exc);
    }
  };

  CodeMirrorServer.prototype.updateCursor = function (socket, cursor) {
    var clientId = socket.id;
    if (cursor) {
      this.getClient(clientId).cursor = cursor;
    } else {
      delete this.getClient(clientId).cursor;
    }
    socket.broadcast.in(this.docId).emit('cursor', { clientId: clientId, cursor: cursor });
  };

  CodeMirrorServer.prototype.setName = function (socket, name) {
    var clientId = socket.id;
    this.getClient(clientId).name = name;
    socket.broadcast.in(this.docId).emit('set_name', { clientId: clientId, name: name });
  };

  CodeMirrorServer.prototype.getClient = function (clientId) {
    return this.users[clientId] || (this.users[clientId] = {});
  };

  CodeMirrorServer.prototype.onDisconnect = function (socket) {
    var clientId = socket.id;
    delete this.users[clientId];
    socket.broadcast.in(this.docId).emit('client_left', { clientId: clientId });
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