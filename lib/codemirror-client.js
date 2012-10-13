/*global ot */

ot.CodeMirrorClient = (function () {
  var Client = ot.Client;
  var Cursor = ot.Cursor;
  var UndoManager = ot.UndoManager;
  var TextOperation = ot.TextOperation;
  var WrappedOperation = ot.WrappedOperation;


  function SelfMeta (cursorBefore, cursorAfter) {
    this.cursorBefore = cursorBefore;
    this.cursorAfter  = cursorAfter;
  }

  SelfMeta.prototype.invert = function () {
    return new SelfMeta(this.cursorAfter, this.cursorBefore);
  };

  SelfMeta.prototype.compose = function (other) {
    return new SelfMeta(this.cursorBefore, other.cursorAfter);
  };

  SelfMeta.prototype.transform = function (operation) {
    return new SelfMeta(
      this.cursorBefore.transform(operation),
      this.cursorAfter.transform(operation)
    );
  };


  function OtherMeta (clientId, cursor) {
    this.clientId = clientId;
    this.cursor   = cursor;
  }

  OtherMeta.fromJSON = function (obj) {
    return new OtherMeta(obj.clientId, Cursor.fromJSON(obj.cursor));
  };

  OtherMeta.prototype.transform = function (operation) {
    return new OtherMeta(this.clientId, this.cursor.transform(operation));
  };


  function OtherClient (id, listEl, cm, name, cursor) {
    this.id = id;
    this.listEl = listEl;
    this.cm = cm;
    this.name = name;
    this.selectionClassName = 'client-selection-' + randomInt(1e6);

    this.li = document.createElement('li');
    if (name) {
      this.li.textContent = name;
      this.listEl.appendChild(this.li);
    }

    this.cursorEl = document.createElement('pre');
    this.cursorEl.className = 'other-client';
    this.cursorEl.style.borderLeftWidth = '2px';
    this.cursorEl.style.borderLeftStyle = 'solid';
    this.cursorEl.innerHTML = '&nbsp;';

    if (cursor) { this.updateCursor(cursor); }
    this.setColor(name ? hueFromName(name) : Math.random());
  }

  OtherClient.prototype.setColor = function (hue) {
    this.hue = hue;

    var color = hsl2hex(hue, 0.75, 0.5);
    if (this.li) { this.li.style.color = color; }
    this.cursorEl.style.borderLeftColor = color;

    var lightColor = hsl2hex(hue, 0.5, 0.9);
    var selector = '.' + this.selectionClassName;
    var styles = 'background:' + lightColor + ';';
    var rule = selector + '{' + styles + '}';
    addStyleRule(rule);
  };

  OtherClient.prototype.setName = function (name) {
    this.name = name;

    this.li.textContent = name;
    if (!this.li.parentNode) {
      this.listEl.appendChild(this.li);
    }

    this.setColor(hueFromName(name));
  };

  OtherClient.prototype.updateCursor = function (cursor) {
    this.cursor = cursor;

    removeElement(this.cursorEl);
    if (this.mark) {
      this.mark.clear();
      delete this.mark;
    }

    var cursorPos = this.cm.posFromIndex(cursor.position);
    if (cursor.position === cursor.selectionEnd) {
      // show cursor
      var cursorCoords = this.cm.cursorCoords(cursorPos);
      this.cursorEl.style.height = (cursorCoords.bottom - cursorCoords.top) * 0.85 + 'px';
      this.cm.addWidget(cursorPos, this.cursorEl, false);
    } else {
      // show selection
      var fromPos, toPos;
      if (cursor.selectionEnd > cursor.position) {
        fromPos = cursorPos;
        toPos = this.cm.posFromIndex(cursor.selectionEnd);
      } else {
        fromPos = this.cm.posFromIndex(cursor.selectionEnd);
        toPos = cursorPos;
      }
      this.mark = this.cm.markText(fromPos, toPos, this.selectionClassName);
    }
  };

  OtherClient.prototype.remove = function () {
    if (this.li) { removeElement(this.li); }
    if (this.cursorEl) { removeElement(this.cursorEl); }
    if (this.mark) { this.mark.clear(); }
  };


  function CodeMirrorClient (socket, cm) {
    this.socket = socket;
    this.cm = cm;
    this.fromServer = false;
    this.unredo = false;
    this.undoManager = new UndoManager();
    this.clients = {};
    this.initializeClientList();

    var self = this;
    socket.on('doc', function (obj) {
      Client.call(self, obj.revision);
      self.initializeCodeMirror(obj.str);
      self.initializeSocket();
      self.initializeClients(obj.clients);
    });
  }

  inherit(CodeMirrorClient, Client);

  CodeMirrorClient.prototype.initializeSocket = function () {
    var self = this;

    this.socket
      .on('client_left', function (obj) {
        self.onClientLeft(obj.clientId);
      })
      .on('set_name', function (obj) {
        var client = self.getClientObject(obj.clientId);
        client.setName(obj.name);
      })
      .on('ack', function () { self.serverAck(); })
      .on('operation', function (obj) {
        var operation = new WrappedOperation(
          TextOperation.fromJSON(obj.operation),
          OtherMeta.fromJSON(obj.meta)
        );
        console.log("Operation from server by client " + obj.meta.clientId + ":", operation);
        self.applyServer(operation);
      })
      .on('cursor', function (obj) {
        var client = self.getClientObject(obj.clientId);
        client.updateCursor(Cursor.fromJSON(obj.cursor));
      });
  };

  CodeMirrorClient.prototype.initializeCodeMirror = function (str) {
    var cm = this.cm;
    var self = this;

    cm.setValue(str);
    this.oldValue = str;

    cm.on('change', function (_, change) { self.onCodeMirrorChange(change); });
    cm.on('cursorActivity', function () { self.onCodeMirrorCursorActivity(); });

    cm.undo = function () { self.undo(); };
    cm.redo = function () { self.redo(); };
  };

  CodeMirrorClient.prototype.initializeClients = function (clients) {
    for (var clientId in clients) {
      if (clients.hasOwnProperty(clientId)) {
        var client = clients[clientId];
        client.clientId = clientId;
        this.clients[clientId] = new OtherClient(
          client.clientId, this.clientListEl, this.cm,
          client.name, client.cursor ? Cursor.fromJSON(client.cursor) : null
        );
      }
    }
  };

  CodeMirrorClient.prototype.getClientObject = function (clientId) {
    var client = this.clients[clientId];
    if (client) { return client; }
    return this.clients[clientId] = new OtherClient(clientId, this.clientListEl, this.cm);
  };

  CodeMirrorClient.prototype.onClientLeft = function (clientId) {
    console.log("User disconnected: " + clientId);
    var client = this.clients[clientId];
    if (!client) { return; }
    client.remove();
    delete this.clients[clientId];
  };

  CodeMirrorClient.prototype.initializeClientList = function () {
    this.clientListEl = document.createElement('ul');
  };

  CodeMirrorClient.prototype.applyUnredo = function (operation) {
    this.unredo = true;
    this.undoManager.add(operation.invert(this.oldValue));
    operation.wrapped.applyToCodeMirror(this.cm);
    this.cursor = operation.meta.cursorAfter;
    this.cm.setSelection(
      this.cm.posFromIndex(this.cursor.position),
      this.cm.posFromIndex(this.cursor.selectionEnd)
    );
    this.applyClient(operation);
  };

  CodeMirrorClient.prototype.undo = function () {
    var self = this;
    this.undoManager.performUndo(function (o) { self.applyUnredo(o); });
  };

  CodeMirrorClient.prototype.redo = function () {
    var self = this;
    this.undoManager.performRedo(function (o) { self.applyUnredo(o); });
  };

  CodeMirrorClient.prototype.onCodeMirrorChange = function (change) {
    var cm = this.cm;
    var oldValue = this.oldValue;
    this.oldValue = cm.getValue();
    var cursorBefore = this.cursor;
    this.updateCursor();
    try {
      if (!this.fromServer && !this.unredo) {
        var textOperation = TextOperation.fromCodeMirrorChange(change, oldValue);
        var meta = new SelfMeta(cursorBefore, this.cursor);
        var operation = new WrappedOperation(textOperation, meta);
        var compose = this.undoManager.undoStack.length > 0 &&
          !this.undoManager.dontCompose &&
          last(this.undoManager.undoStack).wrapped
            .invert(oldValue)
            .shouldBeComposedWith(textOperation);
        this.undoManager.add(operation.invert(oldValue), compose);
        this.applyClient(operation);
      }
    } finally {
      this.fromServer = false;
      this.unredo     = false;
    }
  };

  CodeMirrorClient.prototype.updateCursor = function () {
    function eqPos (a, b) { return a.line === b.line && a.ch === b.ch; }

    var cm = this.cm;
    var cursorPos = cm.getCursor();
    var position = cm.indexFromPos(cursorPos);
    var selectionEnd;
    if (cm.somethingSelected()) {
      var startPos = cm.getCursor(true);
      var selectionEndPos = eqPos(cursorPos, startPos) ? cm.getCursor(false) : startPos;
      selectionEnd = cm.indexFromPos(selectionEndPos);
    } else {
      selectionEnd = position;
    }

    this.cursor = new Cursor(position, selectionEnd);
  };

  CodeMirrorClient.prototype.onCodeMirrorCursorActivity = function () {
    var oldCursor = this.cursor;
    this.updateCursor();
    if (oldCursor && this.cursor.equals(oldCursor)) { return; }

    if (this.state instanceof Client.AwaitingWithBuffer) {
      this.state.buffer.meta.cursorAfter = this.cursor;
    } else {
      var self = this;
      this.socket.emit('cursor', this.cursor);
    }
  };

  CodeMirrorClient.prototype.sendOperation = function (revision, operation) {
    this.socket.emit('operation', {
      revision: revision,
      meta: { cursor: operation.meta.cursorAfter },
      operation: operation.wrapped.toJSON()
    });
  };

  CodeMirrorClient.prototype.applyOperation = function (operation) {
    this.fromServer = true;
    operation.wrapped.applyToCodeMirror(this.cm);
    var client = this.getClientObject(operation.meta.clientId);
    client.updateCursor(operation.meta.cursor);
    this.undoManager.transform(operation);
  };

  function randomInt (n) {
    return Math.floor(Math.random() * n);
  }

  function rgb2hex (r, g, b) {
    function digits (n) {
      var m = Math.round(255*n).toString(16);
      return m.length === 1 ? '0'+m : m;
    }
    return '#' + digits(r) + digits(g) + digits(b);
  }

  function hsl2hex (h, s, l) {
    if (s === 0) { return rgb2hex(l, l, l); }
    var var2 = l < 0.5 ? l * (1+s) : (l+s) - (s*l);
    var var1 = 2 * l - var2;
    var hue2rgb = function (hue) {
      if (hue < 0) { hue += 1; }
      if (hue > 1) { hue -= 1; }
      if (6*hue < 1) { return var1 + (var2-var1)*6*hue; }
      if (2*hue < 1) { return var2; }
      if (3*hue < 2) { return var1 + (var2-var1)*6*(2/3 - hue); }
      return var1;
    };
    return rgb2hex(hue2rgb(h+1/3), hue2rgb(h), hue2rgb(h-1/3));
  }

  function hueFromName (name) {
    var a = 1;
    for (var i = 0; i < name.length; i++) {
      a = 17 * (a+name.charCodeAt(i)) % 360;
    }
    return a/360;
  }

  // Set Const.prototype.__proto__ to Super.prototype
  function inherit (Const, Super) {
    function F () {}
    F.prototype = Super.prototype;
    Const.prototype = new F();
    Const.prototype.constructor = Const;
  }

  function last (arr) { return arr[arr.length - 1]; }

  // Remove an element from the DOM.
  function removeElement (el) {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  function addStyleRule (css) {
    try {
      var styleSheet = document.styleSheets.item(0),
          insertionPoint = (styleSheet.rules? styleSheet.rules:
              styleSheet.cssRules).length;
      styleSheet.insertRule(css, insertionPoint);
    } catch (exc) {
      console.error("Couldn't add style rule.", exc);
    }
  }

  return CodeMirrorClient;
}());
