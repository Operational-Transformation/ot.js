// translation of https://github.com/djspiewak/cccp/blob/master/agent/src/main/scala/com/codecommit/cccp/agent/state.scala

if (typeof ot === 'undefined') {
  var ot = {};
}

ot.Client = (function (global) {

  var Operation = global.ot ? global.ot.Operation : require('./operation');

  // Client constructor
  function Client (revision) {
    assert(typeof revision === 'number' && revision >= 0);
    this.serverRevision = revision; // the next expected revision number
    this.state = new Synchronized(); // start state
  }

  // Creates a new Operation that has the right revision number
  Client.prototype.createOperation = function () {
    return new Operation(this.state.newRevision(this));
  };

  // Call this method when the user changes the document.
  Client.prototype.applyClient = function (operation) {
    this.state = this.state.applyClient(this, operation);
  };

  // Call this method with a new operation from the server
  Client.prototype.applyServer = function (operation) {
    assert(operation.revision === this.serverRevision);
    this.state = this.state.applyServer(this, operation);
    this.serverRevision++;
  };

  // Override this method.
  Client.prototype.sendOperation = function (operation) {
    throw new Error("sendOperation must be defined in child class");
  };

  // Override this method.
  Client.prototype.applyOperation = function (operation) {
    throw new Error("applyOperation must be defined in child class");
  };


  // In the 'Synchronized' state, there is no pending operation that the client
  // has sent to the server.
  function Synchronized () {}

  Synchronized.prototype.applyClient = function (client, operation) {
    // When the user makes an edit, send the operation to the server and
    // switch to the 'awaitingConfirm' state
    client.sendOperation(operation);
    return new AwaitingConfirm(operation);
  };

  Synchronized.prototype.applyServer = function (client, operation) {
    // When we receive a new operation from the server, the operation can be
    // simply applied to the current document
    client.applyOperation(operation);
    return this;
  };

  Synchronized.prototype.newRevision = function (client) {
    return client.serverRevision;
  };


  // In the 'AwaitingConfirm' state, there's one operation the client has sent
  // to the server and is still waiting for an acknowledgement.
  function AwaitingConfirm (outstanding) {
    // Save the pending operation
    this.outstanding = outstanding;
  }

  AwaitingConfirm.prototype.applyClient = function (client, operation) {
    // When the user makes an edit, don't send the operation immediately,
    // instead switch to 'awaitingWithBuffer' state
    assert(operation.revision === client.serverRevision + 1);
    return new AwaitingWithBuffer(this.outstanding, operation);
  };

  AwaitingConfirm.prototype.applyServer = function (client, operation) {
    if (operation.id === this.outstanding.id) {
      // The client's operation has been acknowledged
      // => switch to synchronized state
      return new Synchronized();
    }

    // This is another client's operation. Visualization:
    //
    //                   /\
    // this.outstanding /  \ operation
    //                 /    \
    //                 \    /
    //  pair[1]         \  / pair[0] (new this.outstanding)
    //  (can be applied  \/
    //  to the client's
    //  current document)
    var pair = Operation.transform(this.outstanding, operation);
    client.applyOperation(pair[1]);
    return new AwaitingConfirm(pair[0]);
  };

  AwaitingConfirm.prototype.newRevision = function (client) {
    return client.serverRevision + 1;
  };


  // In the 'AwaitingWithBuffer' state, the client is waiting for an operation
  // to be acknowledged by the server while buffering the edits the user makes
  function AwaitingWithBuffer (outstanding, buffer) {
    // Save the pending operation and the user's edits since then
    this.outstanding = outstanding;
    this.buffer = buffer;
  }

  AwaitingWithBuffer.prototype.applyClient = function (client, operation) {
    // Compose the user's changes into the buffer
    assert(operation.revision === client.serverRevision + 2);
    var newBuffer = this.buffer.compose(operation);
    return new AwaitingWithBuffer(this.outstanding, newBuffer);
  };

  AwaitingWithBuffer.prototype.applyServer = function (client, operation) {
    if (operation.id === this.outstanding.id) {
      // The pending operation has been acknowledged
      // => send buffer
      client.sendOperation(this.buffer);
      return new AwaitingConfirm(this.buffer);
    }

    // Operation comes from another client
    //
    //                       /\
    //     this.outstanding /  \ operation
    //                     /    \
    //                    /\    /
    //       this.buffer /  \* / pair1[0] (new this.outstanding)
    //                  /    \/
    //                  \    /
    //          pair2[1] \  / pair2[0] (new this.buffer)
    // the transformed    \/
    // operation -- can
    // be applied to the
    // client's current
    // document
    //
    // * pair1[1]
    var pair1 = Operation.transform(this.outstanding, operation);
    var pair2 = Operation.transform(this.buffer, pair1[1]);
    client.applyOperation(pair2[1]);
    return new AwaitingWithBuffer(pair1[0], pair2[0]);
  };

  AwaitingWithBuffer.prototype.newRevision = function (client) {
    return client.serverRevision + 2;
  };


  // Throws an error if the first argument is falsy. Useful for debugging.
  function assert (b, msg) {
    if (!b) {
      throw new Error(msg || "assertion error");
    }
  }

  return Client;

})(this);

if (typeof module === 'object') {
  module.exports = ot.Client;
}