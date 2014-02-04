/*global ot */

ot.SocketIOAdapter = (function () {
  'use strict';

  function SocketIOAdapter (socket) {
    this.socket = socket;

    var self = this;
    socket
      .on('client_left', function (clientId) {
        self.trigger('client_left', clientId);
      })
      .on('set_name', function (clientId, name) {
        self.trigger('set_name', clientId, name);
      })
      .on('ack', function () { self.trigger('ack'); })
      .on('operation', function (clientId, docId, operation, cursor) {
        self.trigger('operation', docId, operation);
        self.trigger('cursor', clientId, docId, cursor);
      })
      .on('cursor', function (clientId, docId, cursor) {
        self.trigger('cursor', clientId, docId, cursor);
      })
      .on('reconnect', function () {
        self.trigger('reconnect');
      });
  }

  SocketIOAdapter.prototype.sendOperation = function (docId, revision, operation, cursor) {
    this.socket.emit('operation', docId, revision, operation, cursor);
  };

  SocketIOAdapter.prototype.sendCursor = function (docId, cursor) {
    this.socket.emit('cursor', docId, cursor);
  };

  SocketIOAdapter.prototype.registerCallbacks = function (cb) {
    this.callbacks = cb;
  };

  SocketIOAdapter.prototype.trigger = function (event) {
    var args = Array.prototype.slice.call(arguments, 1);
    var action = this.callbacks && this.callbacks[event];
    if (action) { action.apply(this, args); }
  };

  return SocketIOAdapter;

}());
