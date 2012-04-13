ot.CodeMirrorClient = (function () {
  var Client = ot.Client;
  var Operation = ot.Operation;

  function CodeMirrorClient (revision, cm, socket, name, users) {
    Client.call(this, revision);

    this.cm = cm;
    this.socket = socket;
    this.name = name;
    this.users = users || {};

    this.fromServer = false;
    this.oldValue = cm.getValue();

    this.unredo = false;
    this.undoStack = [];
    this.redoStack = [];

    this.initializeSocket();
    this.initializeCodeMirror();
    this.initializeUsers();
    this.onCodeMirrorCursorActivity();
  }

  inherit(CodeMirrorClient, Client);

  CodeMirrorClient.prototype.applyClient = function (operation) {
    operation.meta.cursor = this.cursor;
    operation.meta.selectionEnd = this.selectionEnd;
    clearTimeout(this.sendCursorTimeout);
    Client.prototype.applyClient.call(this, operation);
  };

  CodeMirrorClient.prototype.applyServer = function (operation) {
    var isOutstandingOperation = this.outstanding && this.outstanding.id === operation.id;
    Client.prototype.applyServer.call(this, operation);

    if (!isOutstandingOperation) {
      var meta = operation.meta;
      this.updateUserCursor(meta.name, meta.cursor, meta.selectionEnd);
      this.transformUnredoStack(this.undoStack, operation);
      this.transformUnredoStack(this.redoStack, operation);
    }
  };

  CodeMirrorClient.prototype.initializeSocket = function () {
    var self = this;

    this.socket
      .on('user_joined', function (info) {
        self.onUserJoined(info);
      })
      .on('user_left', function (info) {
        self.onUserLeft(info);
      })
      .on('operation', function (operationObj) {
        var operation = Operation.fromJSON(operationObj);
        console.log("Operation from server by user " + operation.meta.name + ":", operation);
        self.applyServer(operation);
      })
      .on('cursor', function (update) {
        self.updateUserCursor(update.name, update.cursor, update.selectionEnd);
      });
  };

  CodeMirrorClient.prototype.onUserJoined = function (user) {
    console.log("User joined: ", user);
    this.users[user.name] = user;
    this.initializeUser(user);
  };

  CodeMirrorClient.prototype.onUserLeft = function (user) {
    console.log("User disconnected: " + user.name);
    removeElement(this.users[user.name].el);
    delete this.users[user.name];
  };

  CodeMirrorClient.prototype.initializeCodeMirror = function () {
    var cm = this.cm;
    var self = this;

    var oldOnChange = cm.getOption('onChange');
    cm.setOption('onChange', function (_, change) {
      self.onCodeMirrorChange(change);
      if (oldOnChange) { oldOnChange.call(this, cm, change); }
    });

    var oldOnCursorActivity = cm.getOption('onCursorActivity');
    cm.setOption('onCursorActivity', function (_) {
      self.onCodeMirrorCursorActivity();
      if (oldOnCursorActivity) { oldOnCursorActivity.call(this, cm); }
    });

    cm.undo = function () { self.undo(); };
    cm.redo = function () { self.redo(); };
  };

  CodeMirrorClient.prototype.initializeUsers = function () {
    var users = this.users;
    for (var name in users) {
      if (users.hasOwnProperty(name)) {
        users[name].name = name;
        this.initializeUser(users[name]);
      }
    }
  };

  CodeMirrorClient.prototype.initializeUser = function (user) {
    user.el = createUserElement(user.name);
    this.updateUserElementPosition(user);
    this.updateUserMark(user);
  };

  function cleanNoops (stack) {
    function isNoop (operation) {
      var ops = operation.ops;
      return ops.length === 0 || (ops.length === 1 && !!ops[0].retain);
    }

    while (stack.length > 0) {
      var operation = stack[stack.length - 1];
      if (isNoop(operation)) {
        stack.pop();
      } else {
        break;
      }
    }
  }

  var UNDO_DEPTH = 20;

  function cursorIndexAfterOperation (operation) {
    // TODO
    var ops = operation.ops;
    if (ops[0].retain) {
      var index = ops[0].retain;
      if (ops[1].insert) {
        return index + ops[1].insert.length;
      } else {
        return index;
      }
    } else if (ops[0].insert) {
      return ops[0].insert.length;
    } else {
      return 0;
    }
  }

  CodeMirrorClient.prototype.unredoHelper = function (sourceStack, targetStack) {
    cleanNoops(sourceStack);
    if (sourceStack.length === 0) { return; }
    var operation = sourceStack.pop();
    operation.revision = this.createOperation().revision;
    this.unredo = true;
    operation.applyToCodeMirror(this.cm);
    this.applyClient(operation);
    targetStack.push(operation.invert());

    var cursorPos = this.cm.posFromIndex(cursorIndexAfterOperation(operation));
    this.cm.setCursor(cursorPos);
  };

  CodeMirrorClient.prototype.transformUnredoStack = function (stack, operation) {
    cleanNoops(stack);
    for (var i = stack.length - 1; i >= 0; i--) {
      stack[i].revision = operation.revision;
      var transformedPair = Operation.transform(stack[i], operation);
      stack[i]  = transformedPair[0];
      operation = transformedPair[1];
    }
  };

  CodeMirrorClient.prototype.addOperationToUndo = function (operation) {
    function isSimpleOperation (operation, fn) {
      var ops = operation.ops;
      switch (ops.length) {
        case 0: return true;
        case 1: return !!fn(ops[0]);
        case 2: return !!((ops[0].retain && fn(ops[1])) || (fn(ops[0]) && ops[1].retain));
        case 3: return !!(ops[0].retain && fn(ops[1]) && ops[2].retain);
        default: return false;
      }
    }

    function isSimpleInsert (operation) {
      return isSimpleOperation(operation, function (op) { return op.insert; });
    }

    function isSimpleDelete (operation) {
      return isSimpleOperation(operation, function (op) { return op.delete; });
    }

    function shouldBeComposed (a, b) {
      if (isSimpleInsert(a) && isSimpleInsert(b)) {
        return isSimpleInsert(a.compose(b));
      } else if (isSimpleDelete(a) && isSimpleDelete(b)) {
        var opA = a.ops[0], opsB = b.ops;
        if (!opA.retain) { return false; }
        if (opsB[0].delete) {
          return opA.retain === opsB[0].delete.length;
        } else {
          return opA.retain === opsB[0].retain + opsB[1].delete.length;
        }
      }
      return false;
    }

    if (this.undoStack.length === 0) {
      this.undoStack.push(operation);
    } else {
      var lastOperation = this.undoStack[this.undoStack.length - 1];
      lastOperation.revision = operation.revision + 1;
      if (shouldBeComposed(operation, lastOperation)) {
        var composed = operation.compose(lastOperation);
        this.undoStack[this.undoStack.length - 1] = composed;
      } else {
        this.undoStack.push(operation);
        if (this.undoStack.length > UNDO_DEPTH) {
          this.undoStack.shift();
        }
      }
    }
    if (this.redoStack.length > 0) { this.redoStack = []; }
  };

  CodeMirrorClient.prototype.undo = function () {
    this.unredoHelper(this.undoStack, this.redoStack);
  };

  CodeMirrorClient.prototype.redo = function () {
    this.unredoHelper(this.redoStack, this.undoStack);
  };

  CodeMirrorClient.prototype.updateUserCursor = function (name, cursor, selectionEnd) {
    console.log(name + " moved his/her cursor: " + cursor);

    var user = this.users[name];
    user.cursor = cursor;
    user.selectionEnd = selectionEnd;

    this.updateUserElementPosition(user);
    this.updateUserMark(user);
  };

  CodeMirrorClient.prototype.updateUserElementPosition = function (user) {
    var pos = cm.posFromIndex(user.cursor);
    removeElement(user.el);
    this.cm.addWidget(pos, user.el, false);
  };

  CodeMirrorClient.prototype.updateUserMark = function (user) {
    if (user.mark) {
      user.mark.clear();
      delete user.mark;
    }
    if (user.selectionEnd !== user.cursor) {
      var from = Math.min(user.cursor, user.selectionEnd);
      var to   = Math.max(user.cursor, user.selectionEnd);
      var fromPos = cm.posFromIndex(from);
      var toPos   = cm.posFromIndex(to);
      user.mark = this.cm.markText(fromPos, toPos, 'other-user-selection');
    }
  };

  CodeMirrorClient.prototype.onCodeMirrorChange = function (change) {
    var cm = this.cm;
    try {
      if (!this.fromServer && !this.unredo) {
        var operation = this.createOperation()
          .fromCodeMirrorChange(change, this.oldValue);
        this.addOperationToUndo(operation.invert());
        this.applyClient(operation);
      }
    } finally {
      this.fromServer = false;
      this.unredo     = false;
      this.oldValue = cm.getValue();
    }
  };

  CodeMirrorClient.prototype.onCodeMirrorCursorActivity = function () {
    var cm = this.cm;
    function eqPos (a, b) {
      return a.line === b.line && a.ch === b.ch;
    }

    var cursorPos = cm.getCursor();
    var cursor = cm.indexFromPos(cursorPos);
    var selectionEnd;
    if (cm.somethingSelected()) {
      var startPos = cm.getCursor(true);
      var selectionEndPos = eqPos(cursorPos, startPos) ? cm.getCursor(false) : startPos;
      selectionEnd = cm.indexFromPos(selectionEndPos);
    } else {
      selectionEnd = cursor;
    }

    this.cursor = cursor;
    this.selectionEnd = selectionEnd;

    if (this.state === 'awaitingWithBuffer') {
      this.buffer.meta.cursor = cursor;
      this.buffer.meta.selectionEnd = selectionEnd;
    } else {
      var self = this;
      clearTimeout(this.sendCursorTimeout);
      this.sendCursorTimeout = setTimeout(function () {
        self.socket.emit('cursor', {
          cursor: cursor,
          selectionEnd: selectionEnd
        });
      }, 50);
    }
  };

  CodeMirrorClient.prototype.sendOperation = function (operation) {
    this.socket.emit('operation', operation);
  };

  CodeMirrorClient.prototype.applyOperation = function (operation) {
    this.fromServer = true;
    operation.applyToCodeMirror(this.cm);
  };
  
  function createUserElement (name) {
    var el = document.createElement('div');
    el.className = 'other-user';
    var pre = document.createElement('pre');
    pre.innerHTML = '&nbsp;';
    el.appendChild(pre);
    el.appendChild(document.createTextNode(name));
    return el;
  }

  // Set Const.prototype.__proto__ to Super.prototype
  function inherit (Const, Super) {
    function F () {}
    F.prototype = Super.prototype;
    Const.prototype = new F();
    Const.prototype.constructor = Const;
  }

  // Remove an element from the DOM.
  function removeElement (el) {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  return CodeMirrorClient;
})();