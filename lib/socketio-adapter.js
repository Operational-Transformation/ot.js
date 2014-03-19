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
      .on('operation', function (clientId, operation, selection) {
        self.trigger('operation', operation);
        self.trigger('selection', clientId, selection);
      })
      .on('selection', function (clientId, selection) {
        self.trigger('selection', clientId, selection);
      })
      .on('reconnect', function () {
        self.trigger('reconnect');
      });
  }

  SocketIOAdapter.prototype.sendOperation = function (revision, operation, selection) {
    this.socket.emit('operation', revision, operation, selection);
  };

  SocketIOAdapter.prototype.sendSelection = function (selection) {
    this.socket.emit('selection', selection);
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