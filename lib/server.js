if (typeof ot === 'undefined') {
  var ot = {};
}

ot.Server = (function (global) {

  var Operation = global.ot ? global.ot.Operation : require('./operation');

  function Server (str, operations) {
    this.str = str;
    this.operations = operations || [];
  }

  function transformAgainstAll (operation, operations) {
    var reduce = Array.prototype.reduce || function (fn, val) {
      var arr = this;
      for (var i = 0, l = arr.length; i < l; i++) {
        val = fn(val, arr[i]);
      }
      return val;
    };

    var transform = Operation.transform;
    return reduce.call(operations, function (newOperation, oldOperation) {
      return transform(newOperation, oldOperation)[0];
    }, operation);
  }

  Server.prototype.receiveOperation = function (operation) {
    if (operation.revision < 0 || this.operations.length < operation.revision) {
      throw new Error("operation revision not in history");
    }
    var concurrentOperations = this.operations.slice(operation.revision);
    var transformedOperation = transformAgainstAll(operation, concurrentOperations);
    this.str = transformedOperation.apply(this.str);
    assert(transformedOperation.revision === this.operations.length);
    this.operations[transformedOperation.revision] = transformedOperation;
    this.broadcast(transformedOperation);
  };

  Server.prototype.broadcast = function (operation) {
    throw new Error("broadcast must be defined in child class");
  };

  function assert (b, msg) {
    if (!b) {
      throw new Error(msg || "assertion error");
    }
  }

  return Server;

})(this);

if (typeof module === 'object') {
  module.exports = ot.Server;
}