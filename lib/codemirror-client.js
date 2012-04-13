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

    this.initializeSocket();
    this.initializeCodeMirror();
    this.initializeUsers();
  }

  inherit(CodeMirrorClient, Client);

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

        var meta = operation.meta;
        if (meta.name !== self.name) {
          self.updateUserCursor(meta.name, meta.index, meta.otherIndex);
        }
      })
      .on('cursor', function (update) {
        self.updateUserCursor(update.name, update.index, update.otherIndex);
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

  CodeMirrorClient.prototype.updateUserCursor = function (name, cursor, otherCursor) {
    console.log(name + " moved his/her cursor: " + cursor);

    var user = this.users[name];
    user.cursor = cursor;
    user.otherCursor = otherCursor;

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
    if (user.otherCursor !== user.cursor) {
      var from = Math.min(user.cursor, user.otherCursor);
      var to   = Math.max(user.cursor, user.otherCursor);
      var fromPos = cm.posFromIndex(from);
      var toPos   = cm.posFromIndex(to);
      user.mark = this.cm.markText(fromPos, toPos, 'other-user-selection');
    }
  };

  CodeMirrorClient.prototype.onCodeMirrorChange = function (change) {
    var cm = this.cm;
    if (!this.fromServer) {
      var operation = this.createOperation()
        .fromCodeMirrorChange(change, this.oldValue);
      operation.meta.index = this.cursor;
      operation.meta.otherIndex = this.selectionEnd;
      clearTimeout(this.sendCursorTimeout);
      this.applyClient(operation);
    }
    this.oldValue = cm.getValue();
  };

  CodeMirrorClient.prototype.onCodeMirrorCursorActivity = function () {
    // TODO
    var cm = this.cm;
    function eqPos (a, b) {
      return a.line === b.line && a.ch === b.ch;
    }

    var cursorPos = cm.getCursor();
    var cursorIndex = cm.indexFromPos(cursorPos);
    if (cm.somethingSelected()) {
      var startPos = cm.getCursor(true);
      var otherPos = eqPos(cursorPos, startPos)
                   ? cm.getCursor(false)
                   : startPos;
      var otherIndex = cm.indexFromPos(otherPos);
    } else {
      var otherIndex = cursorIndex;
    }

    this.cursor = cursorIndex;
    this.selectionEnd = otherIndex;

    console.log("onCursorActivity", cursorPos, cursorIndex);
    if (this.state === 'awaitingWithBuffer') {
      this.buffer.meta.index = cursorIndex;
      this.buffer.meta.otherIndex = otherIndex;
    } else {
      var self = this;
      this.sendCursorTimeout = setTimeout(function () {
        self.socket.emit('cursor', { index: cursorIndex, otherIndex: otherIndex });
      }, 50);
    }
  };

  CodeMirrorClient.prototype.sendOperation = function (operation) {
    this.socket.emit('operation', operation);
  };

  CodeMirrorClient.prototype.applyOperation = function (operation) {
    this.fromServer = true;
    try {
      operation.applyToCodeMirror(this.cm);
    } finally {
      this.fromServer = false;
    }
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