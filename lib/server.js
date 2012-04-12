if (typeof ot === 'undefined') {
  var ot = {};
}

ot.Server = (function (global) {

  var Operation = global.ot ? global.ot.Operation : require('./operation');

  // Constructor. Takes the current document as a string and optionally the array
  // of all operations.
  function Server (str, operations) {
    this.str = str;
    this.operations = operations || [];
  }

  // Transforms a single operation against an array of operations.
  function transformAgainstAll (operation, operations) {
    // Left fold.
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

  // Call this method whenever you receive an operation from a client.
  Server.prototype.receiveOperation = function (operation) {
    if (operation.revision < 0 || this.operations.length < operation.revision) {
      throw new Error("operation revision not in history");
    }
    // Find all operations that the client didn't know of when it sent the
    // operation ...
    var concurrentOperations = this.operations.slice(operation.revision);
    // ... and transform the operation against all these operations ...
    var transformedOperation = transformAgainstAll(operation, concurrentOperations);
    // ... and apply that on the document.
    this.str = transformedOperation.apply(this.str);
    assert(transformedOperation.revision === this.operations.length);
    // Store operation in history.
    this.operations[transformedOperation.revision] = transformedOperation;
    // Send it to all connected clients.
    this.broadcast(transformedOperation);
  };

  // Override this method.
  Server.prototype.broadcast = function (operation) {
    throw new Error("broadcast must be defined in child class");
  };

  // Throws an error if the first argument is falsy. Useful for debugging.
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