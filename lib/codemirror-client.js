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
    this.onCodeMirrorCursorActivity();
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
          self.updateUserCursor(meta.name, meta.cursor, meta.selectionEnd);
        }
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
    if (!this.fromServer) {
      var operation = this.createOperation()
        .fromCodeMirrorChange(change, this.oldValue);
      operation.meta.cursor = this.cursor;
      operation.meta.selectionEnd = this.selectionEnd;
      clearTimeout(this.sendCursorTimeout);
      this.applyClient(operation);
    }
    this.oldValue = cm.getValue();
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