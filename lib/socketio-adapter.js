/*global ot */

ot.SocketIOAdapter = (function () {

  function SocketIOAdapter (socket) {
    this.socket = socket;

    var self = this;
    socket
      .on('client_left', function (obj) {
        self.trigger('client_left', obj.clientId);
      })
      .on('set_name', function (obj) {
        self.trigger('set_name', obj.clientId, obj.name);
      })
      .on('ack', function () { self.trigger('ack'); })
      .on('operation', function (obj) { self.trigger('operation', obj); })
      .on('cursor', function (obj) {
        self.trigger('cursor', obj.clientId, obj.cursor);
      });
  }

  SocketIOAdapter.prototype.sendOperation = function (revision, obj) {
    obj.revision = revision;
    this.socket.emit('operation', obj);
  };

  SocketIOAdapter.prototype.sendCursor = function (obj) {
    this.socket.emit('cursor', obj);
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