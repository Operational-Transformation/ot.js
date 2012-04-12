// translation of https://github.com/djspiewak/cccp/blob/master/agent/src/main/scala/com/codecommit/cccp/agent/state.scala

if (typeof ot === 'undefined') {
  var ot = {};
}

ot.Client = (function (global) {

  var Operation = global.ot ? global.ot.Operation : require('./operation');

  // Object that can be mixed into a constructor's prototype object. Requires a
  // 'states' property that is an object containing the possible states of the
  // object with the associated method definitions and a 'state' property
  // containing the name of the current state as a string.
  var StateMachine = {
    callMethodForState: function (method) {
      var args = Array.prototype.slice.call(arguments, 1);
      return this.states[this.state][method].apply(this, args);
    },

    // Transitions to a new state given by the first argument. Calls the exit
    // method of the old state first and calls the enter method of the new state
    // with the rest of the arguments.
    transitionTo: function (name) {
      var args = Array.prototype.slice.call(arguments, 1);
      this.states[this.state].exit.apply(this, []);
      this.states[this.state = name].enter.apply(this, args);
    }
  };

  // Client constructor
  function Client (revision) {
    assert(typeof revision === 'number' && revision >= 0);
    this.serverRevision = revision; // the next expected revision number
    this.state = 'synchronized'; // start in 'synchronized' state
  }

  extend(Client.prototype, StateMachine);

  // Creates a new Operation that has the right revision number
  Client.prototype.createOperation = function () {
    return new Operation(this.callMethodForState('newRevision'));
  };

  // Call this method when the user changes the document.
  Client.prototype.applyClient = function (operation) {
    return this.callMethodForState('applyClient', operation);
  };

  // Call this method with a new operation from the server
  Client.prototype.applyServer = function (operation) {
    assert(operation.revision === this.serverRevision);
    this.callMethodForState('applyServer', operation);
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

  Client.prototype.states = {
    // In the 'synchronized' state, there is no pending operation that the client
    // has sent to the server.
    synchronized: {
      enter: function () {},
      exit: function () {},
      // When the user makes an edit, send the operation to the server and
      // switch to the 'awaitingConfirm' state
      applyClient: function (operation) {
        this.sendOperation(operation);
        this.transitionTo('awaitingConfirm', operation);
      },
      // When we receive a new operation from the server, the operation can be
      // simply applied to the current document
      applyServer: function (operation) {
        this.applyOperation(operation);
      },
      newRevision: function () {
        return this.serverRevision;
      }
    },

    // In the 'awaitingConfirm' state, there's one operation the client has sent
    // to the server and is still waiting for an acknoledgement.
    awaitingConfirm: {
      enter: function (outstanding) {
        // Save the pending operation
        this.outstanding = outstanding;
      },
      exit: function () {
        delete this.outstanding;
      },
      // When the user makes an edit, don't send the operation immediately,
      // instead switch to 'awaitingWithBuffer' state
      applyClient: function (operation) {
        assert(operation.revision === this.serverRevision + 1);
        this.transitionTo('awaitingWithBuffer', this.outstanding, operation);
      },
      applyServer: function (operation) {
        if (operation.id === this.outstanding.id) {
          // The client's operation has been acknowledged
          // => switch to synchronized state
          this.transitionTo('synchronized');
        } else {
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
          this.outstanding = pair[0];
          this.applyOperation(pair[1]);
        }
      },
      newRevision: function () {
        return this.serverRevision + 1;
      }
    },

    // In the 'awaitingWithBuffer' state, the client is waiting for an operation
    // to be acknoledged by the server while buffering the edits the user makes
    awaitingWithBuffer: {
      enter: function (outstanding, buffer) {
        // Save the pending operation and the user's edits since then
        this.outstanding = outstanding;
        this.buffer = buffer;
      },
      exit: function () {
        delete this.outstanding;
        delete this.buffer;
      },
      applyClient: function (operation) {
        // Compose the user's changes into the buffer
        assert(operation.revision === this.serverRevision + 2);
        this.buffer = this.buffer.compose(operation);
      },
      applyServer: function (operation) {
        if (operation.id === this.outstanding.id) {
          // The pending operation has been acknowledged
          // => send buffer
          this.sendOperation(this.buffer);
          this.transitionTo('awaitingConfirm', this.buffer);
        } else {
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
          this.outstanding = pair1[0];
          var operationPrime = pair1[1];
          var pair2 = Operation.transform(this.buffer, operationPrime);
          this.buffer = pair2[0];
          this.applyOperation(pair2[1]);
        }
      },
      newRevision: function () {
        return this.serverRevision + 2;
      }
    }
  };

  // Copies all non-inherited key-value pairs of source to target.
  function extend (target, source) {
    for (var name in source) {
      if (source.hasOwnProperty(name)) {
        target[name] = source[name];
      }
    }
  }

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