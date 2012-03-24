// translation of https://github.com/djspiewak/cccp/blob/master/agent/src/main/scala/com/codecommit/cccp/agent/state.scala

var StateMachine = {
  callMethodForState: function (method) {
    var state = this.constructor.states[this.state];
    var args = Array.prototype.slice.call(arguments, 1);
    return state[method].apply(this, args);
  },
  transitionTo: function (name) {
    var args = Array.prototype.slice.call(arguments, 1);
    this.constructor.states[this.state].exit.apply(this, []);
    this.state = name;
    this.constructor.states[this.state].enter.apply(this, args);
  }
};

function extend (target, source) {
  for (var name in source) {
    if (source.hasOwnProperty(name)) {
      target[name] = source[name];
    }
  }
}

function Client (str) {
  this.version = 0;
  this.str = str;
  this.state = 'synchronized';
}

extend(Client.prototype, StateMachine);

Client.prototype.applyClient = function (operation) {
  return this.callMethodForState('applyClient', operation);
}

Client.prototype.applyServer = function (operation) {
  return this.callMethodForState('applyServer', operation);
};

Client.prototype.sendOperation = function (operation) {
  // TODO
  console.log("sendOperation: " + operation);
};

Client.prototype.applyOperation = function (operation) {
  // TODO
  console.log("applyOperation: " + operation);
};

Client.states = {
  synchronized: {
    applyClient: function (operation) {
      this.sendOperation(operation);
      this.transitionTo('awaitingConfirm', operation);
    },
    applyServer: function (operation) {
      this.applyOperation(operation);
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
      this.transitionTo('awaitingWithBuffer', this.outstanding, operation);
    },
    applyServer: function (operation) {
      if (operation.id === this.awaiting.id) {
        this.transitionTo('synchronized');
      } else {
        var pair = operational_transformation.transform(this.outstanding, operation);
        this.applyOperation(pair[1]);
        this.outstanding = pair[0];
      }
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
      this.buffer = operational_transformation.compose(this.buffer, operation);
    },
    applyServer: function (operation) {
      if (operation.id === this.outstanding.id) {
        this.sendOperation(this.buffer);
        this.transitionTo('awaitingConfirm', this.buffer);
      } else {
        var pair1 = operational_transformation.transform(this.outstanding, operation);
        this.outstanding = pair1[0];
        var operationPrime = pair1[1];
        var pair2 = operation_transformation.transform(this.buffer, operationPrime);
        this.buffer = pair2[0];
        this.applyOperation(null);
      }
    }
  }
};