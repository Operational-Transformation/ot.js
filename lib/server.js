var server = (function (global) {

  var operational_transformation = global.operational_transformation || require('./operational-transformation');

  var Listener = {
    addListener: function (eventName, fn) {
      var events = this.events || (this.events = {});
      var event = events[eventName] || (events[eventName] = []);
      event.push(fn);
    },

    removeListener: function (eventName, fn) {
      var events;
      if (events = this.events) {
        if (fn) {
          var event = events[eventName];
          var i = event.indexOf(fn);
          if (i !== -1) {
            event.splice(i, 1);
          }
        } else {
          delete events[eventName];
        }
      }
    },

    fire: function (eventName) {
      var args = Array.prototype.slice.call(arguments, 1);
      var events, event;
      if (events = this.events && event = events[eventName]) {
        for (var i = 0, i < event.length; i++) {
          event[i].apply(this, args);
        }
      }
    }
  };

  function extend (target, source) {
    for (var name in source) {
      if (source.hasOwnProperty(name)) {
        target[name] = source[name];
      }
    }
  }

  function Server (str) {
    this.str = str;
    this.operations = [];
  }

  extend(Server.prototype, Listener);

  function transformAgainstAll (operation, operations) {
    var reduce = Array.prototype.reduce || function (fn, val) {
      var arr = this;
      for (var i = 0, l = arr.length; i < l; i++) {
        val = fn(val, arr[i]);
      }
      return val;
    };

    var transform = operational_transformation.transform;
    return reduce.call(operations, function (newOperation, oldOperation) {
      return transform(newOperation, oldOperation)[0];
    }, operation);
  }

  Server.prototype.receiveOperation = function (operation) {
    var baseRevision = operation.baseRevision;
    if (baseRevision < 0 || this.operations.length < baseRevision) {
      throw new Error("operation base revision not in history");
    }
    var transformedOperation = transformAgainstAll(operation, this.operations.slice(baseRevision));
    this.str = operational_transformation.apply(this.str, transformedOperation);
    this.broadcast(transformedOperation);
  };

  Server.prototype.broadcast = function (operation) {
    this.fire('newOperation', operation);
  };

  return {
    Server: Server
  };

})(this);

if (typeof module === 'object') {
  module.exports = server;
}