// translation of https://github.com/djspiewak/cccp/blob/master/agent/src/main/scala/com/codecommit/cccp/agent/state.scala

var ot_client = (function (global) {

  var Operation = global.ot ? global.ot.Operation : require('./operation');

  var StateMachine = {
    callMethodForState: function (method) {
      var args = Array.prototype.slice.call(arguments, 1);
      return this.states[this.state][method].apply(this, args);
    },

    transitionTo: function (name) {
      var args = Array.prototype.slice.call(arguments, 1);
      this.states[this.state].exit.apply(this, []);
      this.states[this.state = name].enter.apply(this, args);
    }
  };

  function extend (target, source) {
    for (var name in source) {
      if (source.hasOwnProperty(name)) {
        target[name] = source[name];
      }
    }
  }

  function assert (b, msg) {
    if (!b) {
      throw new Error(msg || "assertion error");
    }
  }

  function Client (revision) {
    assert(typeof revision === 'number' && revision >= 0);
    this.serverRevision = revision;
    this.state = 'synchronized';
  }

  extend(Client.prototype, StateMachine);

  Client.prototype.createOperation = function () {
    return new Operation(this.callMethodForState('newRevision'));
  };

  Client.prototype.applyClient = function (operation) {
    return this.callMethodForState('applyClient', operation);
  };

  Client.prototype.applyServer = function (operation) {
    assert(operation.revision === this.serverRevision);
    this.callMethodForState('applyServer', operation);
    this.serverRevision++;
  };

  Client.prototype.sendOperation = function (operation) {
    throw new Error("sendOperation must be defined in child class");
  };

  Client.prototype.applyOperation = function (operation) {
    throw new Error("applyOperation must be defined in child class");
  };

  Client.prototype.states = {
    synchronized: {
      enter: function () {},
      exit: function () {},
      applyClient: function (operation) {
        this.sendOperation(operation);
        this.transitionTo('awaitingConfirm', operation);
      },
      applyServer: function (operation) {
        this.applyOperation(operation);
      },
      newRevision: function () {
        return this.serverRevision;
      }
    },

    awaitingConfirm: {
      enter: function (outstanding) {
        this.outstanding = outstanding;
      },
      exit: function () {
        delete this.outstanding;
      },
      applyClient: function (operation) {
        assert(operation.revision === this.serverRevision + 1);
        this.transitionTo('awaitingWithBuffer', this.outstanding, operation);
      },
      applyServer: function (operation) {
        if (operation.id === this.outstanding.id) {
          this.transitionTo('synchronized');
        } else {
          var pair = Operation.transform(this.outstanding, operation);
          this.applyOperation(pair[1]);
          this.outstanding = pair[0];
        }
      },
      newRevision: function () {
        return this.serverRevision + 1;
      }
    },

    awaitingWithBuffer: {
      enter: function (outstanding, buffer) {
        this.outstanding = outstanding;
        this.buffer = buffer;
      },
      exit: function () {
        delete this.outstanding;
        delete this.buffer;
      },
      applyClient: function (operation) {
        assert(operation.revision === this.serverRevision + 2);
        this.buffer = this.buffer.compose(operation);
      },
      applyServer: function (operation) {
        if (operation.id === this.outstanding.id) {
          this.sendOperation(this.buffer);
          this.transitionTo('awaitingConfirm', this.buffer);
        } else {
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

  return {
    Client: Client
  };

})(this);

if (typeof module === 'object') {
  module.exports = ot_client;
}