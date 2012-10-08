if (typeof ot === 'undefined') {
  var ot = {};
}

ot.Server = (function (global) {

  // Constructor. Takes the current document as a string and optionally the array
  // of all operations.
  function Server (document, operations) {
    this.document = document;
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

    var transform = operation.constructor.transform;
    return reduce.call(operations, function (newOperation, oldOperation) {
      return transform(newOperation, oldOperation)[0];
    }, operation);
  }

  // Call this method whenever you receive an operation from a client.
  Server.prototype.receiveOperation = function (revision, operation) {
    if (revision < 0 || this.operations.length < revision) {
      throw new Error("operation revision not in history");
    }
    // Find all operations that the client didn't know of when it sent the
    // operation ...
    var concurrentOperations = this.operations.slice(revision);
    // ... and transform the operation against all these operations ...
    var transformedOperation = transformAgainstAll(operation, concurrentOperations);
    // ... and apply that on the document.
    this.document = transformedOperation.apply(this.document);
    // Store operation in history.
    this.operations.push(transformedOperation);
    // Send it to all connected clients.
    this.broadcast(transformedOperation);
  };

  // Override this method.
  Server.prototype.broadcast = function (operation) {
    throw new Error("broadcast must be defined in child class");
  };

  return Server;

})(this);

if (typeof module === 'object') {
  module.exports = ot.Server;
}